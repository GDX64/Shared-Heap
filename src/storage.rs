use std::cell::RefCell;
use std::collections::HashMap;

use crate::fast_id_hasher::FastIDHasher;
use crate::object::{HeapObjKind, Object, ObjectKey, WeakObject};
use crate::value::Something;
use crate::w_mutex::{MutexWriteGuard, WasmMutex};

thread_local! {
    static LOCAL_OBJECTS: RefCell<HashMap<ObjectKey, Object, FastIDHasher>> = RefCell::new(HashMap::with_hasher(FastIDHasher::new()));
}

fn with_local_object<FLocal, FMissing, R>(
    id: ObjectKey,
    on_local: FLocal,
    on_missing: FMissing,
) -> R
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

fn local_insert(id: ObjectKey, object: Object) {
    LOCAL_OBJECTS.with(|objects| {
        objects.borrow_mut().insert(id, object);
    });
}

fn local_remove(id: ObjectKey) -> Option<Object> {
    LOCAL_OBJECTS.with(|objects| objects.borrow_mut().remove(&id))
}

pub enum ObjectKind {
    Object = 0,
    Array = 1,
}

struct InnerStorage {
    collection: HashMap<ObjectKey, WeakObject, FastIDHasher>,
    last_id: u64,
}

pub struct Storage {
    inner: WasmMutex<InnerStorage>,
}

