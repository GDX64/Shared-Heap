import initModule, { type InitOutput } from "../pkg/shared_heap";
import {
  popObjectFromStack,
  pushBlobToStack,
  pushToStringStack,
  startWorkerID,
} from "./importFunctions";
import type { Blob, F64, I32, Null, Ref, Something, String } from "./types";

type WorkerData = {
  memory: WebAssembly.Memory;
  workerID: number;
};

export class AnyStore {
  private workerID: number = 0;
  private proxyMap: Map<bigint, WeakRef<any>> = new Map();
  private finalization: FinalizationRegistry<bigint>;

  constructor(
    private mod: InitOutput,
    private memory: WebAssembly.Memory,
  ) {
    this.finalization = new FinalizationRegistry((id: bigint) => {
      this.drop(id);
    });
  }

  drop(obj: unknown): void {
    let id;
    if (typeof obj === "bigint") {
      id = obj;
    } else {
      id = AnyStore.getIDOfProxy(obj);
    }
    this.proxyMap.delete(id!);
    this.mod.drop_object(id!);
  }

  getReferenceCount(obj: any): number {
    let id;
    if (typeof obj === "bigint") {
      id = obj;
    } else {
      id = AnyStore.getIDOfProxy(obj);
    }
    return this.mod.get_reference_count(id!);
  }

  static async create() {
    const memory = new WebAssembly.Memory({
      initial: 20,
      maximum: 1000,
      shared: true,
    });
    const mod = await initModule({ memory });
    return new AnyStore(mod, memory);
  }

  static async fromModule(workerData: WorkerData) {
    startWorkerID(workerData.workerID);
    const mod = await initModule({ memory: workerData.memory });
    return new AnyStore(mod, workerData.memory);
  }

  withLock<T>(fn: () => T): T {
    try {
      this.mod.lock();
      return fn();
    } finally {
      this.mod.unlock();
    }
  }

  createObject<T>(initial: T): T & { heapID: bigint } {
    let id;
    if (Array.isArray(initial)) {
      id = this.mod.create_array();
    } else {
      id = this.mod.create_object();
    }
    const obj = this.createProxyForID(id);
    for (const key in initial) {
      const value = (initial as any)[key];
      obj[key] = value;
    }
    return obj;
  }

  private createProxyForID(id: bigint): any {
    let obj;
    if (isArrayID(id)) {
      obj = createProxyForArray(id, this);
    } else {
      obj = createProxyForObject(id, this);
    }
    this.proxyMap.set(id, new WeakRef(obj));
    this.finalization.register(obj, id);
    return obj;
  }

  getObject<T>(id: bigint): T | null {
    const proxy = this.proxyMap.get(id)?.deref();
    if (proxy) {
      return proxy;
    }
    const exists = this.mod.increment_object_references(id);
    if (!exists) {
      return null;
    }
    return this.createProxyForID(id);
  }

  __getObjProperty(objID: bigint, prop: bigint): Something["value"] {
    this.mod.get_object_property(objID, prop);
    const result = popObjectFromStack();
    if (result == null) {
      return null;
    }
    if (typeof result === "object") {
      if (result.type === "ref") {
        return this.getObject(result.value);
      } else if (result.type === "blobPointer") {
        const { len, ptr } = result;
        const blob = new Uint8Array(this.memory.buffer, ptr, len);
        return blob;
      }
      return result.value;
    }
    return result;
  }

  __setObjProperty(objID: bigint, prop: bigint, value: unknown): void {
    // Fast path for primitive types
    const valueType = typeof value;
    if (valueType === "number") {
      if (Number.isInteger(value as number)) {
        this.mod.something_push_i32_to_stack(value as number);
      } else {
        this.mod.something_push_f64_to_stack(value as number);
      }
      this.mod.set_object_property(objID, prop);
      return;
    }
    if (valueType === "string") {
      pushToStringStack(value as string);
      this.mod.something_push_string();
      this.mod.set_object_property(objID, prop);
      return;
    }
    if (value === null) {
      this.mod.something_push_null_to_stack();
      this.mod.set_object_property(objID, prop);
      return;
    }
    if (value instanceof Uint8Array) {
      pushBlobToStack(value);
      this.mod.something_push_blob();
      this.mod.set_object_property(objID, prop);
      return;
    }
    // Slow path for object types
    if (AnyStore.isProxy(value)) {
      const id = AnyStore.getIDOfProxy(value);
      this.mod.something_push_ref_to_stack(id!);
      this.mod.set_object_property(objID, prop);
    } else if (valueType === "object") {
      const proxy = this.createObject(value);
      const id = AnyStore.getIDOfProxy(proxy);
      this.mod.something_push_ref_to_stack(id!);
      this.mod.set_object_property(objID, prop);
    }
  }

