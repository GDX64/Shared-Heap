pub use extern_functions_mod::*;

#[derive(Debug, Clone, PartialEq)]
pub enum MockValue {
    Int(i32),
    Float(f64),
    String(Vec<u8>),
    Blob(Vec<u8>),
    Null,
}

#[cfg(target_arch = "wasm32")]
mod extern_functions_mod {
    use wasm_bindgen::prelude::wasm_bindgen;

    use crate::extern_functions::MockValue;

    #[wasm_bindgen]
    unsafe extern "C" {
        // unsafe fn log_message(ptr: *const u8, len: usize);

        #[wasm_bindgen]
        fn js_read_string(index: usize) -> u8;
        #[wasm_bindgen]
        fn js_push_to_string(byte: u8);
        #[wasm_bindgen]
        fn js_read_string_length() -> usize;
        #[wasm_bindgen]
        fn js_pop_stack();
        #[wasm_bindgen]
        fn js_push_string_to_stack();
        #[wasm_bindgen]
        fn js_put_i32(value: i32);
        #[wasm_bindgen]
        fn js_put_f64(value: f64);
        #[wasm_bindgen]
        fn js_log_stack_value();
        #[wasm_bindgen]
        fn js_push_null();
        #[wasm_bindgen]
        fn js_create_blob(size: usize, len: usize);
        #[wasm_bindgen]
        fn js_push_to_blob(byte: u8);
        #[wasm_bindgen]
        fn js_read_blob_length() -> usize;
        #[wasm_bindgen]
        fn js_read_blob_byte(index: usize) -> u8;
        #[wasm_bindgen]
        fn unsafe_worker_id() -> i32;
        #[wasm_bindgen]
        pub fn js_put_ref(value: u64);
    }

    pub fn is_main_thread() -> bool {
        worker_id() == 0
    }

    pub fn worker_id() -> usize {
        return unsafe_worker_id() as usize;
    }

    pub fn safe_read_string(index: usize) -> u8 {
        let byte = js_read_string(index);
        return byte;
    }

    pub fn safe_create_string() {
        js_push_string_to_stack();
    }

    pub fn safe_push_to_string(byte: u8) {
        js_push_to_string(byte);
    }

    pub fn safe_read_string_length() -> usize {
        let len = js_read_string_length();
        return len;
    }

    pub fn safe_put_i32(value: i32) {
        js_put_i32(value);
    }

    pub fn safe_put_f64(value: f64) {
        js_put_f64(value);
    }

    pub fn safe_js_pop_stack() {
        js_pop_stack();
    }

    pub fn safe_push_null() {
        js_push_null();
    }

    pub fn safe_log_stack_value() {
        js_log_stack_value();
    }

    pub fn log_string(message: &str) {
        safe_create_string();
        for byte in message.as_bytes() {
            safe_push_to_string(*byte);
        }
        safe_log_stack_value();
    }

    pub fn safe_create_blob(ptr: usize, len: usize) {
        js_create_blob(ptr, len);
    }

    pub fn safe_read_blob_length() -> usize {
        return js_read_blob_length();
    }

    pub fn safe_read_blob_byte(index: usize) -> u8 {
        return js_read_blob_byte(index);
    }

    pub fn with_stack_mut<R>(_f: impl FnOnce(&mut Vec<MockValue>) -> R) -> R {
        panic!("Not implemented in wasm");
    }

    pub fn set_worker_id(_id: i32) {
        panic!("Not implemented in wasm");
    }
}
#[cfg(not(target_arch = "wasm32"))]
mod extern_functions_mod {
    use crate::extern_functions::MockValue;
    use std::cell::RefCell;

    thread_local! {
        static STACK: RefCell<Vec<MockValue>> = RefCell::new(Vec::new());
        static STRING_BUFFER: RefCell<Vec<u8>> = RefCell::new(Vec::new());
        static BLOB_BUFFER: RefCell<Vec<u8>> = RefCell::new(Vec::new());
        static WORKER_ID: RefCell<i32> = RefCell::new(0);
    }

    pub fn is_main_thread() -> bool {
        worker_id() == 0
    }

    pub fn worker_id() -> usize {
        WORKER_ID.with(|id| *id.borrow() as usize)
    }

    pub fn safe_read_string(index: usize) -> u8 {
        STRING_BUFFER.with(|buf| {
            let buffer = buf.borrow();
            if index < buffer.len() {
                buffer[index]
            } else {
                0
            }
        })
    }

    pub fn safe_create_string() {
        STRING_BUFFER.with(|buf| {
            buf.borrow_mut().clear();
        });
    }

    pub fn safe_push_to_string(byte: u8) {
        STRING_BUFFER.with(|buf| {
            buf.borrow_mut().push(byte);
        });
    }

    pub fn safe_read_string_length() -> usize {
        STRING_BUFFER.with(|buf| buf.borrow().len())
    }

    pub fn safe_put_i32(value: i32) {
        STACK.with(|stack| {
            stack.borrow_mut().push(MockValue::Int(value));
        });
    }

    pub fn safe_put_f64(value: f64) {
        STACK.with(|stack| {
            stack.borrow_mut().push(MockValue::Float(value));
        });
    }

    pub fn js_put_ref(value: u64) {
        STACK.with(|stack| {
            stack.borrow_mut().push(MockValue::Int(value as i32));
        });
    }

    pub fn safe_js_pop_stack() {
        STACK.with(|stack| {
            stack.borrow_mut().pop();
        });
    }

    pub fn safe_push_null() {
        STACK.with(|stack| {
            stack.borrow_mut().push(MockValue::Null);
        });
    }

    pub fn safe_log_stack_value() {
        STACK.with(|stack| {
            let s = stack.borrow();
            if let Some(value) = s.last() {
                println!("{:?}", value);
            }
        });
    }

    pub fn log_string(message: &str) {
        println!("{}", message);
    }

    pub fn safe_create_blob(ptr: usize, len: usize) {
        BLOB_BUFFER.with(|buf| {
            buf.borrow_mut().clear();
        });
        STACK.with(|stack| {
            stack
                .borrow_mut()
                .push(MockValue::Blob(vec![ptr as u8; len]));
        });
    }

    pub fn safe_read_blob_length() -> usize {
        BLOB_BUFFER.with(|buf| buf.borrow().len())
    }

    pub fn safe_read_blob_byte(index: usize) -> u8 {
        BLOB_BUFFER.with(|buf| {
            let buffer = buf.borrow();
            if index < buffer.len() {
                buffer[index]
            } else {
                0
            }
        })
    }

    pub fn with_stack_mut<R>(f: impl FnOnce(&mut Vec<MockValue>) -> R) -> R {
        STACK.with(|stack| {
            let mut s = stack.borrow_mut();
            f(&mut *s)
        })
    }

    pub fn set_worker_id(id: i32) {
        WORKER_ID.with(|worker_id| {
            *worker_id.borrow_mut() = id;
        });
    }
}
