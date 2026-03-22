import type { SharedHeap } from "./AnyStore";

import { fastHash } from "./hash";

export type ObjectSchema = Record<string, SchemaValue<any>>;

type SchemaValue<T> = {
  __phantom: T;
};

type SharedObjInstance<T extends ObjectSchema> = SharedObj & {
  [K in keyof T]: T[K]["__phantom"];
};

type SharedObjDefinition<T extends ObjectSchema> = {
  type: "sharedobj";
  constructor: SharedObjConstructor<T>;
  schemaKey: bigint;
};

export type SharedObjConstructor<T extends ObjectSchema> = {
  from(data: ExtractValues<T>, store: SharedHeap): SharedObjInstance<T>;
  fromHeapID(heapID: bigint, store: SharedHeap): SharedObjInstance<T>;
  schemaKey(): bigint;
  definition(): SharedObjDefinition<T>;
};

type ExtractValues<T extends ObjectSchema> = {
  [K in keyof T]: T[K]["__phantom"];
};

export class SharedObj {
  constructor(
    public readonly heapID: bigint,
    protected store: SharedHeap,
    private readonly _schemaKey: bigint,
    private readonly _schemaSize: number,
  ) {}

  schemaKey(): bigint {
    return this._schemaKey;
  }

  schemaSize(): number {
    return this._schemaSize;
  }

  static value<T>(): SchemaValue<T> {
    return {} as SchemaValue<T>;
  }

  static schema<T extends ObjectSchema>(schema: T): SchemaConstructor<T> {
    const keys = Object.keys(schema);
    const schemaKey = fastHash(JSON.stringify(keys));
    const schemaSize = keys.length;

    class SharedObjImpl extends SharedObj {
      constructor(heapID: bigint, store: SharedHeap) {
        super(heapID, store, schemaKey, schemaSize);
      }

      static from(data: T, store: SharedHeap): SharedObjInstance<T> {
        const obj = new SharedObjImpl(
          store.createSharedObj(schemaKey, schemaSize),
          store,
        );
        keys.forEach((key) => {
          (obj as any)[key] = data[key as keyof T];
        });
        return obj as SharedObjInstance<T>;
      }

      static fromHeapID(
        heapID: bigint,
        store: SharedHeap,
      ): SharedObjInstance<T> {
        return new SharedObjImpl(heapID, store) as SharedObjInstance<T>;
      }

      static schemaKey() {
        return schemaKey;
      }

      static definition(): SharedObjDefinition<T> {
        return {
          type: "sharedobj",
          constructor: SharedObjImpl as unknown as SharedObjConstructor<T>,
          schemaKey,
        };
      }
    }

    keys.forEach((key, propertyKey) => {
      Object.defineProperty(SharedObjImpl.prototype, key, {
        get(this: SharedObj) {
          return this.store["getSharedObjectProperty"](
            this.heapID,
            propertyKey,
          );
        },
        set(this: SharedObj, value: T[keyof T]) {
          this.store["setSharedObjectProperty"](
            this.heapID,
            propertyKey,
            value,
          );
        },
      });
    });

    return SharedObjImpl as unknown as SchemaConstructor<T>;
  }
}

type SchemaConstructor<T extends ObjectSchema> = SharedObjConstructor<T>;
