use crate::object_kinds::{HeapObjKind, ObjectKey};

const INDEX_BITS: u64 = 32;
const INDEX_MASK: u64 = (1u64 << INDEX_BITS) - 1;

struct Slot<T> {
    generation: u32,
    value: Option<T>,
}

pub struct ObjectCollection<T> {
    values: Vec<Slot<T>>,
    free_indices: Vec<usize>,
}

impl<T> ObjectCollection<T> {
    pub const fn new() -> Self {
        ObjectCollection {
            values: Vec::new(),
            free_indices: Vec::new(),
        }
    }

    fn decode_key(key: ObjectKey) -> (usize, u32) {
        let key: u64 = key.into();
        let base_id = key >> 2;
        let index = (base_id & INDEX_MASK) as usize;
        let generation = (base_id >> INDEX_BITS) as u32;
        (index, generation)
    }

    fn key_for(kind: HeapObjKind, index: usize, generation: u32) -> ObjectKey {
        let base_id = ((generation as u64) << INDEX_BITS) | (index as u64);
        ObjectKey::from(kind.mask_id(base_id))
    }

    pub fn create_key(&mut self, kind: HeapObjKind) -> ObjectKey {
        if let Some(index) = self.free_indices.pop() {
            let slot = &mut self.values[index];
            slot.generation = slot.generation.wrapping_add(1);
            return Self::key_for(kind, index, slot.generation);
        }

        let index = self.values.len();
        self.values.push(Slot {
            generation: 0,
            value: None,
        });
        Self::key_for(kind, index, 0)
    }

    pub fn insert(&mut self, key: ObjectKey, value: T) -> Option<T> {
        let (index, generation) = Self::decode_key(key);
        if index >= self.values.len() {
            self.values.resize_with(index + 1, || {
                Slot {
                    generation: 0,
                    value: None,
                }
            });
        }

        let slot = &mut self.values[index];
        if slot.value.is_none() {
            slot.generation = generation;
            return slot.value.replace(value);
        }

        if slot.generation != generation {
            return None;
        }

        slot.value.replace(value)
    }

    pub fn get(&self, key: ObjectKey) -> Option<&T> {
        let (index, generation) = Self::decode_key(key);
        let slot = self.values.get(index)?;
        if slot.generation != generation {
            return None;
        }
        slot.value.as_ref()
    }

    pub fn remove(&mut self, key: ObjectKey) -> Option<T> {
        let (index, generation) = Self::decode_key(key);
        let slot = self.values.get_mut(index)?;
        if slot.generation != generation {
            return None;
        }

        let removed = slot.value.take()?;
        self.free_indices.push(index);

        while let Some(last) = self.values.last() {
            if last.value.is_some() {
                break;
            }
            self.values.pop();
        }

        let len = self.values.len();
        self.free_indices.retain(|idx| *idx < len);

        Some(removed)
    }

    pub fn contains_key(&self, key: ObjectKey) -> bool {
        self.get(key).is_some()
    }
}
