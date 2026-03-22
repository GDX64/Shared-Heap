import type { SharedHeap } from "./AnyStore";

import { fastHash } from "./hash";

export type ObjectSchema = Record<string, unknown>;

type SharedObjInstance<T extends ObjectSchema> = SharedObj<T> & {
  [K in keyof T]: T[K];
};

type SharedObjDefinition<T extends ObjectSchema> = {
  type: "sharedobj";
  constructor: SharedObjConstructor<T>;
  schemaKey: bigint;
};

export type SharedObjConstructor<T extends ObjectSchema> = {
  from(data: T, store?: SharedHeap): SharedObjInstance<T>;
  fromHeapID(heapID: bigint, store: SharedHeap): SharedObjInstance<T>;
  schemaKey(): bigint;
  definition(): SharedObjDefinition<T>;
};

export class SharedObj<T extends ObjectSchema = ObjectSchema> {
  private initialData: T | null;

  constructor(
    public readonly heapID: bigint,
    protected store: SharedHeap,
    private readonly _schemaKey: bigint,
    private readonly _schemaSize: number,
    initialData: T | null = null,
  ) {
    this.initialData = initialData;
  }

  schemaKey(): bigint {
    return this._schemaKey;
  }

  schemaSize(): number {
    return this._schemaSize;
  }

  takeInitialData(): T {
    const result = this.initialData;
    this.initialData = null;
    return result ?? ({} as T);
  }

  static schema<T extends ObjectSchema>(schema: T): SchemaConstructor<T> {
    const keys = Object.keys(schema);
    const schemaKey = fastHash(JSON.stringify(keys));
    const schemaSize = keys.length;

    class SharedObjImpl extends SharedObj<T> {
      constructor(
        heapID: bigint,
        store: SharedHeap,
        initialData: T | null = null,
      ) {
        super(heapID, store, schemaKey, schemaSize, initialData);
      }

      static from(data: T, store?: SharedHeap): SharedObjInstance<T> {
        if (store) {
          const obj = new SharedObjImpl(
            store.createSharedObj(schemaKey, schemaSize),
            store,
          );
          keys.forEach((key) => {
            (obj as any)[key] = data[key as keyof T];
          });
          return obj as SharedObjInstance<T>;
        }

        return new SharedObjImpl(0n, null as any, {
          ...data,
        }) as SharedObjInstance<T>;
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
        get(this: SharedObj<T>) {
          return this.store["getSharedObjectProperty"](
            this.heapID,
            propertyKey,
          );
        },
        set(this: SharedObj<T>, value: T[keyof T]) {
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