  __arrayGetLength(objID: bigint): number {
    return this.mod.array_get_length(objID);
  }

  __arraySetLength(objID: bigint, length: number): void {
    this.mod.array_set_length(objID, length);
  }

  __setArrayElement(objID: bigint, index: number, value: unknown): void {
    this.__setObjProperty(objID, BigInt(index), value);
    // Only update length if setting beyond current length
    // This check is cheaper than always calling __arrayGetLength
    const currentLength = this.__arrayGetLength(objID);
    if (index >= currentLength) {
      this.__arraySetLength(objID, index + 1);
    }
  }

  __arrayDeleteElement(objID: bigint, index: number): void {
    this.mod.delete_object_property(objID, BigInt(index));
  }

  createWorker(): WorkerData {
    this.workerID += 1;
    return {
      memory: this.memory,
      workerID: this.workerID,
    };
  }

  static i32(value: number): I32 {
    return { tag: "i32", value };
  }

  static f64(value: number): F64 {
    return { tag: "f64", value };
  }

  static blob(value: Uint8Array): Blob {
    return { tag: "blob", value };
  }

  static string(value: string): String {
    return { tag: "string", value };
  }

  static null(): Null {
    return { tag: "null", value: null };
  }

  static ref(value: bigint): Ref {
    return { tag: "ref", value };
  }

  static isProxy(value: any): boolean {
    return value && typeof value === "object" && "heapID" in value;
  }

  static getIDOfProxy(proxy: any): bigint | null {
    return proxy.heapID ?? null;
  }

  static somethingFromValue(value: unknown): Something | null {
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return AnyStore.i32(value);
      } else {
        return AnyStore.f64(value);
      }
    } else if (typeof value === "string") {
      return AnyStore.string(value);
    } else if (value === null) {
      return AnyStore.null();
    } else if (value instanceof Uint8Array) {
      return AnyStore.blob(value);
    }
    return null;
  }
}

type Target = {
  heapID: bigint;
  __store: AnyStore;
  push?: typeof arrayPush;
  pop?: typeof arrayPop;
};

const proxySchema: ProxyHandler<Target> = {
  get(target: Target, prop: string) {
    if (prop === "heapID") {
      return target.heapID;
    }
    return target.__store.__getObjProperty(target.heapID, fastHash(prop));
  },
  set(target: Target, prop: string, value: any) {
    target.__store.__setObjProperty(target.heapID, fastHash(prop), value);
    return true;
  },
  has(_target: Target, p) {
    if (p === "heapID") {
      return true;
    }
    return false;
  },
};

function createProxyForObject(objID: bigint, store: AnyStore): any {
  return new Proxy({ heapID: objID, __store: store }, proxySchema);
}

function arrayPush(this: Target, ...items: any[]): number {
  let length = this.__store.__arrayGetLength(this.heapID);
  for (let i = 0; i < items.length; i++) {
    this.__store.__setObjProperty(this.heapID, BigInt(length + i), items[i]);
    length++;
  }
  this.__store.__arraySetLength(this.heapID, length);
  return length;
}

function arrayPop(this: Target): any {
  const length = this.__store.__arrayGetLength(this.heapID);
  if (length === 0) {
    return undefined;
  }
  const lastIndex = length - 1;
  const value = this.__store.__getObjProperty(this.heapID, BigInt(lastIndex));
  this.__store.__arrayDeleteElement(this.heapID, lastIndex);
  this.__store.__arraySetLength(this.heapID, lastIndex);
  return value;
}

function createProxyForArray(objID: bigint, store: AnyStore): any {
  const target: Target = {
    heapID: objID,
    __store: store,
    push: arrayPush,
    pop: arrayPop,
  };

  return new Proxy(target, proxyArraySchema);
}

const proxyArraySchema: ProxyHandler<Target> = {
  get(target: Target, prop: string) {
    switch (prop) {
      case "heapID":
        return target.heapID;
      case "__store":
        return target.__store;
      case "length":
        return target.__store.__arrayGetLength(target.heapID);
      case "push":
        return target.push;
      case "pop":
        return target.pop;
    }
    // Check if it's a numeric index
    const index = Number(prop);
    return target.__store.__getObjProperty(target.heapID, BigInt(index));
  },
  set(target: Target, prop: string, value: any) {
    const index = Number(prop);
    target.__store.__setArrayElement(target.heapID, index, value);
    return true;
  },
  has(_target: Target, p) {
    return p === "heapID";
  },
};

function fastHash(str: string): bigint {
  let hash = 0;
  const len = str.length;
  for (let i = 0; i < len; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return BigInt(hash >>> 0);
}

function isArrayID(objID: bigint): boolean {
  return (objID & 0b1n) !== 0n;
}
