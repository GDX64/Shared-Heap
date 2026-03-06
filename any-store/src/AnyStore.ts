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
  private proxyMap: Map<number, any> = new Map();

  constructor(
    private mod: InitOutput,
    private memory: WebAssembly.Memory,
  ) {}

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

  createObject<T>(initial: T): T {
    const id = this.mod.create_object();
    const obj = createProxyForObject(id, this);
    this.proxyMap.set(id, obj);
    for (const key in initial) {
      const value = (initial as any)[key];
      obj[key] = value;
    }
    return obj;
  }

  getObjProperty(objID: number, prop: number): Something["value"] {
    this.mod.get_object_property(objID, prop);
    const result = popObjectFromStack();
    if (result == null) {
      return null;
    }
    if (typeof result === "object") {
      if (result.type === "ref") {
        return this.proxyMap.get(result.value) ?? null;
      }
      return result.value;
    }
    return result;
  }

  setObjProperty(objID: number, prop: number, value: unknown): void {
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
    return target.store.getObjProperty(target.objID, hash(prop));
  },
  set(target: Target, prop: string, value: any) {
    target.store.setObjProperty(target.objID, hash(prop), value);
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

function hash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash *= 16777619;
  }
  return hash >>> 0;
}
