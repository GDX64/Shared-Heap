use crate::extern_functions;
use std::{
    cell::UnsafeCell,
    ops::{Deref, DerefMut},
    sync::atomic::{AtomicI32, Ordering},
};

const UNLOCKED: i32 = -1;

#[inline]
fn thread_id_i32() -> i32 {
    let id = extern_functions::worker_id();
    i32::try_from(id).expect("worker_id does not fit in i32")
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

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = lock_state; // no-op on non-wasm
    }
}

/// Re-entrant mutex with explicit lock/unlock.
/// `state` = owner thread id, or `UNLOCKED` when free.
pub struct WasmMutex<T> {
    state: AtomicI32,
    recursion: AtomicI32,
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
            recursion: AtomicI32::new(0),
            data: UnsafeCell::new(value),
        }
    }

    #[inline]
    pub fn try_lock(&self) -> bool {
        let tid = thread_id_i32();

        if self
            .state
            .compare_exchange(UNLOCKED, tid, Ordering::Acquire, Ordering::Relaxed)
            .is_ok()
        {
            self.recursion.store(1, Ordering::Relaxed);
            return true;
        }

        if self.state.load(Ordering::Relaxed) == tid {
            self.recursion.fetch_add(1, Ordering::Relaxed);
            return true;
        }

        false
    }

    pub fn lock(&self) {
        let tid = thread_id_i32();

        loop {
            if self.try_lock() {
                return;
            }

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
        let tid = thread_id_i32();
        let owner = self.state.load(Ordering::Relaxed);

        debug_assert_eq!(owner, tid, "unlock() called by non-owner thread");
        if owner != tid {
            return;
        }

        let prev = self.recursion.fetch_sub(1, Ordering::Relaxed);
        debug_assert!(prev > 0, "unlock() called on unlocked mutex");
        if prev <= 1 {
            self.state.store(UNLOCKED, Ordering::Release);
            notify(&self.state);
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
