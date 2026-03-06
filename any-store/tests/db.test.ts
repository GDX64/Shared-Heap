import { AnyStore } from "../src/AnyStore";
import { describe, expect, test } from "vitest";
import { setupFetch } from "./setupFetch";

setupFetch();

describe("hello", () => {
  test("world", async () => {
    const db = await AnyStore.create();
    const obj = db.createObject({
      foo: 10,
      bar: 10.1,
      baz: "hello",
    });

    expect(obj.foo).toBe(10);
    expect(obj.bar).toBe(10.1);
    expect(obj.baz).toBe("hello");
  });
  test("recursive", async () => {
    const db = await AnyStore.create();
    const fist = db.createObject({ name: "fist" });

    const obj = db.createObject({
      fist,
      foo: {
        bar: 10,
        baz: {
          qux: "world",
        },
      },
    });

    expect(obj.foo.bar).toBe(10);
    expect(obj.foo.baz.qux).toBe("world");
    expect(obj.fist.name).toBe("fist");
  });

  test("arrays", async () => {
    const db = await AnyStore.create();
    const obj = db.createObject({ arr: [1, 2, 3] });

    expect(obj.arr[0]).toBe(1);
    expect(obj.arr[1]).toBe(2);
    expect(obj.arr[2]).toBe(3);
    expect(obj.arr.length).toBe(3);
  });
});
