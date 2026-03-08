use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

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
    last_id: u64,
}

pub struct Storage {
    inner: Mutex<InnerStorage>,
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
            inner: Mutex::new(InnerStorage {
                collection: HashMap::new(),
                last_id: 0,
            }),
        }
    }

    fn inner_guard(&self) -> MutexGuard<'_, InnerStorage> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn lock(&self, id: u64) -> bool {
        if let Some(object) = self.get_object(id) {
            object.lock();
            return true;
        }
        false
    }

    pub fn unlock(&self, id: u64) -> bool {
        if let Some(object) = self.get_object(id) {
            object.unlock();
            return true;
        }
        false
    }

    pub fn try_lock(&self, id: u64) -> bool {
        if let Some(object) = self.get_object(id) {
            return object.try_lock();
        }
        false
    }

    pub fn lock_pointer(&self, id: u64) -> *const i32 {
        if let Some(object) = self.get_object(id) {
            return object.lock_pointer();
        }
        std::ptr::null()
    }

    pub fn try_drop(&self, id: u64) -> Option<()> {
        let mut inner = self.inner_guard();
        inner.try_drop(id)
    }

    pub fn get_reference_count(&self, id: u64) -> Option<u32> {
        let inner = self.inner_guard();
        let obj = inner.collection.get(&id)?;
        Some(obj.strong_count() as u32)
    }

    pub fn increment_object_references(&self, id: u64) -> Option<bool> {
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
        let mut inner = self.inner_guard();
        inner.create_object(kind)
    }

    pub fn get_object(&self, id: u64) -> Option<Object> {
        let inner = self.inner_guard();
        inner.get_live_object(id)
    }

    pub fn set_object_property(&self, object_id: u64, key: u64, value: Something) {
        let mut inner = self.inner_guard();
        if let Some(object) = inner.get_live_object(object_id) {
            if let Some(Something::Ref { id, .. }) = object.set_property(key, value) {
                inner.cleanup_dead(id);
            }
        }
    }

    pub fn get_object_property(&self, object_id: u64, key: u64) -> Option<Something> {
        let inner = self.inner_guard();
        if let Some(object) = inner.get_live_object(object_id) {
            return object.get_property(key);
        }
        None
    }

    pub fn delete_object_property(&self, object_id: u64, key: u64) -> Option<Something> {
        let mut inner = self.inner_guard();
        let object = inner.get_live_object(object_id)?;
        let prop = object.delete_property(key)?;
        if let Something::Ref { id: to, .. } = &prop {
            inner.cleanup_dead(*to);
        }
        Some(prop)
    }

    pub fn create_reference(&self, id: u64) -> Option<Something> {
        let inner = self.inner_guard();
        let object = inner.get_live_object(id)?;
        Some(Something::Ref { id, object })
    }
}
