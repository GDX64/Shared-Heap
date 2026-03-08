use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, Weak};

use crate::value::Something;

pub struct Object {
    inner: Arc<Mutex<ObjectInner>>,
}

pub struct WeakObject {
    inner: Weak<Mutex<ObjectInner>>,
}

struct ObjectInner {
    properties: HashMap<u64, Something>,
}

impl Object {
    pub fn new() -> Self {
        Object {
            inner: Arc::new(Mutex::new(ObjectInner {
                properties: HashMap::new(),
            })),
        }
    }

    fn lock_inner(&self) -> MutexGuard<'_, ObjectInner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn strong_count(&self) -> usize {
        return Arc::strong_count(&self.inner);
    }

    pub fn downgrade(&self) -> WeakObject {
        WeakObject {
            inner: Arc::downgrade(&self.inner),
        }
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
