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
        pub fn js_put_ref(value: u32);
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
