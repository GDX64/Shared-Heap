import { fastHash } from "./hash";

type SchemaValues = "f64";

type Schema = Record<string, SchemaValues>;

export class BinView {
  constructor(
    private data: DataView,
    public readonly heapID: bigint,
  ) {}

  schemaKey(): bigint {
    throw new Error("Must call schema method to get schema key");
  }

  size(): number {
    throw new Error("Must call schema method to get size");
  }

  static size(): number {
    return 0;
  }

  static definition(): SchemaDefinition<any> {
    throw new Error("Must call schema method to get definition");
  }

  static empty(): BinView {
    return new BinView(new DataView(new ArrayBuffer(0)), 0n);
  }

  static schema<S extends Schema>(schema: S): ExtendedBinViewConstructor<S> {
    const schemaKey = fastHash(JSON.stringify(schema));
    class XB extends BinView {
      static empty(): BinView {
        return new XB(new DataView(new ArrayBuffer(this.size())), 0n);
      }

      schemaKey() {
        return schemaKey;
      }

      size(): number {
        return (this.constructor as typeof XB).size();
      }
    }

    let index = 0;
    for (const key in schema) {
      const type = schema[key];
      const thisIndex = index;
      let get;
      let set;
      if (type === "f64") {
        get = function (this: BinView) {
          const data: DataView = this.data;
          return data.getFloat64(thisIndex);
        };
        set = function (this: BinView, value: number) {
          const data: DataView = this.data;
          data.setFloat64(thisIndex, value);
        };
        index += 8;
      } else if (type === "i32") {
        get = function (this: BinView) {
          const data: DataView = this.data;
          return data.getInt32(thisIndex);
        };
        set = function (this: BinView, value: number) {
          const data: DataView = this.data;
          data.setInt32(thisIndex, value);
        };
        index += 4;
      }
      if (get) {
        Object.defineProperty(XB.prototype, key, {
          get,
          set,
        });
      }
    }

    Object.defineProperty(XB, "size", {
      value: function () {
        return index;
      },
    });

    Object.defineProperty(XB, "definition", {
      value: function () {
        return {
          type: "binview",
          constructor: XB,
          schemaKey,
        };
      },
    });

    return XB as any as ExtendedBinViewConstructor<S>;
  }
}

type SchemaDefinition<S extends Schema> = {
  constructor: ExtendedBinViewConstructor<S>;
  schemaKey: bigint;
};

type ValueMap = {
  f64: number;
  i32: number;
};

type MappedSchema<S extends Schema> = {
  [K in keyof S]: ValueMap[S[K]];
};

export type ExtendedBinView<S extends Schema> = BinView & MappedSchema<S>;

export interface ExtendedBinViewConstructor<S extends Schema> extends BinView {
  new (data: DataView, heapID: bigint): ExtendedBinView<S>;
  schema: <S extends Schema>(schema: S) => ExtendedBinViewConstructor<S>;
  size: () => number;
  definition: () => SchemaDefinition<S>;
  empty: () => ExtendedBinView<S>;
}
