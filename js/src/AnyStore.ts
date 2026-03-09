import initModule, { type InitOutput } from "../pkg/shared_heap";
import { fastHash } from "./hash";
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

export class SharedHeap {
  private workerID: number = 0;
  private proxyMap: Map<bigint, WeakRef<any>> = new Map();
  private binViewConstructors: Map<bigint, BinViewConstructor> = new Map();
  private binViewConstructorsById: Map<bigint, BinViewConstructor> = new Map();
  private finalization: FinalizationRegistry<bigint>;

  constructor(
    private mod: InitOutput,
    private memory: WebAssembly.Memory,
  ) {
    void this.getObjProperty;
    void this.setObjProperty;
    void this.setArrayElement;
    void this.arrayPush;
    void this.arrayPop;
    this.finalization = new FinalizationRegistry((id: bigint) => {
      this.drop(id);
    });
  }

  drop(obj: unknown): void {
    let id;
    if (typeof obj === "bigint") {
      id = obj;
    } else {
      id = SharedHeap.getIDOfProxy(obj);
    }
    this.proxyMap.delete(id!);
    this.binViewConstructorsById.delete(id!);
    this.mod.drop_object(id!);
  }

  getReferenceCount(obj: any): number {
    let id;
    if (typeof obj === "bigint") {
      id = obj;
    } else {
      id = SharedHeap.getIDOfProxy(obj);
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
    return new SharedHeap(mod, memory);
  }

  static async fromModule(workerData: WorkerData) {
    startWorkerID(workerData.workerID);
    const mod = await initModule({ memory: workerData.memory });
    return new SharedHeap(mod, workerData.memory);
  }

  withLockOn<T>(obj: any, fn: () => T): T {
    const id = SharedHeap.getIDOfProxy(obj);
    if (id == null) {
      throw new Error("Can only lock shared-heap proxy objects");
    }
    try {
      const locked = this.mod.lock(id);
      if (!locked) {
        throw new Error("Object is not available for locking");
      }
      return fn();
    } finally {
      this.mod.unlock(id);
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
    } else if (isBinView(id)) {
      const schemaKey = BigInt(this.mod.get_bin_view_schema(id));
      const viewPtr = this.mod.get_bin_view_ptr(id);
      const ctor =
        this.binViewConstructorsById.get(id) ??
        this.binViewConstructors.get(schemaKey);
      if (!ctor) {
        throw new Error("No constructor found for bin view with schema key");
      }
      this.binViewConstructorsById.set(id, ctor);
      obj = new ctor(
        new DataView(this.memory.buffer, Number(viewPtr), ctor.size()),
      );
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

  private getObjProperty(objID: bigint, prop: bigint): Something["value"] {
    this.mod.get_object_property(objID, prop);
    return this.decodePoppedValue();
  }

  private setObjProperty(objID: bigint, prop: bigint, value: unknown): void {
    this.pushSomething(value);
    this.mod.set_object_property(objID, prop);
  }

  private arrayGetLength(objID: bigint): number {
    return this.mod.array_get_length(objID);
  }

  private arraySetLength(objID: bigint, length: number): void {
    this.mod.array_set_length(objID, length);
  }

  private setArrayElement(objID: bigint, index: number, value: unknown): void {
    if (isBinViewDefinition(value)) {
      this.binViewConstructors.set(BigInt(value.schemaKey), value.constructor);
    }
    this.pushSomething(value);
    this.mod.array_set_index(objID, index);
  }

  private arrayGet(objID: bigint, index: number): Something["value"] {
    this.mod.array_get_index(objID, index);
    return this.decodePoppedValue();
  }

  private arrayPush(objID: bigint, ...items: unknown[]): number {
    let length = this.arrayGetLength(objID);
    for (const item of items) {
      if (isBinViewDefinition(item)) {
        this.binViewConstructors.set(BigInt(item.schemaKey), item.constructor);
      }
      this.pushSomething(item);
      this.mod.array_set_index(objID, length);
      length += 1;
    }
    this.arraySetLength(objID, length);
    return length;
  }

  private arrayPop(objID: bigint): Something["value"] | undefined {
    const length = this.arrayGetLength(objID);
    if (length === 0) {
      return undefined;
    }
    const lastIndex = length - 1;
    const value = this.arrayGet(objID, lastIndex);
    this.arraySetLength(objID, lastIndex);
    return value;
  }

  private decodePoppedValue(): Something["value"] {
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

  private pushSomething(value: unknown): void {
    if (isBinViewDefinition(value)) {
      this.binViewConstructors.set(BigInt(value.schemaKey), value.constructor);
      const binViewId = this.mod.create_bin_view(
        BigInt(value.schemaKey),
        value.constructor.size(),
      );
      this.binViewConstructorsById.set(binViewId, value.constructor);
      this.mod.something_push_ref_to_stack(binViewId);
      return;
    }

    const valueType = typeof value;
    if (valueType === "number") {
      if (Number.isInteger(value as number)) {
        this.mod.something_push_i32_to_stack(value as number);
      } else {
        this.mod.something_push_f64_to_stack(value as number);
      }
      return;
    }
    if (valueType === "string") {
      pushToStringStack(value as string);
      this.mod.something_push_string();
      return;
    }
    if (value === null) {
      this.mod.something_push_null_to_stack();
      return;
    }
    if (value instanceof Uint8Array) {
      pushBlobToStack(value);
      this.mod.something_push_blob();
      return;
    }
    if (SharedHeap.isProxy(value)) {
      const id = SharedHeap.getIDOfProxy(value);
      this.mod.something_push_ref_to_stack(id!);
      return;
    }
    if (valueType === "object") {
      const proxy = this.createObject(value);
      const id = SharedHeap.getIDOfProxy(proxy);
      this.mod.something_push_ref_to_stack(id!);
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
        return SharedHeap.i32(value);
      } else {
        return SharedHeap.f64(value);
      }
    } else if (typeof value === "string") {
      return SharedHeap.string(value);
    } else if (value === null) {
      return SharedHeap.null();
    } else if (value instanceof Uint8Array) {
      return SharedHeap.blob(value);
    }
    return null;
  }
}

type Target = {
  heapID: bigint;
  __store: SharedHeap;
  push?: typeof arrayPush;
  pop?: typeof arrayPop;
};

const proxySchema: ProxyHandler<Target> = {
  get(target: Target, prop: string) {
    if (prop === "heapID") {
      return target.heapID;
    }
    return target.__store["getObjProperty"](target.heapID, fastHash(prop));
  },
  set(target: Target, prop: string, value: any) {
    target.__store["setObjProperty"](target.heapID, fastHash(prop), value);
    return true;
  },
  has(_target: Target, p) {
    if (p === "heapID") {
      return true;
    }
    return false;
  },
};

function createProxyForObject(objID: bigint, store: SharedHeap): any {
  return new Proxy({ heapID: objID, __store: store }, proxySchema);
}

function arrayPush(this: Target, ...items: any[]): number {
  return this.__store["arrayPush"](this.heapID, ...items);
}

function arrayPop(this: Target): any {
  const value = this.__store["arrayPop"](this.heapID);
  return value;
}

function createProxyForArray(objID: bigint, store: SharedHeap): any {
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
        return target.__store["arrayGetLength"](target.heapID);
      case "push":
        return target.push;
      case "pop":
        return target.pop;
    }
    // Check if it's a numeric index
    const index = Number(prop);
    return target.__store["arrayGet"](target.heapID, index);
  },
  set(target: Target, prop: string, value: any) {
    const index = Number(prop);
    target.__store["setArrayElement"](target.heapID, index, value);
    return true;
  },
  has(_target: Target, p) {
    return p === "heapID";
  },
};

function isArrayID(objID: bigint): boolean {
  return (objID & 0b1n) !== 0n;
}

function isBinView(objID: bigint): boolean {
  return (objID & 0b11n) === 0b10n;
}

type BinViewConstructor = {
  new (data: DataView): any;
  size: () => number;
};

type BinViewDefinition = {
  type: "binview";
  constructor: BinViewConstructor;
  schemaKey: bigint;
};

function isBinViewDefinition(value: unknown): value is BinViewDefinition {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybe = value as Partial<BinViewDefinition>;
  return maybe.type === "binview";
}
