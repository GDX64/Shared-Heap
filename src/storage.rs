use std::collections::HashMap;

use crate::value::Something;

pub struct Object {
    properties: HashMap<u32, Something>,
}

impl Object {
    pub fn new() -> Self {
        Object {
            properties: HashMap::new(),
        }
    }

    pub fn set_property(&mut self, key: u32, value: Something) {
        self.properties.insert(key, value);
    }

    pub fn get_property(&self, key: u32) -> Option<&Something> {
        return self.properties.get(&key);
    }
}

pub struct Storage {
    pub collection: HashMap<u32, Object>,
    last_id: u32,
}

impl Storage {
    pub fn new() -> Self {
        Storage {
            collection: HashMap::new(),
            last_id: 0,
        }
    }

    pub fn drop_object(&mut self, id: u32) -> u32 {
        self.collection.remove(&id);
        return id;
    }

    pub fn create_object(&mut self) -> u32 {
        let id = self.last_id;
        self.last_id += 1;
        self.collection.insert(id, Object::new());
        return id;
    }

    pub fn get_object(&self, id: u32) -> Option<&Object> {
        return self.collection.get(&id);
    }

    pub fn set_object_property(&mut self, object_id: u32, key: u32, value: Something) {
        if let Some(object) = self.collection.get_mut(&object_id) {
            object.set_property(key, value);
        }
    }

    pub fn get_object_property(&self, object_id: u32, key: u32) -> Option<&Something> {
        if let Some(object) = self.collection.get(&object_id) {
            return object.get_property(key);
        }
        return None;
    }
}
