use std::{
    cell::RefCell,
    cell::UnsafeCell,
    collections::HashMap,
    ops::{Deref, DerefMut},
    sync::atomic::{AtomicI32, Ordering},
};

use crate::extern_functions;

pub struct MyRwLock<T> {
    pub lock: ThreadLock,
    value: UnsafeCell<T>,
}

unsafe impl<T: Send> Send for MyRwLock<T> {}
unsafe impl<T: Send + Sync> Sync for MyRwLock<T> {}

thread_local! {
    static HELD_LOCKS: RefCell<HashMap<usize, u32>> = RefCell::new(HashMap::new());
}

fn lock_key(lock: &ThreadLock) -> usize {
    lock.pointer() as usize
}

fn try_reentrant_enter(lock: &ThreadLock) -> bool {
    let key = lock_key(lock);
    HELD_LOCKS.with(|locks| {
        let mut locks = locks.borrow_mut();
        if let Some(count) = locks.get_mut(&key) {
            *count += 1;
            return true;
        }
        false
    })
}

fn record_first_enter(lock: &ThreadLock) {
    let key = lock_key(lock);
    HELD_LOCKS.with(|locks| {
        locks.borrow_mut().insert(key, 1);
    });
}

fn should_release_underlying(lock: &ThreadLock) -> bool {
    let key = lock_key(lock);
    HELD_LOCKS.with(|locks| {
        let mut locks = locks.borrow_mut();
        let count = locks
            .get_mut(&key)
            .expect("Lock is not held by this thread");

        *count -= 1;
        if *count == 0 {
            locks.remove(&key);
            return true;
        }
        false
    })
}

impl<T> MyRwLock<T> {
    pub fn new(value: T) -> Self {
        MyRwLock {
            lock: ThreadLock::new(),
            value: UnsafeCell::new(value),
        }
    }

    pub fn write<'a>(&'a self) -> WriteGuard<'a, T> {
        self.lock.lock_write();
        return WriteGuard { rwlock: self };
    }

    pub fn read(&self) -> ReadGuard<'_, T> {
        self.lock.lock_read();
        return ReadGuard { rwlock: self };
    }
}

pub struct ReadGuard<'a, T> {
    rwlock: &'a MyRwLock<T>,
}

impl<T> Drop for ReadGuard<'_, T> {
    fn drop(&mut self) {
        self.rwlock.lock.release_read();
    }
}

impl<T> Deref for ReadGuard<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        // SAFETY: We have acquired the lock, so it is safe to access the inner value.
        unsafe { &*self.rwlock.value.get() }
    }
}

pub struct WriteGuard<'a, T> {
    rwlock: &'a MyRwLock<T>,
}

impl<T> Drop for WriteGuard<'_, T> {
    fn drop(&mut self) {
        self.rwlock.lock.release_write();
    }
}

impl<T> Deref for WriteGuard<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        // SAFETY: There can be only one WriteGuard at a time, so it is safe to access the inner value.
        unsafe { &*self.rwlock.value.get() }
    }
}

impl<T> DerefMut for WriteGuard<'_, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // SAFETY: There can be only one WriteGuard at a time, so it is safe to access the inner value.
        unsafe { &mut *self.rwlock.value.get() }
    }
}

const UNLOCKED: i32 = 0;
const WRITE: i32 = -1;

pub struct ThreadLock {
    lock_state: AtomicI32,
}

/**
 * This lock work is to guarantee thread access
 * The same thread may acquire the lock multiple times
 * Thus reentrant locking wont cause a deadlock, but may break aliasing rules
 * So the caller must ensure that they dont create multiple guards
 */
impl ThreadLock {
    pub const fn new() -> Self {
        ThreadLock {
            lock_state: AtomicI32::new(UNLOCKED),
        }
    }

    pub(crate) fn lock_read(&self) {
        if try_reentrant_enter(self) {
            return;
        }
        loop {
            let state = self.lock_state.load(Ordering::Relaxed);
            if !has_writer(state) {
                let is_ok = self
                    .lock_state
                    .compare_exchange(state, state + 1, Ordering::Acquire, Ordering::Relaxed)
                    .is_ok();
                if is_ok {
                    record_first_enter(self);
                    return;
                }
            }
            wait(&self.lock_state);
        }
    }

    pub(crate) fn lock_write(&self) {
        if try_reentrant_enter(self) {
            return;
        }
        loop {
            let state = self.lock_state.load(Ordering::Relaxed);
            if is_unlocked(state) {
                let is_ok = self
                    .lock_state
                    .compare_exchange(state, WRITE, Ordering::Acquire, Ordering::Relaxed)
                    .is_ok();
                if is_ok {
                    record_first_enter(self);
                    return;
                }
            }
            wait(&self.lock_state);
        }
    }

    pub(crate) fn release_read(&self) {
        if !should_release_underlying(self) {
            return;
        }
        self.lock_state.fetch_sub(1, Ordering::Release);
        notify(&self.lock_state);
    }

    pub(crate) fn release_write(&self) {
        if !should_release_underlying(self) {
            return;
        }
        self.lock_state.store(UNLOCKED, Ordering::Release);
        notify(&self.lock_state);
    }

    pub fn try_lock_write(&self) -> bool {
        if try_reentrant_enter(self) {
            return true;
        }
        let ok = self
            .lock_state
            .compare_exchange(UNLOCKED, WRITE, Ordering::Acquire, Ordering::Relaxed)
            .is_ok();
        if ok {
            record_first_enter(self);
        }
        return ok;
    }

    pub fn pointer(&self) -> *const i32 {
        return self.lock_state.as_ptr();
    }
}

fn is_unlocked(state: i32) -> bool {
    return state == UNLOCKED;
}

fn has_writer(state: i32) -> bool {
    return state < 0;
}

fn wait(_lock_state: &AtomicI32) {
    if !extern_functions::is_main_thread() {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            let ptr = _lock_state.as_ptr();
            std::arch::wasm32::memory_atomic_wait32(ptr, UNLOCKED, 1000_000);
        }
    }
}

fn notify(_lock_state: &AtomicI32) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        std::arch::wasm32::memory_atomic_notify(_lock_state.as_ptr(), 999);
    }
}
