use std::cell::RefCell;
use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};

use crate::object::{HeapObjKind, Object, WeakObject};
use crate::value::Something;
use crate::w_mutex::{MutexWriteGuard, WasmMutex};

const ARRAY_LENGTH_KEY: u64 = u64::MAX;

fn is_array_id(id: u64) -> bool {
    (id & 0b11) == (HeapObjKind::Array as u64)
}

fn is_bin_view_id(id: u64) -> bool {
    (id & 0b11) == (HeapObjKind::BinView as u64)
}

thread_local! {
    static LOCAL_OBJECTS: RefCell<HashMap<u64, Object, FastIDHasher>> = RefCell::new(HashMap::with_hasher(FastIDHasher::new()));
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
    collection: HashMap<u64, WeakObject, FastIDHasher>,
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
                collection: HashMap::with_hasher(FastIDHasher::new()),
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

    pub fn create_object(&self, kind: HeapObjKind) -> u64 {
        let mut inner = self.inner_guard();
        let base_id = inner.last_id;
        inner.last_id += 1;
        let id = kind.mask_id(base_id);

        let object = Object::new(kind);
        inner.collection.insert(id, object.downgrade());
        local_insert(id, object);
        id
    }

    pub fn create_bin_view(&self, schema_key: u64, size: usize) -> u64 {
        let mut inner = self.inner_guard();
        let base_id = inner.last_id;
        inner.last_id += 1;
        let id = HeapObjKind::BinView.mask_id(base_id);

        let object = Object::new_bin_view(schema_key, size);
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
        if is_array_id(object_id) {
            if key == ARRAY_LENGTH_KEY {
                if let Something::Int(length) = value {
                    self.array_set_length(object_id, length.max(0) as usize);
                }
            } else {
                self.array_set_index(object_id, key as usize, value);
            }
            return;
        }

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
        if is_array_id(object_id) {
            if key == ARRAY_LENGTH_KEY {
                return Some(Something::Int(self.array_len(object_id)? as i32));
            }
            return self.array_get_index(object_id, key as usize);
        }

        with_local_object(
            object_id,
            |object| object.get_property(key),
            || self.get_inner_object(object_id)?.get_property(key),
        )
    }

    pub fn delete_object_property(&self, object_id: u64, key: u64) -> Option<Something> {
        if is_array_id(object_id) {
            if key == ARRAY_LENGTH_KEY {
                return None;
            }
            return self.array_delete_index(object_id, key as usize);
        }

        let prop = with_local_object(
            object_id,
            |object| object.delete_property(key),
            || self.get_inner_object(object_id)?.delete_property(key),
        )?;
        Some(prop)
    }

    pub fn array_len(&self, array_id: u64) -> Option<usize> {
        with_local_object(
            array_id,
            |object| Some(object.len()),
            || Some(self.get_inner_object(array_id)?.len()),
        )
    }

    pub fn array_set_length(&self, array_id: u64, length: usize) {
        with_local_object(
            array_id,
            |object| {
                object.set_len(length);
            },
            || {
                let object = match self.get_inner_object(array_id) {
                    Some(object) => object,
                    None => return,
                };
                object.set_len(length);
            },
        )
    }

    pub fn array_get_index(&self, array_id: u64, index: usize) -> Option<Something> {
        with_local_object(
            array_id,
            |object| object.get_index(index),
            || self.get_inner_object(array_id)?.get_index(index),
        )
    }

    pub fn array_set_index(&self, array_id: u64, index: usize, value: Something) {
        let v1 = value.clone();
        let v2 = value;
        with_local_object(
            array_id,
            |object| {
                if index >= object.len() {
                    object.set_len(index + 1);
                }
                object.set_index(index, v1);
            },
            || {
                let object = match self.get_inner_object(array_id) {
                    Some(object) => object,
                    None => return,
                };
                if index >= object.len() {
                    object.set_len(index + 1);
                }
                object.set_index(index, v2);
            },
        )
    }

    pub fn array_delete_index(&self, array_id: u64, index: usize) -> Option<Something> {
        with_local_object(
            array_id,
            |object| object.delete_index(index),
            || self.get_inner_object(array_id)?.delete_index(index),
        )
    }

    pub fn get_bin_view_schema(&self, bin_view_id: u64) -> Option<u64> {
        if !is_bin_view_id(bin_view_id) {
            return None;
        }
        with_local_object(
            bin_view_id,
            |object| Some(object.get_bin_view_schema()),
            || Some(self.get_inner_object(bin_view_id)?.get_bin_view_schema()),
        )
    }

    pub fn get_bin_view_ptr(&self, bin_view_id: u64) -> Option<usize> {
        if !is_bin_view_id(bin_view_id) {
            return None;
        }
        with_local_object(
            bin_view_id,
            |object| Some(object.get_bin_view_ptr()),
            || Some(self.get_inner_object(bin_view_id)?.get_bin_view_ptr()),
        )
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

struct FastIDHasher {
    state: u64,
}

impl FastIDHasher {
    const fn new() -> Self {
        FastIDHasher { state: 0 }
    }
}

impl BuildHasher for FastIDHasher {
    type Hasher = Self;

    fn build_hasher(&self) -> Self::Hasher {
        FastIDHasher { state: 0 }
    }
}

impl Hasher for FastIDHasher {
    fn finish(&self) -> u64 {
        self.state
    }

    fn write_u64(&mut self, i: u64) {
        self.state = i;
    }

    fn write(&mut self, bytes: &[u8]) {
        panic!("FastIDHasher only supports hashing a single u64");
    }
}
