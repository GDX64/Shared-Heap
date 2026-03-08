use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use crate::my_rwlock::ThreadLock;
use crate::object::{Object, WeakObject};
use crate::value::Something;

thread_local! {
    static LOCAL_OBJECTS: RefCell<HashMap<u64, Object>> = RefCell::new(HashMap::new());
}

fn local_get(id: u64) -> Option<Object> {
    LOCAL_OBJECTS.with(|objects| objects.borrow().get(&id).cloned())
}

fn local_insert(id: u64, object: Object) {
    LOCAL_OBJECTS.with(|objects| {
        objects.borrow_mut().insert(id, object);
    });
}

fn local_remove(id: u64) -> Option<Object> {
    LOCAL_OBJECTS.with(|objects| objects.borrow_mut().remove(&id))
}

pub enum ObjectKind {
    Object = 0,
    Array = 1,
}

struct InnerStorage {
    collection: HashMap<u64, WeakObject>,
    blobs: HashMap<u64, Vec<u8>>,
    last_id: u64,
}

pub struct Storage {
    lock: ThreadLock,
    inner: Mutex<InnerStorage>,
}

struct LockGuard<'a> {
    lock: &'a ThreadLock,
}

impl Drop for LockGuard<'_> {
    fn drop(&mut self) {
        self.lock.release_write();
    }
}

impl InnerStorage {
    fn object_id(&mut self) -> u64 {
        let id = self.last_id;
        self.last_id += 1;
        return id << 1;
    }

    fn array_id(&mut self) -> u64 {
        let id = self.last_id;
        self.last_id += 1;
        return (id << 1) | 0b1;
    }

    fn cleanup_dead(&mut self, id: u64) {
        let remove = self
            .collection
            .get(&id)
            .map(|w| w.strong_count() == 0)
            .unwrap_or(false);
        if remove {
            self.collection.remove(&id);
        }
    }

    fn get_live_object(&self, id: u64) -> Option<Object> {
        if let Some(object) = local_get(id) {
            return Some(object);
        }

        let weak = self.collection.get(&id)?;
        let object = weak.upgrade()?;
        local_insert(id, object.clone());
        Some(object)
    }

    fn try_drop(&mut self, id: u64) -> Option<()> {
        if local_remove(id).is_none() && !self.collection.contains_key(&id) {
            return None;
        }
        self.cleanup_dead(id);
        Some(())
    }

    fn create_object(&mut self, kind: ObjectKind) -> u64 {
        let id = match kind {
            ObjectKind::Object => self.object_id(),
            ObjectKind::Array => self.array_id(),
        };
        let object = Object::new();
        self.collection.insert(id, object.downgrade());
        local_insert(id, object);
        id
    }
}

impl Storage {
    pub fn new() -> Self {
        Storage {
            lock: ThreadLock::new(),
            inner: Mutex::new(InnerStorage {
                collection: HashMap::new(),
                blobs: HashMap::new(),
                last_id: 0,
            }),
        }
    }

    fn write_lock(&self) -> LockGuard<'_> {
        self.lock.lock_write();
        LockGuard { lock: &self.lock }
    }

    fn inner_guard(&self) -> MutexGuard<'_, InnerStorage> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn lock(&self) {
        self.lock.global_lock_write();
    }

    pub fn unlock(&self) {
        self.lock.release_global_write();
    }

    pub fn try_lock(&self) -> bool {
        self.lock.try_global_lock_write()
    }

    pub fn lock_pointer(&self) -> *const i32 {
        self.lock.pointer()
    }

    pub fn try_drop(&self, id: u64) -> Option<()> {
        let _guard = self.write_lock();
        let mut inner = self.inner_guard();
        inner.try_drop(id)
    }

    pub fn get_reference_count(&self, id: u64) -> Option<u32> {
        let _guard = self.write_lock();
        let inner = self.inner_guard();
        let obj = inner.collection.get(&id)?;
        Some(obj.strong_count() as u32)
    }

    pub fn get_blob_pointer(&self, id: u64) -> Option<(*const u8, usize)> {
        let _guard = self.write_lock();
        let inner = self.inner_guard();
        let blob = inner.blobs.get(&id)?;
        Some((blob.as_ptr(), blob.len()))
    }

    pub fn add_blob(&self, data: Vec<u8>) -> u64 {
        let _guard = self.write_lock();
        let mut inner = self.inner_guard();
        let id = inner.last_id;
        inner.last_id += 1;
        inner.blobs.insert(id, data);
        id
    }

    pub fn increment_object_references(&self, id: u64) -> Option<bool> {
        let _guard = self.write_lock();
        let inner = self.inner_guard();
        if local_get(id).is_some() {
            return Some(true);
        }

        let weak = inner.collection.get(&id)?;
        let object = weak.upgrade()?;
        local_insert(id, object);
        Some(true)
    }

    pub fn create_object(&self, kind: ObjectKind) -> u64 {
        let _guard = self.write_lock();
        let mut inner = self.inner_guard();
        inner.create_object(kind)
    }

    pub fn get_object(&self, id: u64) -> Option<Object> {
        let _guard = self.write_lock();
        let inner = self.inner_guard();
        inner.get_live_object(id)
    }

    pub fn set_object_property(&self, object_id: u64, key: u64, value: Something) {
        let _guard = self.write_lock();
        let mut inner = self.inner_guard();
        if let Some(object) = inner.get_live_object(object_id) {
            if let Some(Something::Ref { id, .. }) = object.set_property(key, value) {
                inner.cleanup_dead(id);
            }
        }
    }

    pub fn get_object_property(&self, object_id: u64, key: u64) -> Option<Something> {
        let _guard = self.write_lock();
        let inner = self.inner_guard();
        if let Some(object) = inner.get_live_object(object_id) {
            return object.get_property(key);
        }
        None
    }

    pub fn delete_object_property(&self, object_id: u64, key: u64) -> Option<Something> {
        let _guard = self.write_lock();
        let mut inner = self.inner_guard();
        let object = inner.get_live_object(object_id)?;
        let prop = object.delete_property(key)?;
        if let Something::Ref { id: to, .. } = &prop {
            inner.cleanup_dead(*to);
        }
        Some(prop)
    }

    pub fn create_reference(&self, id: u64) -> Option<Something> {
        let _guard = self.write_lock();
        let inner = self.inner_guard();
        let object = inner.get_live_object(id)?;
        Some(Something::Ref { id, object })
    }
}
