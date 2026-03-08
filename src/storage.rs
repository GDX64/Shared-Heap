use std::cell::RefCell;
use std::collections::HashMap;

use crate::object::{Object, WeakObject};
use crate::value::Something;
use crate::w_mutex::{MutexWriteGuard, WasmMutex};

thread_local! {
    static LOCAL_OBJECTS: RefCell<HashMap<u64, Object>> = RefCell::new(HashMap::new());
}

fn with_local_object<FLocal, FMissing, R>(id: u64, on_local: FLocal, on_missing: FMissing) -> R
where
    FLocal: FnOnce(&Object) -> R,
    FMissing: FnOnce() -> R,
{
    LOCAL_OBJECTS.with(|objects| {
        let objects = objects.borrow();
        if let Some(object) = objects.get(&id) {
            return on_local(object);
        }
        drop(objects);
        on_missing()
    })
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
    inner: WasmMutex<InnerStorage>,
}

fn cleanup_dead(inner: &mut InnerStorage, id: u64) {
    let remove = inner
        .collection
        .get(&id)
        .map(|w| w.strong_count() == 0)
        .unwrap_or(false);
    if remove {
        inner.collection.remove(&id);
    }
}

impl Storage {
    pub fn new() -> Self {
        Storage {
            inner: WasmMutex::new(InnerStorage {
                collection: HashMap::new(),
                last_id: 0,
            }),
        }
    }

    fn inner_guard(&self) -> MutexWriteGuard<'_, InnerStorage> {
        self.inner.write()
    }

    pub fn lock(&self, id: u64) -> bool {
        with_local_object(
            id,
            |object| {
                object.lock();
                true
            },
            || {
                panic!("Cannot lock object that is not in local storage. Object ID: {id}");
            },
        )
    }

    pub fn unlock(&self, id: u64) -> bool {
        with_local_object(
            id,
            |object| {
                object.unlock();
                true
            },
            || {
                panic!("Cannot unlock object that is not in local storage. Object ID: {id}");
            },
        )
    }

    pub fn try_lock(&self, id: u64) -> bool {
        with_local_object(
            id,
            |object| object.try_lock(),
            || {
                panic!("Cannot lock object that is not in local storage. Object ID: {id}");
            },
        )
    }

    pub fn lock_pointer(&self, id: u64) -> *const i32 {
        with_local_object(
            id,
            |object| object.lock_pointer(),
            || {
                panic!("Cannot lock object that is not in local storage. Object ID: {id}");
            },
        )
    }

    pub fn try_drop(&self, id: u64) -> Option<()> {
        let had_local = local_remove(id).is_some();
        let mut inner = self.inner_guard();
        if !had_local && !inner.collection.contains_key(&id) {
            return None;
        }
        cleanup_dead(&mut inner, id);
        Some(())
    }

    pub fn get_reference_count(&self, id: u64) -> Option<u32> {
        with_local_object(
            id,
            |object| Some(object.strong_count() as u32),
            || {
                let inner = self.inner_guard();
                let obj = inner.collection.get(&id)?;
                Some(obj.strong_count() as u32)
            },
        )
    }

    pub fn increment_object_references(&self, id: u64) -> Option<bool> {
        with_local_object(
            id,
            |_object| Some(true),
            || self.get_inner_object(id).map(|_| true),
        )
    }

    pub fn create_object(&self, kind: ObjectKind) -> u64 {
        let mut inner = self.inner_guard();
        let base_id = inner.last_id;
        inner.last_id += 1;
        let id = match kind {
            ObjectKind::Object => base_id << 1,
            ObjectKind::Array => (base_id << 1) | 0b1,
        };

        let object = Object::new();
        inner.collection.insert(id, object.downgrade());
        local_insert(id, object);
        id
    }

    pub fn get_object(&self, id: u64) -> Option<Object> {
        with_local_object(
            id,
            |object| Some(object.clone()),
            || self.get_inner_object(id),
        )
    }

    pub fn set_object_property(&self, object_id: u64, key: u64, value: Something) {
        let v1 = value.clone();
        let v2 = value;
        with_local_object(
            object_id,
            |object| {
                object.set_property(key, v1);
            },
            || {
                let object = match self.get_inner_object(object_id) {
                    Some(object) => object,
                    None => return,
                };
                object.set_property(key, v2);
            },
        )
    }

    pub fn get_object_property(&self, object_id: u64, key: u64) -> Option<Something> {
        with_local_object(
            object_id,
            |object| object.get_property(key),
            || self.get_inner_object(object_id)?.get_property(key),
        )
    }

    pub fn delete_object_property(&self, object_id: u64, key: u64) -> Option<Something> {
        let prop = with_local_object(
            object_id,
            |object| object.delete_property(key),
            || self.get_inner_object(object_id)?.delete_property(key),
        )?;
        Some(prop)
    }

    fn get_inner_object(&self, id: u64) -> Option<Object> {
        let inner = self.inner_guard();
        let weak = inner.collection.get(&id)?;
        let object = weak.upgrade()?;
        local_insert(id, object.clone());
        Some(object)
    }

    pub fn create_reference(&self, id: u64) -> Option<Something> {
        with_local_object(
            id,
            |object| {
                Some(Something::Ref {
                    id,
                    object: object.clone(),
                })
            },
            || {
                Some(Something::Ref {
                    id,
                    object: self.get_inner_object(id)?,
                })
            },
        )
    }
}
