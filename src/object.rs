use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use crate::value::Something;

pub struct Object {
    inner: Arc<Mutex<ObjectInner>>,
}

struct ObjectInner {
    properties: HashMap<u64, Something>,
    references: u32,
}

impl Object {
    pub fn new() -> Self {
        Object {
            inner: Arc::new(Mutex::new(ObjectInner {
                properties: HashMap::new(),
                references: 1,
            })),
        }
    }

    fn lock_inner(&self) -> MutexGuard<'_, ObjectInner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn increment_references(&self) {
        let mut inner = self.lock_inner();
        inner.references += 1;
    }

    pub fn decrement_references(&self) {
        let mut inner = self.lock_inner();
        if inner.references > 0 {
            inner.references -= 1;
        }
    }

    pub fn has_references(&self) -> bool {
        let inner = self.lock_inner();
        return inner.references > 0;
    }

    pub fn get_reference_count(&self) -> u32 {
        let inner = self.lock_inner();
        return inner.references;
    }

    pub fn set_property(&self, key: u64, value: Something) -> Option<Something> {
        let mut inner = self.lock_inner();
        return inner.properties.insert(key, value);
    }

    pub fn get_property(&self, key: u64) -> Option<Something> {
        let inner = self.lock_inner();
        return inner.properties.get(&key).cloned();
    }

    pub fn delete_property(&self, key: u64) -> Option<Something> {
        let mut inner = self.lock_inner();
        inner.properties.remove(&key)
    }

    pub fn take_properties(&self) -> HashMap<u64, Something> {
        let mut inner = self.lock_inner();
        return std::mem::take(&mut inner.properties);
    }
}

impl Clone for Object {
    fn clone(&self) -> Self {
        Object {
            inner: Arc::clone(&self.inner),
        }
    }
}
