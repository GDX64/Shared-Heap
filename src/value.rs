use std::hash::Hash;

const INT_TAG: u8 = 0;
const VALUE_STRING_TAG: u8 = 1;
const NULL_TAG: u8 = 2;
const FLOAT_TAG: u8 = 3;
pub const ROW_TAG: u8 = 4;
pub const TABLE_TAG: u8 = 5;
pub const BLOB_TAG: u8 = 6;

#[derive(Debug, Clone, PartialEq, PartialOrd)]
pub enum Something {
    Int(i32),
    Float(f64),
    String(Vec<u8>),
    Blob(u64),
    Ref(u64),
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
            Ref(_) => ROW_TAG,
        }
    }

    pub fn string(s: Vec<u8>) -> Self {
        Something::String(s)
    }
}

impl Hash for Something {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        use Something::*;
        state.write_u8(self.tag());
        match self {
            Int(v) => {
                v.hash(state);
            }
            String(v) => {
                v.hash(state);
            }
            Float(v) => {
                let bits = v.to_le_bytes();
                bits.hash(state);
            }
            Blob(v) => {
                v.hash(state);
            }
            Null => {}
            Ref(v) => {
                v.hash(state);
            }
        }
    }
}

impl Eq for Something {}
