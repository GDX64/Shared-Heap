use std::collections::HashMap;

use crate::value::Something;

pub struct Object {
    properties: HashMap<u32, Something>,
    references: u32,
}

pub enum ObjectKind {
    Object = 0,
    Array = 1,
}

impl Object {
    pub fn new() -> Self {
        Object {
            properties: HashMap::new(),
            references: 1,
        }
    }

    pub fn increment_references(&mut self) {
        self.references += 1;
    }

    pub fn decrement_references(&mut self) {
        if self.references > 0 {
            self.references -= 1;
        }
    }

    pub fn has_references(&self) -> bool {
        return self.references > 0;
    }

    pub fn set_property(&mut self, key: u32, value: Something) -> Option<Something> {
        return self.properties.insert(key, value);
    }

    pub fn get_property(&self, key: u32) -> Option<&Something> {
        return self.properties.get(&key);
    }

    pub fn delete_property(&mut self, key: u32) -> Option<Something> {
        self.properties.remove(&key)
    }
}

pub struct Storage {
    pub collection: HashMap<u32, Object>,
    pub blobs: HashMap<u32, Vec<u8>>,
    last_id: u32,
}

impl Storage {
    pub fn new() -> Self {
        Storage {
            collection: HashMap::new(),
            last_id: 0,
            blobs: HashMap::new(),
        }
    }

    pub fn try_drop(&mut self, id: u32) -> Option<()> {
        let obj = self.collection.get_mut(&id)?;
        obj.decrement_references();
        if !obj.has_references() {
            let obj = self.collection.remove(&id)?;
            obj.properties.into_iter().for_each(|(_, s)| {
                if let Something::Ref(to) = s {
                    self.try_drop(to);
                }
            });
        };

        return Some(());
    }

    pub fn get_reference_count(&self, id: u32) -> Option<u32> {
        let obj = self.collection.get(&id)?;
        return Some(obj.references);
    }

    pub fn get_blob_pointer(&self, id: u32) -> Option<(*const u8, usize)> {
        let blob = self.blobs.get(&id)?;
        return Some((blob.as_ptr(), blob.len()));
    }

    pub fn add_blob(&mut self, data: Vec<u8>) -> u32 {
        let id = self.last_id;
        self.last_id += 1;
        self.blobs.insert(id, data);
        return id;
    }

    pub fn increment_object_references(&mut self, id: u32) -> Option<bool> {
        let obj = self.collection.get_mut(&id)?;
        obj.increment_references();
        return Some(true);
    }

    pub fn create_object(&mut self, kind: ObjectKind) -> u32 {
        let id = match kind {
            ObjectKind::Object => self.object_id(),
            ObjectKind::Array => self.array_id(),
        };
        self.collection.insert(id, Object::new());
        return id;
    }

    pub fn get_object(&self, id: u32) -> Option<&Object> {
        return self.collection.get(&id);
    }

    pub fn set_object_property(&mut self, object_id: u32, key: u32, value: Something) {
        if let Something::Ref(to) = value {
            if let Some(obj) = self.collection.get_mut(&to) {
                obj.increment_references();
            }
        }
        if let Some(object) = self.collection.get_mut(&object_id) {
            if let Some(Something::Ref(id)) = object.set_property(key, value) {
                self.try_drop(id);
            }
        }
    }

    pub fn get_object_property(&self, object_id: u32, key: u32) -> Option<&Something> {
        if let Some(object) = self.collection.get(&object_id) {
            return object.get_property(key);
        }
        return None;
    }

    pub fn delete_object_property(&mut self, object_id: u32, key: u32) -> Option<Something> {
        let object = self.collection.get_mut(&object_id)?;
        let prop = object.delete_property(key)?;
        if let Something::Ref(to) = prop {
            let obj = self.collection.get_mut(&to)?;
            obj.decrement_references();
        };
        return Some(prop);
    }

    fn object_id(&mut self) -> u32 {
        let id = self.last_id;
        self.last_id += 1;
        return id << 1;
    }

    fn array_id(&mut self) -> u32 {
        let id = self.last_id;
        self.last_id += 1;
        return (id << 1) | 0b1;
    }
}
