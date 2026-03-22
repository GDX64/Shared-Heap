use std::collections::HashMap;
use std::sync::{Arc, Weak};

use crate::object_kinds::{
    BinViewObject, HashObject, HeapObj, HeapObjKind, ObjectKey, SharedObject,
};
use crate::value::Something;
use crate::w_mutex::{MutexWriteGuard, WasmMutex};

pub struct Object {
    inner: Arc<WasmMutex<HeapObj>>,
}

pub struct WeakObject {
    inner: Weak<WasmMutex<HeapObj>>,
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
                HeapObj::SharedObj(SharedObject {
                    schema_key: 0,
                    properties: Vec::new(),
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

    pub fn new_shared_obj(schema_key: u64, size: usize) -> Self {
        Object {
            inner: Arc::new(WasmMutex::new(HeapObj::SharedObj(SharedObject::new(
                schema_key, size,
            )))),
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

    pub fn set_property(&self, key: ObjectKey, value: Something) -> Option<Something> {
        let mut inner = self.lock_inner();
        let index = <ObjectKey as Into<u64>>::into(key) as usize;
        match &mut *inner {
            HeapObj::Object(obj) => obj.properties.insert(key, value),
            HeapObj::SharedObj(obj) => {
                if let Some(existing) = obj.properties.get_mut(index) {
                    Some(std::mem::replace(existing, value))
                } else {
                    None
                }
            }
            _ => {
                panic!("Cannot set property on non-object");
            }
        }
    }

    pub fn get_property(&self, key: ObjectKey) -> Option<Something> {
        let inner = self.lock_inner();
        let index = <ObjectKey as Into<u64>>::into(key) as usize;
        match &*inner {
            HeapObj::Object(obj) => obj.properties.get(&key).cloned(),
            HeapObj::SharedObj(obj) => obj.properties.get(index).cloned(),
            _ => {
                panic!("Cannot get property from non-object");
            }
        }
    }

    pub fn delete_property(&self, key: ObjectKey) -> Option<Something> {
        let mut inner = self.lock_inner();
        let index = <ObjectKey as Into<u64>>::into(key) as usize;
        match &mut *inner {
            HeapObj::Object(obj) => obj.properties.remove(&key),
            HeapObj::SharedObj(obj) => {
                if let Some(existing) = obj.properties.get_mut(index) {
                    Some(std::mem::replace(existing, Something::Null))
                } else {
                    None
                }
            }
            _ => {
                panic!("Cannot delete property from non-object");
            }
        }
    }

    pub fn take_properties(&self) -> HashMap<ObjectKey, Something> {
        let mut inner = self.lock_inner();
        match &mut *inner {
            HeapObj::Object(obj) => std::mem::take(&mut obj.properties),
            HeapObj::SharedObj(_obj) => {
                panic!("Cannot take properties from shared object");
            }
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
