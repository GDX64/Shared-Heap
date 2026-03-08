use crate::object::Object;
use std::sync::Arc;
const INT_TAG: u8 = 0;
const VALUE_STRING_TAG: u8 = 1;
const NULL_TAG: u8 = 2;
const FLOAT_TAG: u8 = 3;
pub const ROW_TAG: u8 = 4;
pub const TABLE_TAG: u8 = 5;
pub const BLOB_TAG: u8 = 6;

#[derive(Clone)]
pub enum Something {
    Int(i32),
    Float(f64),
    String(Vec<u8>),
    Blob(Arc<Vec<u8>>),
    Ref { id: u64, object: Object },
    Null,
}

impl Default for Something {
    fn default() -> Self {
        Something::Null
    }
}

impl Something {
    pub fn tag(&self) -> u8 {
        use Something::*;
        match self {
            Int(_) => INT_TAG,
            String(_) => VALUE_STRING_TAG,
            Null => NULL_TAG,
            Float(_) => FLOAT_TAG,
            Blob(_) => BLOB_TAG,
            Ref { .. } => ROW_TAG,
        }
    }

    pub fn string(s: Vec<u8>) -> Self {
        Something::String(s)
    }
}

impl std::fmt::Debug for Something {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Something::Int(v) => f.debug_tuple("Int").field(v).finish(),
            Something::Float(v) => f.debug_tuple("Float").field(v).finish(),
            Something::String(v) => f.debug_tuple("String").field(v).finish(),
            Something::Blob(v) => f.debug_tuple("Blob").field(v).finish(),
            Something::Ref { id, .. } => f.debug_struct("Ref").field("id", id).finish(),
            Something::Null => f.write_str("Null"),
        }
    }
}

impl PartialEq for Something {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Something::Int(a), Something::Int(b)) => a == b,
            (Something::Float(a), Something::Float(b)) => a == b,
            (Something::String(a), Something::String(b)) => a == b,
            (Something::Blob(a), Something::Blob(b)) => a == b,
            (Something::Ref { id: a, .. }, Something::Ref { id: b, .. }) => a == b,
            (Something::Null, Something::Null) => true,
            _ => false,
        }
    }
}
