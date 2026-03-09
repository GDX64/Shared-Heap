use std::collections::HashMap;
use std::sync::{Arc, Weak};

use crate::value::Something;
use crate::w_mutex::{MutexWriteGuard, WasmMutex};

enum HeapObj {
    Object(HashObject),
    Array(Vec<Something>),
    BinView(BinViewObject),
}

#[derive(Clone, Copy)]
pub enum HeapObjKind {
    Object = 0,
    Array = 1,
    BinView = 2,
}

impl HeapObjKind {
    pub fn mask_id(&self, id: u64) -> u64 {
        let my_id = *self as u64;
        return (id << 2) | my_id;
    }
}

pub struct Object {
    inner: Arc<WasmMutex<HeapObj>>,
}

pub struct WeakObject {
    inner: Weak<WasmMutex<HeapObj>>,
}

struct HashObject {
    properties: HashMap<u64, Something>,
}

struct BinViewObject {
    schema_key: u64,
    bytes: Vec<u8>,
}

impl Object {
    pub fn new(kind: HeapObjKind) -> Self {
        let heap_obj = match kind {
            HeapObjKind::Object => {
                HeapObj::Object(HashObject {
                    properties: HashMap::new(),
                })
            }
            HeapObjKind::Array => HeapObj::Array(Vec::new()),
            HeapObjKind::BinView => {
                HeapObj::BinView(BinViewObject {
                    schema_key: 0,
                    bytes: Vec::new(),
                })
            }
        };
        Object {
            inner: Arc::new(WasmMutex::new(heap_obj)),
        }
    }

    pub fn new_bin_view(schema_key: u64, size: usize) -> Self {
        Object {
            inner: Arc::new(WasmMutex::new(HeapObj::BinView(BinViewObject {
                schema_key,
                bytes: vec![0; size],
            }))),
        }
    }

    fn lock_inner(&self) -> MutexWriteGuard<'_, HeapObj> {
        self.inner.write()
    }

    pub fn lock(&self) {
        self.inner.lock();
    }

    pub fn unlock(&self) {
        self.inner.unlock();
    }

    pub fn try_lock(&self) -> bool {
        self.inner.try_lock()
    }

    pub fn lock_pointer(&self) -> *const i32 {
        self.inner.pointer()
    }

    pub fn strong_count(&self) -> usize {
        return Arc::strong_count(&self.inner);
    }

    pub fn downgrade(&self) -> WeakObject {
        WeakObject {
            inner: Arc::downgrade(&self.inner),
        }
    }

    pub fn push(&self, value: Something) {
        let mut inner = self.lock_inner();
        if let HeapObj::Array(arr) = &mut *inner {
            arr.push(value);
        } else {
            panic!("Cannot push to non-array object");
        }
    }

    pub fn pop(&self) -> Option<Something> {
        let mut inner = self.lock_inner();
        if let HeapObj::Array(arr) = &mut *inner {
            return arr.pop();
        } else {
            panic!("Cannot pop from non-array object");
        }
    }

    pub fn get_index(&self, index: usize) -> Option<Something> {
        let inner = self.lock_inner();
        if let HeapObj::Array(arr) = &*inner {
            return arr.get(index).cloned();
        } else {
            panic!("Cannot get index from non-array object");
        }
    }

    pub fn set_index(&self, index: usize, value: Something) {
        let mut inner = self.lock_inner();
        if let HeapObj::Array(arr) = &mut *inner {
            if let Some(slot) = arr.get_mut(index) {
                *slot = value;
            } else {
                panic!("Cannot set out-of-bounds index on array object");
            }
        } else {
            panic!("Cannot set index on non-array object");
        }
    }

    pub fn len(&self) -> usize {
        let inner = self.lock_inner();
        if let HeapObj::Array(arr) = &*inner {
            return arr.len();
        } else {
            panic!("Cannot get length of non-array object");
        }
    }

    pub fn set_len(&self, target_len: usize) {
        let current_len = self.len();
        if target_len > current_len {
            for _ in current_len..target_len {
                self.push(Something::Null);
            }
        } else if target_len < current_len {
            for _ in target_len..current_len {
                self.pop();
            }
        }
    }

    pub fn delete_index(&self, index: usize) -> Option<Something> {
        let previous = self.get_index(index)?;
        self.set_index(index, Something::Null);
        Some(previous)
    }

    pub fn set_property(&self, key: u64, value: Something) -> Option<Something> {
        let mut inner = self.lock_inner();
        if let HeapObj::Object(obj) = &mut *inner {
            obj.properties.insert(key, value)
        } else {
            panic!("Cannot set property on non-object");
        }
    }

    pub fn get_property(&self, key: u64) -> Option<Something> {
        let inner = self.lock_inner();
        if let HeapObj::Object(obj) = &*inner {
            obj.properties.get(&key).cloned()
        } else {
            panic!("Cannot get property from non-object");
        }
    }

    pub fn delete_property(&self, key: u64) -> Option<Something> {
        let mut inner = self.lock_inner();
        if let HeapObj::Object(obj) = &mut *inner {
            obj.properties.remove(&key)
        } else {
            panic!("Cannot delete property from non-object");
        }
    }

    pub fn take_properties(&self) -> HashMap<u64, Something> {
        let mut inner = self.lock_inner();
        if let HeapObj::Object(obj) = &mut *inner {
            return std::mem::take(&mut obj.properties);
        } else {
            panic!("Cannot take properties from non-object");
        }
    }

    pub fn get_bin_view_schema(&self) -> u64 {
        let inner = self.lock_inner();
        if let HeapObj::BinView(view) = &*inner {
            view.schema_key
        } else {
            panic!("Cannot get bin view schema from non-binview object");
        }
    }

    pub fn get_bin_view_ptr(&self) -> usize {
        let inner = self.lock_inner();
        if let HeapObj::BinView(view) = &*inner {
            view.bytes.as_ptr() as usize
        } else {
            panic!("Cannot get bin view pointer from non-binview object");
        }
    }
}

impl WeakObject {
    pub fn upgrade(&self) -> Option<Object> {
        let inner = self.inner.upgrade()?;
        Some(Object { inner })
    }

    pub fn strong_count(&self) -> usize {
        self.inner.strong_count()
    }
}

impl Clone for Object {
    fn clone(&self) -> Self {
        Object {
            inner: Arc::clone(&self.inner),
        }
    }
}

impl Clone for WeakObject {
    fn clone(&self) -> Self {
        WeakObject {
            inner: Weak::clone(&self.inner),
        }
    }
}
