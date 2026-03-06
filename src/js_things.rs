use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    extern_functions::*,
    my_rwlock::{MyRwLock, ReadGuard, WriteGuard},
    storage::Storage,
    value::Something,
};
use std::{cell::RefCell, sync::LazyLock};

const ARRAY_LENGTH: u32 = u32::MAX;

struct SomethingStack {
    stack: Vec<Something>,
}

impl SomethingStack {
    const fn new() -> Self {
        SomethingStack { stack: Vec::new() }
    }

    fn push(&mut self, value: Something) {
        self.stack.push(value);
    }

    fn pop(&mut self) -> Option<Something> {
        self.stack.pop()
    }
}

thread_local! {
    static SOMETHING_STACK: RefCell<SomethingStack> = RefCell::new(SomethingStack::new());
}

fn pop_something() -> Option<Something> {
    return SOMETHING_STACK.with(|stack| stack.borrow_mut().pop());
}

fn push_something(value: Something) {
    SOMETHING_STACK.with(|stack| stack.borrow_mut().push(value));
}

fn pop_from_something_stack() -> Option<Something> {
    return pop_something();
}

struct GlobalState {
    db: MyRwLock<Storage>,
}

impl GlobalState {
    fn new() -> Self {
        GlobalState {
            db: MyRwLock::new(Storage::new()),
        }
    }

    fn lock(&self) {
        self.db.lock.global_lock_write();
    }

    fn unlock(&self) {
        self.db.lock.release_global_write();
    }

    fn try_lock(&self) -> bool {
        return self.db.lock.try_global_lock_write();
    }

    fn lock_pointer(&self) -> *const i32 {
        return self.db.lock.pointer();
    }

    fn write(&self) -> WriteGuard<'_, Storage> {
        return self.db.write();
    }

    fn read(&self) -> ReadGuard<'_, Storage> {
        return self.db.read();
    }
}

static GLOBALS: LazyLock<GlobalState> = LazyLock::new(|| GlobalState::new());

#[wasm_bindgen]
pub fn lock() {
    GLOBALS.lock();
}

#[wasm_bindgen]
pub fn unlock() {
    GLOBALS.unlock();
}

#[wasm_bindgen]
pub fn try_lock() -> bool {
    return GLOBALS.try_lock();
}

#[wasm_bindgen]
pub fn lock_pointer() -> *const i32 {
    return GLOBALS.lock_pointer();
}

#[wasm_bindgen]
pub fn get_object_property(object_id: u32, key: u32) {
    let storage = GLOBALS.read();
    if let Some(obj) = storage.get_object_property(object_id, key) {
        push_to_js_stack(&obj);
    }
}

#[wasm_bindgen]
pub fn drop_object(id: u32) -> u32 {
    let mut storage = GLOBALS.write();
    return storage.drop_object(id);
}

#[wasm_bindgen]
pub fn create_object() -> u32 {
    let mut storage = GLOBALS.write();
    return storage.create_object();
}

#[wasm_bindgen]
pub fn create_array() -> u32 {
    let mut storage = GLOBALS.write();
    let id = storage.create_object();
    // Initialize length to 0
    storage.set_object_property(id, ARRAY_LENGTH, Something::Int(0));
    return id;
}

#[wasm_bindgen]
pub fn array_get_length(array_id: u32) -> i32 {
    let storage = GLOBALS.read();
    if let Some(length) = storage.get_object_property(array_id, ARRAY_LENGTH) {
        match length {
            Something::Int(len) => return *len,
            _ => return 0,
        }
    }
    return 0;
}

#[wasm_bindgen]
pub fn array_set_length(array_id: u32, length: i32) {
    let mut storage = GLOBALS.write();
    storage.set_object_property(array_id, ARRAY_LENGTH, Something::Int(length));
}

#[wasm_bindgen]
pub fn delete_object_property(object_id: u32, key: u32) {
    let mut storage = GLOBALS.write();
    storage.delete_object_property(object_id, key);
}

#[wasm_bindgen]
pub fn set_object_property(object_id: u32, key: u32) {
    if let Some(value) = pop_from_something_stack() {
        let mut storage = GLOBALS.write();
        storage.set_object_property(object_id, key, value);
    }
}

#[wasm_bindgen]
pub fn start() {
    if worker_id() == 0 {
        std::panic::set_hook(Box::new(|info| {
            let msg = info.to_string();
            let full_message = format!("Panic occurred: {}", msg);
            log_string(&full_message);
        }));
    }
}

#[wasm_bindgen]
pub fn something_push_i32_to_stack(value: i32) {
    let something = Something::Int(value);
    push_something(something);
}

#[wasm_bindgen]
pub fn something_push_string() {
    let len = safe_read_string_length();
    let mut bytes = Vec::with_capacity(len);
    for i in 0..len {
        let byte = safe_read_string(i);
        bytes.push(byte);
    }
    safe_js_pop_stack();
    let something = Something::String(bytes);
    push_something(something);
}

#[wasm_bindgen]
pub fn something_push_ref_to_stack(value: u32) {
    let something = Something::Ref(value);
    push_something(something);
}

#[wasm_bindgen]
pub fn something_push_f64_to_stack(value: f64) {
    let something = Something::Float(value);
    push_something(something);
}

#[wasm_bindgen]
pub fn something_push_null_to_stack() {
    let something = Something::Null;
    push_something(something);
}

#[wasm_bindgen]
pub fn something_push_blob() {
    let len = safe_read_blob_length();
    let mut bytes = Vec::with_capacity(len);
    for i in 0..len {
        let byte = safe_read_blob_byte(i);
        bytes.push(byte);
    }
    safe_js_pop_stack();
    let something = Something::Blob(bytes);
    push_something(something);
}

fn push_to_js_stack(value: &Something) {
    match value {
        Something::Int(v) => {
            safe_put_i32(*v);
        }
        Something::String(s) => {
            safe_create_string();
            for byte in s {
                safe_push_to_string(*byte);
            }
        }
        Something::Blob(b) => {
            safe_create_blob(b.len());
            for byte in b {
                safe_push_to_blob(*byte);
            }
        }
        Something::Ref(r) => {
            js_put_ref(*r);
        }
        Something::Null => {
            safe_push_null();
        }
        Something::Float(f) => {
            safe_put_f64(*f);
        }
    }
}
