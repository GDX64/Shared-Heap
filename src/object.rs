use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, Weak};

use crate::my_rwlock::ThreadLock;
use crate::value::Something;

pub struct Object {
    inner: Arc<Mutex<ObjectInner>>,
    lock: Arc<ThreadLock>,
}

pub struct WeakObject {
    inner: Weak<Mutex<ObjectInner>>,
    lock: Weak<ThreadLock>,
}

struct ObjectInner {
    properties: HashMap<u64, Something>,
}

struct LockGuard<'a> {
    lock: &'a ThreadLock,
}

impl Drop for LockGuard<'_> {
    fn drop(&mut self) {
        self.lock.release_write();
    }
}

impl Object {
    pub fn new() -> Self {
        Object {
            inner: Arc::new(Mutex::new(ObjectInner {
                properties: HashMap::new(),
            })),
            lock: Arc::new(ThreadLock::new()),
        }
    }

    fn write_lock(&self) -> LockGuard<'_> {
        self.lock.lock_write();
        LockGuard { lock: &self.lock }
    }

    fn lock_inner(&self) -> MutexGuard<'_, ObjectInner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn lock(&self) {
        self.lock.lock_write();
    }

    pub fn unlock(&self) {
        self.lock.release_write();
    }

    pub fn try_lock(&self) -> bool {
        self.lock.try_lock_write()
    }

    pub fn lock_pointer(&self) -> *const i32 {
        self.lock.pointer()
    }

    pub fn strong_count(&self) -> usize {
        return Arc::strong_count(&self.inner);
    }

    pub fn downgrade(&self) -> WeakObject {
        WeakObject {
            inner: Arc::downgrade(&self.inner),
            lock: Arc::downgrade(&self.lock),
        }
    }

    pub fn set_property(&self, key: u64, value: Something) -> Option<Something> {
        let _guard = self.write_lock();
        let mut inner = self.lock_inner();
        return inner.properties.insert(key, value);
    }

    pub fn get_property(&self, key: u64) -> Option<Something> {
        let _guard = self.write_lock();
        let inner = self.lock_inner();
        return inner.properties.get(&key).cloned();
    }

    pub fn delete_property(&self, key: u64) -> Option<Something> {
        let _guard = self.write_lock();
        let mut inner = self.lock_inner();
        inner.properties.remove(&key)
    }

    pub fn take_properties(&self) -> HashMap<u64, Something> {
        let _guard = self.write_lock();
        let mut inner = self.lock_inner();
        return std::mem::take(&mut inner.properties);
    }
}

impl WeakObject {
    pub fn upgrade(&self) -> Option<Object> {
        let inner = self.inner.upgrade()?;
        let lock = self.lock.upgrade()?;
        Some(Object { inner, lock })
    }

    pub fn strong_count(&self) -> usize {
        self.inner.strong_count()
    }
}

impl Clone for Object {
    fn clone(&self) -> Self {
        Object {
            inner: Arc::clone(&self.inner),
            lock: Arc::clone(&self.lock),
        }
    }
}

impl Clone for WeakObject {
    fn clone(&self) -> Self {
        WeakObject {
            inner: Weak::clone(&self.inner),
            lock: Weak::clone(&self.lock),
        }
    }
}
