use std::collections::HashMap;
use std::sync::{Arc, Weak};

use crate::value::Something;
use crate::w_mutex::{MutexWriteGuard, WasmMutex};

enum HeapObj {
    Object(HashObject),
    Array(Vec<Something>),
    BinView(BinViewObject),
    SharedObj(SharedObjObject),
}

#[derive(Clone, Copy)]
pub enum HeapObjKind {
    Object = 0,
    Array = 1,
    BinView = 2,
    SharedObj = 3,
}

impl HeapObjKind {
    pub fn mask_id(&self, id: u64) -> u64 {
        let my_id = *self as u64;
        return (id << 2) | my_id;
    }

    pub fn is_array_id(id: u64) -> bool {
        (id & 0b11) == (HeapObjKind::Array as u64)
    }

    pub fn is_object_id(id: u64) -> bool {
        (id & 0b11) == (HeapObjKind::Object as u64)
    }

    pub fn is_bin_view_id(id: u64) -> bool {
        (id & 0b11) == (HeapObjKind::BinView as u64)
    }

    pub fn is_shared_obj_id(id: u64) -> bool {
        (id & 0b11) == (HeapObjKind::SharedObj as u64)
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

struct SharedObjObject {
    schema_key: u64,
    properties: HashMap<u64, Something>,
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
            HeapObjKind::SharedObj => {
                HeapObj::SharedObj(SharedObjObject {
                    schema_key: 0,
                    properties: HashMap::new(),
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

    pub fn new_shared_obj(schema_key: u64) -> Self {
        Object {
            inner: Arc::new(WasmMutex::new(HeapObj::SharedObj(SharedObjObject {
                schema_key,
                properties: HashMap::new(),
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

    pub fn set_index(&self, index: usize, value: Something) {
        let mut inner = self.lock_inner();
        if let HeapObj::Array(arr) = &mut *inner {
            if let Some(elem) = arr.get_mut(index) {
                *elem = value;
            }
        } else {
            panic!("Cannot set index on non-array object");
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

    pub fn len(&self) -> usize {
        let inner = self.lock_inner();
        if let HeapObj::Array(arr) = &*inner {
            return arr.len();
        } else {
            panic!("Cannot get length of non-array object");
        }
    }

    pub fn set_property(&self, key: u64, value: Something) -> Option<Something> {
        let mut inner = self.lock_inner();
        match &mut *inner {
            HeapObj::Object(obj) => obj.properties.insert(key, value),
            HeapObj::SharedObj(obj) => obj.properties.insert(key, value),
            _ => {
                panic!("Cannot set property on non-object");
            }
        }
    }

    pub fn get_property(&self, key: u64) -> Option<Something> {
        let inner = self.lock_inner();
        match &*inner {
            HeapObj::Object(obj) => obj.properties.get(&key).cloned(),
            HeapObj::SharedObj(obj) => obj.properties.get(&key).cloned(),
            _ => {
                panic!("Cannot get property from non-object");
            }
        }
    }

    pub fn delete_property(&self, key: u64) -> Option<Something> {
        let mut inner = self.lock_inner();
        match &mut *inner {
            HeapObj::Object(obj) => obj.properties.remove(&key),
            HeapObj::SharedObj(obj) => obj.properties.remove(&key),
            _ => {
                panic!("Cannot delete property from non-object");
            }
        }
    }

    pub fn take_properties(&self) -> HashMap<u64, Something> {
        let mut inner = self.lock_inner();
        match &mut *inner {
            HeapObj::Object(obj) => std::mem::take(&mut obj.properties),
            HeapObj::SharedObj(obj) => std::mem::take(&mut obj.properties),
            _ => {
                panic!("Cannot take properties from non-object");
            }
        }
    }

    pub fn get_shared_obj_schema(&self) -> u64 {
        let inner = self.lock_inner();
        if let HeapObj::SharedObj(obj) = &*inner {
            obj.schema_key
        } else {
            panic!("Cannot get shared object schema from non-shared-object");
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
