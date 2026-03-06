const jsStack: StackValue[] = [];

export type StackValue =
  | string
  | { value: Uint8Array; index: number; type: "blob" }
  | { ptr: number; len: number; type: "blobPointer" }
  | { value: number; type: "ref" }
  | null
  | number;

export function pushToStringStack(str: string) {
  jsStack.push(str);
}

export function pushBlobToStack(blob: Uint8Array) {
  jsStack.push({ value: blob, index: 0, type: "blob" });
}

export function getWholeStack(): any[] {
  return jsStack.splice(0, jsStack.length);
}

export function popObjectFromStack(): StackValue | null {
  return jsStack.pop() ?? null;
}

function js_push_null(): void {
  jsStack.push(null);
}

function js_put_i32(value: number): void {
  jsStack.push(value);
}

function js_put_f64(value: number): void {
  jsStack.push(value);
}

function js_put_ref(value: number): void {
  jsStack.push({ value, type: "ref" });
}

function js_push_string_to_stack() {
  jsStack.push("");
}

function js_log_stack_value(): void {
  const val = jsStack.pop();
  console.log("WASM LOG:", val);
}

function js_push_to_string(byte: number): void {
  jsStack[jsStack.length - 1] += String.fromCharCode(byte);
}

function js_pop_stack(): void {
  jsStack.pop();
}

function js_read_string_length(): number {
  const last = jsStack.at(-1) as string;
  return last.length;
}

function js_read_string(index: number): number {
  const last = jsStack.at(-1) as string;
  return last.charCodeAt(index) ?? 0;
}

function js_read_blob_length(): number {
  const last = jsStack.at(-1) as { value: Uint8Array; index: number };
  return last.value.length;
}

function js_read_blob_byte(index: number): number {
  const last = jsStack.at(-1) as { value: Uint8Array; index: number };
  return last.value[index];
}

function js_performance_now() {
  return performance.now();
}

function js_create_blob(pointer: number, len: number) {
  jsStack.push({ ptr: pointer, len, type: "blobPointer" });
}

function js_push_to_blob(byte: number) {
  const blob = jsStack.at(-1) as { value: Uint8Array; index: number };
  blob.value[blob.index] = byte;
  blob.index += 1;
}

export function startWorkerID(workerID: number) {
  (globalThis as any).unsafe_worker_id = () => workerID;
}

const ops = {
  js_put_i32,
  js_put_f64,
  js_push_to_string,
  js_read_string_length,
  js_read_string,
  js_pop_stack,
  js_push_string_to_stack,
  js_log_stack_value,
  js_push_null,
  js_performance_now,
  js_create_blob,
  js_push_to_blob,
  js_read_blob_length,
  js_read_blob_byte,
  js_put_ref,
  unsafe_worker_id: () => 0,
};

for (const op in ops) {
  (globalThis as any)[op] = (ops as any)[op];
}
