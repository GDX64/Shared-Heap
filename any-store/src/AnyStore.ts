import initModule, { type InitOutput } from "../pkg/any_store";
import {
  popObjectFromStack,
  pushToStringStack,
  startWorkerID,
} from "./importFunctions";
import type { Blob, F64, I32, Null, Something, String } from "./types";

type WorkerData = {
  memory: WebAssembly.Memory;
  workerID: number;
};

export class AnyStore {
  private workerID: number = 0;

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

  createObject() {
    const id = this.mod.create_object();
    return createProxyForObject(id, this);
  }

  getObjProperty(objID: number, prop: number): Something["value"] {
    this.mod.get_object_property(objID, prop);
    return popObjectFromStack();
  }

  setObjProperty(objID: number, prop: number, value: Something): void {
    this.addToStack(value);
    this.mod.set_object_property(objID, prop);
  }

  private addToStack(value: Something): void {
    if (value.tag === "i32") {
      this.mod.something_push_i32_to_stack(value.value);
    } else if (value.tag === "f64") {
      this.mod.something_push_f64_to_stack(value.value);
    } else if (value.tag === "string") {
      pushToStringStack(value.value);
      this.mod.something_push_string();
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

  static somethingFromValue(value: any): Something | null {
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
  objID: number;
  store: AnyStore;
};

const proxySchema = {
  get(target: Target, prop: any) {
    return target.store.getObjProperty(target.objID, hash(prop));
  },
  set(target: Target, prop: any, value: any) {
    target.store.setObjProperty(
      target.objID,
      hash(prop),
      AnyStore.somethingFromValue(value) ?? AnyStore.null(),
    );
    return true;
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
