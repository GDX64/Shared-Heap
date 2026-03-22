use wasm_bindgen::prelude::wasm_bindgen;

use crate::{extern_functions::*, object_kinds::HeapObjKind, storage::Storage, value::Something};
use std::{cell::RefCell, ptr, sync::Arc};

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

static mut GLOBALS_PTR: *mut Storage = ptr::null_mut();

fn globals() -> &'static Storage {
    unsafe { &*GLOBALS_PTR }
}

#[wasm_bindgen]
pub fn lock(object_id: u64) -> bool {
    globals().lock(object_id)
}

#[wasm_bindgen]
pub fn unlock(object_id: u64) -> bool {
    globals().unlock(object_id)
}

#[wasm_bindgen]
pub fn try_lock(object_id: u64) -> bool {
    globals().try_lock(object_id)
}

#[wasm_bindgen]
pub fn lock_pointer(object_id: u64) -> *const i32 {
    globals().lock_pointer(object_id)
}

#[wasm_bindgen]
pub fn get_object_property(object_id: u64, key: u64) {
    if let Some(obj) = globals().get_object_property(object_id, key) {
        push_to_js_stack(&obj, globals());
    }
}

#[wasm_bindgen]
pub fn increment_object_references(object_id: u64) -> bool {
    return globals()
        .increment_object_references(object_id)
        .unwrap_or(false);
}

#[wasm_bindgen]
pub fn drop_object(id: u64) {
    globals().try_drop(id);
}

#[wasm_bindgen]
pub fn get_reference_count(object_id: u64) -> i32 {
    return globals().get_reference_count(object_id).unwrap_or(0) as i32;
}

#[wasm_bindgen]
pub fn create_object() -> u64 {
    return globals().create_object(HeapObjKind::Object);
}

#[wasm_bindgen]
pub fn create_array() -> u64 {
    globals().create_object(HeapObjKind::Array)
}

#[wasm_bindgen]
pub fn create_bin_view(schema_key: u64, size: u32) -> u64 {
    globals().create_bin_view(schema_key, size as usize)
}

#[wasm_bindgen]
pub fn create_shared_obj(schema_key: u64, size: u32) -> u64 {
    globals().create_shared_obj(schema_key, size as usize)
}

#[wasm_bindgen]
pub fn get_bin_view_schema(bin_view_id: u64) -> u64 {
    globals().get_bin_view_schema(bin_view_id).unwrap_or(0)
}

#[wasm_bindgen]
pub fn get_bin_view_ptr(bin_view_id: u64) -> usize {
    globals().get_bin_view_ptr(bin_view_id).unwrap_or(0)
}

#[wasm_bindgen]
pub fn get_shared_obj_schema(shared_obj_id: u64) -> u64 {
    globals().get_shared_obj_schema(shared_obj_id).unwrap_or(0)
}

#[wasm_bindgen]
pub fn array_get_length(array_id: u64) -> i32 {
    globals().array_len(array_id).unwrap_or(0) as i32
}

#[wasm_bindgen]
pub fn array_push(array_id: u64) {
    if let Some(value) = pop_from_something_stack() {
        globals().array_push(array_id, value);
    }
}

#[wasm_bindgen]
pub fn array_pop(array_id: u64) {
    if let Some(obj) = globals().array_pop(array_id) {
        push_to_js_stack(&obj, globals());
    }
}

#[wasm_bindgen]
pub fn array_set_index(array_id: u64, index: u32) {
    if let Some(value) = pop_from_something_stack() {
        globals().array_set_index(array_id, index as usize, value);
    }
}

#[wasm_bindgen]
pub fn array_get_index(array_id: u64, index: u32) {
    if let Some(obj) = globals().array_get_index(array_id, index as usize) {
        push_to_js_stack(&obj, globals());
    }
}

#[wasm_bindgen]
pub fn delete_object_property(object_id: u64, key: u64) {
    globals().delete_object_property(object_id, key);
}

#[wasm_bindgen]
pub fn set_object_property(object_id: u64, key: u64) {
    if let Some(value) = pop_from_something_stack() {
        globals().set_object_property(object_id, key, value);
    }
}

#[wasm_bindgen]
pub fn start() {
    unsafe {
        if GLOBALS_PTR.is_null() {
            GLOBALS_PTR = Box::into_raw(Box::new(Storage::new()));
        }
    }

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
pub fn something_push_ref_to_stack(value: u64) {
    if let Some(something) = globals().create_reference(value) {
        push_something(something);
    }
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
    let something = Something::Blob(Arc::new(bytes));
    push_something(something);
}

fn push_to_js_stack(value: &Something, _db: &Storage) {
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
        Something::Blob(blob) => {
            safe_create_blob(blob.as_ref().as_ptr() as usize, blob.as_ref().len());
        }
        Something::Ref { id, object: _ } => {
            js_put_ref(*id);
        }
        Something::Null => {
            safe_push_null();
        }
        Something::Float(f) => {
            safe_put_f64(*f);
        }
    }
}
