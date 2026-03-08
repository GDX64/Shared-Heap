use crate::extern_functions;
use std::{
    cell::UnsafeCell,
    ops::{Deref, DerefMut},
    sync::atomic::{AtomicI32, Ordering},
};

const UNLOCKED: i32 = -1;

#[inline]
fn thread_id_i32() -> i32 {
    return extern_functions::worker_id() as i32;
}

fn wait(_lock_state: &AtomicI32, _expected: i32) {
    if !extern_functions::is_main_thread() {
        #[cfg(target_arch = "wasm32")]
        unsafe {
            let ptr = _lock_state.as_ptr();
            std::arch::wasm32::memory_atomic_wait32(ptr, _expected, 1_000_000);
        }

        #[cfg(not(target_arch = "wasm32"))]
        std::thread::yield_now();
    }
}

fn notify(lock_state: &AtomicI32) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        std::arch::wasm32::memory_atomic_notify(lock_state.as_ptr(), 1);
    }
}

/// Re-entrant mutex with explicit lock/unlock.
/// `state` = owner thread id, or `UNLOCKED` when free.
pub struct WasmMutex<T> {
    state: AtomicI32,
    recursion: UnsafeCell<i32>,
    data: UnsafeCell<T>,
}

unsafe impl<T: Send> Send for WasmMutex<T> {}
unsafe impl<T: Send> Sync for WasmMutex<T> {}

pub struct MutexWriteGuard<'a, T> {
    mutex: &'a WasmMutex<T>,
}

impl<T> WasmMutex<T> {
    pub const fn new(value: T) -> Self {
        Self {
            state: AtomicI32::new(UNLOCKED),
            recursion: UnsafeCell::new(0),
            data: UnsafeCell::new(value),
        }
    }

    unsafe fn set_recursion(&self, i: i32) {
        unsafe { *self.recursion.get() = i };
    }

    unsafe fn get_recursion(&self) -> i32 {
        unsafe { *self.recursion.get() }
    }

    #[inline]
    pub fn try_lock(&self) -> bool {
        let tid = thread_id_i32();

        if self
            .state
            .compare_exchange(UNLOCKED, tid, Ordering::Acquire, Ordering::Relaxed)
            .is_ok()
        {
            unsafe {
                // Safety: we just acquired the lock, so we can set recursion to 1.
                self.set_recursion(1);
            }
            return true;
        }

        if self.state.load(Ordering::Relaxed) == tid {
            unsafe {
                // Safety: we already own the lock, so we can increment recursion.
                self.set_recursion(self.get_recursion() + 1);
            }
            return true;
        }

        false
    }

    pub fn lock(&self) {
        loop {
            if self.try_lock() {
                return;
            }
            let tid = thread_id_i32();
            loop {
                let owner = self.state.load(Ordering::Relaxed);
                if owner == UNLOCKED || owner == tid {
                    break;
                }
                wait(&self.state, owner);
            }
        }
    }

    pub fn unlock(&self) {
        unsafe {
            let prev = self.get_recursion();
            self.set_recursion(prev - 1);
            if prev <= 1 {
                self.state.store(UNLOCKED, Ordering::Release);
                notify(&self.state);
            }
        }
    }

    #[inline]
    pub fn write(&self) -> MutexWriteGuard<'_, T> {
        self.lock();
        MutexWriteGuard { mutex: self }
    }

    #[inline]
    pub fn pointer(&self) -> *const i32 {
        self.state.as_ptr()
    }
}

impl<T> Deref for MutexWriteGuard<'_, T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        // Safety: guard holds the lock for its lifetime.
        unsafe { &*self.mutex.data.get() }
    }
}

impl<T> DerefMut for MutexWriteGuard<'_, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // Safety: guard holds the lock for its lifetime and provides unique mutable access.
        unsafe { &mut *self.mutex.data.get() }
    }
}

impl<T> Drop for MutexWriteGuard<'_, T> {
    fn drop(&mut self) {
        self.mutex.unlock();
    }
}
