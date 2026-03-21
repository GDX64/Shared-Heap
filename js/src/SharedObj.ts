import type { SharedHeap } from "./AnyStore";
import { fastHash } from "./hash";

export type ObjectSchema = Record<string, any>;

export class SharedObj {
  heapID!: bigint;
  store!: SharedHeap;

  static schema<T extends ObjectSchema>(schema: T) {
    class SharedObjImpl {}

    Object.keys(schema).forEach((key) => {
      Object.defineProperty(SharedObjImpl.prototype, key, {
        get(this: SharedObj) {
          return this.store["getObjProperty"](this.heapID, fastHash(key));
        },
        set(this: SharedObj, value) {
          this.store["setObjProperty"](this.heapID, fastHash(key), value);
        },
      });
    });
  }
}

type SharedObjImpl<T extends ObjectSchema> = SharedObj & {
  [K in keyof T]: any;
};