fn cleanup_dead(inner: &mut InnerStorage, id: ObjectKey) {
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
                collection: HashMap::with_hasher(FastIDHasher::new()),
                last_id: 0,
            }),
        }
    }

    fn inner_guard(&self) -> MutexWriteGuard<'_, InnerStorage> {
        self.inner.write()
    }

    pub fn lock(&self, id: u64) -> bool {
        let object_key = ObjectKey::from(id);
        with_local_object(
            object_key,
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
        let object_key = ObjectKey::from(id);
        with_local_object(
            object_key,
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
        let object_key = ObjectKey::from(id);
        with_local_object(
            object_key,
            |object| object.try_lock(),
            || {
                panic!("Cannot lock object that is not in local storage. Object ID: {id}");
            },
        )
    }

    pub fn lock_pointer(&self, id: u64) -> *const i32 {
        let object_key = ObjectKey::from(id);
        with_local_object(
            object_key,
            |object| object.lock_pointer(),
            || {
                panic!("Cannot lock object that is not in local storage. Object ID: {id}");
            },
        )
    }

    pub fn try_drop(&self, id: u64) -> Option<()> {
        let object_key = ObjectKey::from(id);
        let had_local = local_remove(object_key).is_some();
        let mut inner = self.inner_guard();
        if !had_local && !inner.collection.contains_key(&object_key) {
            return None;
        }
        cleanup_dead(&mut inner, object_key);
        Some(())
    }

    pub fn get_reference_count(&self, id: u64) -> Option<u32> {
        let object_key = ObjectKey::from(id);
        with_local_object(
            object_key,
            |object| Some(object.strong_count() as u32),
            || {
                let inner = self.inner_guard();
                let obj = inner.collection.get(&object_key)?;
                Some(obj.strong_count() as u32)
            },
        )
    }

    pub fn increment_object_references(&self, id: u64) -> Option<bool> {
        let object_key = ObjectKey::from(id);
        with_local_object(
            object_key,
            |_object| Some(true),
            || self.get_inner_object(object_key).map(|_| true),
        )
    }

    pub fn create_object(&self, kind: HeapObjKind) -> u64 {
        let mut inner = self.inner_guard();
        let base_id = inner.last_id;
        inner.last_id += 1;
        let id = kind.mask_id(base_id);
        let object_key = ObjectKey::from(id);

        let object = Object::new(kind);
        inner.collection.insert(object_key, object.downgrade());
        local_insert(object_key, object);
        id
    }

    pub fn create_bin_view(&self, schema_key: u64, size: usize) -> u64 {
        let mut inner = self.inner_guard();
        let base_id = inner.last_id;
        inner.last_id += 1;
        let id = HeapObjKind::BinView.mask_id(base_id);
        let object_key = ObjectKey::from(id);

        let object = Object::new_bin_view(schema_key, size);
        inner.collection.insert(object_key, object.downgrade());
        local_insert(object_key, object);
        id
    }

    pub fn create_shared_obj(&self, schema_key: u64) -> u64 {
        let mut inner = self.inner_guard();
        let base_id = inner.last_id;
        inner.last_id += 1;
        let id = HeapObjKind::SharedObj.mask_id(base_id);
        let object_key = ObjectKey::from(id);

        let object = Object::new_shared_obj(schema_key);
        inner.collection.insert(object_key, object.downgrade());
        local_insert(object_key, object);
        id
    }

    pub fn get_object(&self, id: u64) -> Option<Object> {
        let object_key = ObjectKey::from(id);
        with_local_object(
            object_key,
            |object| Some(object.clone()),
            || self.get_inner_object(object_key),
        )
    }

    pub fn set_object_property(&self, object_id: u64, key: u64, value: Something) {
        let object_key = ObjectKey::from(object_id);
        let property_key = ObjectKey::from(key);
        let v1 = value.clone();
        let v2 = value;
        with_local_object(
            object_key,
            |object| {
                object.set_property(property_key, v1);
            },
            || {
                let object = match self.get_inner_object(object_key) {
                    Some(object) => object,
                    None => return,
                };
                object.set_property(property_key, v2);
            },
        )
    }

    pub fn get_object_property(&self, object_id: u64, key: u64) -> Option<Something> {
        let object_key = ObjectKey::from(object_id);
        let property_key = ObjectKey::from(key);
        with_local_object(
            object_key,
            |object| object.get_property(property_key),
            || {
                self.get_inner_object(object_key)?
                    .get_property(property_key)
            },
        )
    }

    pub fn delete_object_property(&self, object_id: u64, key: u64) -> Option<Something> {
        let object_key = ObjectKey::from(object_id);
        let property_key = ObjectKey::from(key);
        let prop = with_local_object(
            object_key,
            |object| object.delete_property(property_key),
            || {
                self.get_inner_object(object_key)?
                    .delete_property(property_key)
            },
        )?;
        Some(prop)
    }

    pub fn array_len(&self, array_id: u64) -> Option<usize> {
        let object_key = ObjectKey::from(array_id);
        with_local_object(
            object_key,
            |object| Some(object.len()),
            || Some(self.get_inner_object(object_key)?.len()),
        )
    }

    pub fn array_pop(&self, array_id: u64) -> Option<Something> {
        let object_key = ObjectKey::from(array_id);
        with_local_object(
            object_key,
            |object| object.pop(),
            || self.get_inner_object(object_key)?.pop(),
        )
    }

    pub fn array_set_index(&self, array_id: u64, index: usize, value: Something) {
        let object_key = ObjectKey::from(array_id);
        let v1 = value.clone();
        let v2 = value;
        with_local_object(
            object_key,
            |object| {
                object.set_index(index, v1);
            },
            || {
                let object = match self.get_inner_object(object_key) {
                    Some(object) => object,
                    None => return,
                };
                object.set_index(index, v2);
            },
        )
    }

    pub fn array_push(&self, array_id: u64, value: Something) {
        let object_key = ObjectKey::from(array_id);
        let v1 = value.clone();
        with_local_object(
            object_key,
            |object| {
                object.push(value);
            },
            || {
                let object = match self.get_inner_object(object_key) {
                    Some(object) => object,
                    None => return,
                };
                object.push(v1);
            },
        )
    }

    pub fn array_get_index(&self, array_id: u64, index: usize) -> Option<Something> {
        let object_key = ObjectKey::from(array_id);
        with_local_object(
            object_key,
            |object| object.get_index(index),
            || self.get_inner_object(object_key)?.get_index(index),
        )
    }

    pub fn get_bin_view_schema(&self, bin_view_id: u64) -> Option<u64> {
        let id = ObjectKey::from(bin_view_id);
        if !id.is_bin_view_id() {
            return None;
        }
        let object_key = ObjectKey::from(bin_view_id);
        with_local_object(
            object_key,
            |object| Some(object.get_bin_view_schema()),
            || Some(self.get_inner_object(object_key)?.get_bin_view_schema()),
        )
    }

    pub fn get_bin_view_ptr(&self, bin_view_id: u64) -> Option<usize> {
        let id = ObjectKey::from(bin_view_id);
        if !id.is_bin_view_id() {
            return None;
        }
        let object_key = ObjectKey::from(bin_view_id);
        with_local_object(
            object_key,
            |object| Some(object.get_bin_view_ptr()),
            || Some(self.get_inner_object(object_key)?.get_bin_view_ptr()),
        )
    }

    pub fn get_shared_obj_schema(&self, shared_obj_id: u64) -> Option<u64> {
        let id = ObjectKey::from(shared_obj_id);
        if !id.is_shared_obj_id() {
            return None;
        }
        let object_key = ObjectKey::from(shared_obj_id);
        with_local_object(
            object_key,
            |object| Some(object.get_shared_obj_schema()),
            || Some(self.get_inner_object(object_key)?.get_shared_obj_schema()),
        )
    }

    fn get_inner_object(&self, id: ObjectKey) -> Option<Object> {
        let inner = self.inner_guard();
        let weak = inner.collection.get(&id)?;
        let object = weak.upgrade()?;
        local_insert(id, object.clone());
        Some(object)
    }

    pub fn create_reference(&self, id: u64) -> Option<Something> {
        let object_key = ObjectKey::from(id);
        with_local_object(
            object_key,
            |object| {
                Some(Something::Ref {
                    id,
                    object: object.clone(),
                })
            },
            || {
                Some(Something::Ref {
                    id,
                    object: self.get_inner_object(object_key)?,
                })
            },
        )
    }
}
