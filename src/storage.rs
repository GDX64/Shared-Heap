use std::cell::RefCell;
use std::collections::HashMap;

use crate::object::{Object, WeakObject};
use crate::value::Something;

thread_local! {
    static LOCAL_OBJECTS: RefCell<HashMap<u64, Object>> = RefCell::new(HashMap::new());
}

fn local_get(id: u64) -> Option<Object> {
    LOCAL_OBJECTS.with(|objects| objects.borrow().get(&id).cloned())
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

pub struct Storage {
    pub collection: HashMap<u64, WeakObject>,
    pub blobs: HashMap<u64, Vec<u8>>,
    last_id: u64,
}

impl Storage {
    pub fn new() -> Self {
        Storage {
            collection: HashMap::new(),
            last_id: 0,
            blobs: HashMap::new(),
        }
    }

    pub fn try_drop(&mut self, id: u64) -> Option<()> {
        if local_remove(id).is_none() && !self.collection.contains_key(&id) {
            return None;
        }

        self.cleanup_dead(id);

        return Some(());
    }

    fn cleanup_dead(&mut self, id: u64) {
        let remove = self
            .collection
            .get(&id)
            .map(|w| w.strong_count() == 0)
            .unwrap_or(false);
        if remove {
            self.collection.remove(&id);
        }
    }

    fn get_live_object(&self, id: u64) -> Option<Object> {
        if let Some(object) = local_get(id) {
            return Some(object);
        }

        let weak = self.collection.get(&id)?;
        let object = weak.upgrade()?;
        local_insert(id, object.clone());
        Some(object)
    }

    pub fn get_reference_count(&self, id: u64) -> Option<u32> {
        let obj = self.collection.get(&id)?;
        return Some(obj.strong_count() as u32);
    }

    pub fn get_blob_pointer(&self, id: u64) -> Option<(*const u8, usize)> {
        let blob = self.blobs.get(&id)?;
        return Some((blob.as_ptr(), blob.len()));
    }

    pub fn add_blob(&mut self, data: Vec<u8>) -> u64 {
        let id = self.last_id;
        self.last_id += 1;
        self.blobs.insert(id, data);
        return id;
    }

    pub fn increment_object_references(&mut self, id: u64) -> Option<bool> {
        if local_get(id).is_some() {
            return Some(true);
        }

        let weak = self.collection.get(&id)?;
        let object = weak.upgrade()?;
        local_insert(id, object);
        return Some(true);
    }

    pub fn create_object(&mut self, kind: ObjectKind) -> u64 {
        let id = match kind {
            ObjectKind::Object => self.object_id(),
            ObjectKind::Array => self.array_id(),
        };
        let object = Object::new();
        self.collection.insert(id, object.downgrade());
        local_insert(id, object);
        return id;
    }

    pub fn get_object(&self, id: u64) -> Option<Object> {
        return self.get_live_object(id);
    }

    pub fn set_object_property(&mut self, object_id: u64, key: u64, value: Something) {
        if let Some(object) = self.get_live_object(object_id) {
            if let Some(Something::Ref { id, .. }) = object.set_property(key, value) {
                self.cleanup_dead(id);
            }
        }
    }

    pub fn get_object_property(&self, object_id: u64, key: u64) -> Option<Something> {
        if let Some(object) = self.get_live_object(object_id) {
            return object.get_property(key);
        }
        return None;
    }

    pub fn delete_object_property(&mut self, object_id: u64, key: u64) -> Option<Something> {
        let object = self.get_live_object(object_id)?;
        let prop = object.delete_property(key)?;
        if let Something::Ref { id: to, .. } = &prop {
            self.cleanup_dead(*to);
        };
        return Some(prop);
    }

    pub fn create_reference(&self, id: u64) -> Option<Something> {
        let object = self.get_live_object(id)?;
        return Some(Something::Ref { id, object });
    }

    fn object_id(&mut self) -> u64 {
        let id = self.last_id;
        self.last_id += 1;
        return id << 1;
    }

    fn array_id(&mut self) -> u64 {
        let id = self.last_id;
        self.last_id += 1;
        return (id << 1) | 0b1;
    }
}
