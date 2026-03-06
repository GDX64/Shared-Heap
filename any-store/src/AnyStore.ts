import initModule, { type InitOutput } from "../pkg/any_store";
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
  private proxyMap: Map<number, WeakRef<any>> = new Map();
  private finalization: FinalizationRegistry<number>;

  constructor(
    private mod: InitOutput,
    private memory: WebAssembly.Memory,
  ) {
    this.finalization = new FinalizationRegistry((id: number) => {
      this.proxyMap.delete(id);
      this.mod.drop_object(id);
    });
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

  createObject<T>(initial: T): T {
    let obj;
    let id;
    if (Array.isArray(initial)) {
      id = this.mod.create_array();
      obj = createProxyForArray(id, this);
    } else {
      id = this.mod.create_object();
      obj = createProxyForObject(id, this);
    }
    this.finalization.register(obj, id);
    this.proxyMap.set(id, new WeakRef(obj));
    for (const key in initial) {
      const value = (initial as any)[key];
      obj[key] = value;
    }
    return obj;
  }

  getObject<T>(id: number): T | null {
    const proxy = this.proxyMap.get(id)?.deref();
    if (proxy) {
      return proxy;
    }
    const exists = this.mod.increment_object_references(id);
    if (!exists) {
      return null;
    }
    const obj = createProxyForObject(id, this);
    this.finalization.register(obj, id);
    this.proxyMap.set(id, new WeakRef(obj));
    return obj;
  }

  __getObjProperty(objID: number, prop: number): Something["value"] {
    this.mod.get_object_property(objID, prop);
    const result = popObjectFromStack();
    if (result == null) {
      return null;
    }
    if (typeof result === "object") {
      if (result.type === "ref") {
        return this.proxyMap.get(result.value)?.deref() ?? null;
      }
      return result.value;
    }
    return result;
  }

  __setObjProperty(objID: number, prop: number, value: unknown): void {
    if (AnyStore.isProxy(value)) {
      const id = AnyStore.getIDOfProxy(value);
      this.addToStack(AnyStore.ref(id!));
      this.mod.set_object_property(objID, prop);
    } else if (typeof value === "object") {
      const proxy = this.createObject(value);
      const id = AnyStore.getIDOfProxy(proxy);
      this.addToStack(AnyStore.ref(id!));
      this.mod.set_object_property(objID, prop);
    } else {
      this.addToStack(AnyStore.somethingFromValue(value));
      this.mod.set_object_property(objID, prop);
    }
  }

  __arrayGetLength(objID: number): number {
    return this.mod.array_get_length(objID);
  }

  __arraySetLength(objID: number, length: number): void {
    this.mod.array_set_length(objID, length);
  }

  __setArrayElement(objID: number, index: number, value: unknown): void {
    this.__setObjProperty(objID, index, value);
    const currentLength = this.__arrayGetLength(objID);
    if (index >= currentLength) {
      this.__arraySetLength(objID, index + 1);
    }
  }

  __arrayDeleteElement(objID: number, index: number): void {
    this.mod.delete_object_property(objID, index);
  }

  private addToStack(value: Something): void {
    if (value.tag === "i32") {
      this.mod.something_push_i32_to_stack(value.value);
    } else if (value.tag === "f64") {
      this.mod.something_push_f64_to_stack(value.value);
    } else if (value.tag === "string") {
      pushToStringStack(value.value);
      this.mod.something_push_string();
    } else if (value.tag === "blob") {
      pushBlobToStack(value.value);
      this.mod.something_push_blob();
    } else if (value.tag === "null") {
      this.mod.something_push_null_to_stack();
    } else if (value.tag === "ref") {
      this.mod.something_push_ref_to_stack(value.value);
    }
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

  static ref(value: number): Ref {
    return { tag: "ref", value };
  }

  static isProxy(value: any): boolean {
    return value && typeof value === "object" && "__id" in value;
  }

  static getIDOfProxy(proxy: any): number | null {
    return proxy.__id ?? null;
  }

  static somethingFromValue(value: unknown): Something {
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
    return AnyStore.null();
  }
}

type Target = {
  objID: number;
  store: AnyStore;
};

const proxySchema: ProxyHandler<Target> = {
  get(target: Target, prop: string) {
    if (prop === "__id") {
      return target.objID;
    }
    return target.store.__getObjProperty(target.objID, hash(prop));
  },
  set(target: Target, prop: string, value: any) {
    target.store.__setObjProperty(target.objID, hash(prop), value);
    return true;
  },
  has(_target: Target, p) {
    if (p === "__id") {
      return true;
    }
    return false;
  },
};

function createProxyForObject(objID: number, store: AnyStore): any {
  return new Proxy({ objID, store }, proxySchema);
}

function createProxyForArray(objID: number, store: AnyStore): any {
  return new Proxy({ objID, store }, proxyArraySchema);
}

const proxyArraySchema: ProxyHandler<Target> = {
  get(target: Target, prop: string) {
    if (prop === "__id") {
      return target.objID;
    }
    if (prop === "length") {
      return target.store.__arrayGetLength(target.objID);
    }
    if (prop === "push") {
      return function (...items: any[]) {
        const length = target.store.__arrayGetLength(target.objID);
        for (let i = 0; i < items.length; i++) {
          target.store.__setArrayElement(target.objID, length + i, items[i]);
        }
        return target.store.__arrayGetLength(target.objID);
      };
    }
    if (prop === "pop") {
      return function () {
        const length = target.store.__arrayGetLength(target.objID);
        if (length === 0) {
          return undefined;
        }
        const lastIndex = length - 1;
        const value = target.store.__getObjProperty(target.objID, lastIndex);
        target.store.__arrayDeleteElement(target.objID, lastIndex);
        target.store.__arraySetLength(target.objID, lastIndex);
        return value;
      };
    }
    // Check if it's a numeric index
    const index = Number(prop);
    return target.store.__getObjProperty(target.objID, index);
  },
  set(target: Target, prop: string, value: any) {
    const index = Number(prop);
    target.store.__setArrayElement(target.objID, index, value);
    return true;
  },
  has(_target: Target, p) {
    return p === "__id";
  },
};

function hash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash *= 16777619;
  }
  return hash >>> 0;
}
