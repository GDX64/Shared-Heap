import { fastHash } from "./hash";

type SchemaValues = "f64" | "i32";

type Schema = Record<string, SchemaValues>;

export class BinView {
  constructor(
    public data: DataView,
    public heapID: bigint,
  ) {}

  static size(): number {
    return 0;
  }

  static definition(): any {
    throw new Error("Must call schema method to get definition");
  }

  static schema<S extends Schema>(schema: S): ExtendedBinViewConstructor<S> {
    const b = class extends BinView {};

    const schemaKey = fastHash(JSON.stringify(schema));

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
        Object.defineProperty(b.prototype, key, {
          get,
          set,
        });
      }
    }

    Object.defineProperty(b, "size", {
      value: function () {
        return index;
      },
    });

    Object.defineProperty(b, "definition", {
      value: function () {
        return {
          type: "binview",
          constructor: b,
          schemaKey,
        };
      },
    });

    return b as any as ExtendedBinViewConstructor<S>;
  }
}

type ValueMap = {
  f64: number;
  i32: number;
};

type MappedSchema<S extends Schema> = {
  [K in keyof S]: ValueMap[S[K]];
};

export type ExtendedBinView<S extends Schema> = BinView & MappedSchema<S>;

export interface ExtendedBinViewConstructor<S extends Schema> extends BinView {
  new (data: DataView): ExtendedBinView<S>;
  schema: <S extends Schema>(schema: S) => ExtendedBinViewConstructor<S>;
  size: () => number;
  definition: () => MappedSchema<S>;
}
