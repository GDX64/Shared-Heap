use crate::object_kinds::{HeapObjKind, ObjectKey};

pub struct ObjectCollection<T> {
    values: Vec<Option<T>>,
    next_base_id: u64,
}

impl<T> ObjectCollection<T> {
    pub const fn new() -> Self {
        ObjectCollection {
            values: Vec::new(),
            next_base_id: 0,
        }
    }

    fn key_index(key: ObjectKey) -> usize {
        let key: u64 = key.into();
        (key >> 2) as usize
    }

    pub fn create_key(&mut self, kind: HeapObjKind) -> ObjectKey {
        let key = kind.mask_id(self.next_base_id);
        self.next_base_id += 1;
        ObjectKey::from(key)
    }

    pub fn insert(&mut self, key: ObjectKey, value: T) -> Option<T> {
        let index = Self::key_index(key);
        if index >= self.values.len() {
            self.values.resize_with(index + 1, || None);
        }
        self.values[index].replace(value)
    }

    pub fn get(&self, key: ObjectKey) -> Option<&T> {
        let index = Self::key_index(key);
        self.values.get(index)?.as_ref()
    }

    pub fn remove(&mut self, key: ObjectKey) -> Option<T> {
        let index = Self::key_index(key);
        self.values.get_mut(index)?.take()
    }

    pub fn contains_key(&self, key: ObjectKey) -> bool {
        self.get(key).is_some()
    }
}
