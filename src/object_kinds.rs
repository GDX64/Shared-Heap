use std::collections::HashMap;

use crate::value::Something;

pub struct HashObject {
    pub properties: HashMap<ObjectKey, Something>,
}

pub struct BinViewObject {
    pub schema_key: u64,
    pub bytes: Vec<u8>,
}

pub struct SharedObject {
    pub schema_key: u64,
    pub properties: Vec<Something>,
}

impl SharedObject {
    pub fn new(schema_key: u64, size: usize) -> Self {
        SharedObject {
            schema_key,
            properties: vec![Something::Null; size],
        }
    }
}

pub enum HeapObj {
    Object(HashObject),
    Array(Vec<Something>),
    BinView(BinViewObject),
    SharedObj(SharedObject),
}

#[derive(Clone, Copy)]
pub enum HeapObjKind {
    Object = 0,
    Array = 1,
    BinView = 2,
    SharedObj = 3,
}

const BIT_MASK: u64 = 0b11;
impl HeapObjKind {
    pub fn mask_id(&self, id: u64) -> u64 {
        let my_id = *self as u64;
        return (id << 2) | my_id;
    }
}

#[derive(Clone, Copy, Hash, PartialEq, Eq)]
pub struct ObjectKey {
    key: u64,
}

impl ObjectKey {
    pub fn new(key: u64) -> Self {
        ObjectKey { key }
    }

    pub fn is_array_id(&self) -> bool {
        let id = self.key;
        (id & BIT_MASK) == (HeapObjKind::Array as u64)
    }

    pub fn is_object_id(&self) -> bool {
        let id = self.key;
        (id & BIT_MASK) == (HeapObjKind::Object as u64)
    }

    pub fn is_bin_view_id(&self) -> bool {
        let id = self.key;
        (id & BIT_MASK) == (HeapObjKind::BinView as u64)
    }

    pub fn is_shared_obj_id(&self) -> bool {
        let id = self.key;
        (id & BIT_MASK) == (HeapObjKind::SharedObj as u64)
    }
}

impl Into<u64> for ObjectKey {
    fn into(self) -> u64 {
        self.key as u64
    }
}

impl From<u64> for ObjectKey {
    fn from(value: u64) -> Self {
        ObjectKey { key: value }
    }
}
