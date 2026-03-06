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
      qux: new Uint8Array([1, 2, 3]),
    });

    expect(obj.foo).toBe(10);
    expect(obj.bar).toBe(10.1);
    expect(obj.baz).toBe("hello");
    expect(obj.qux).toEqual(new Uint8Array([1, 2, 3]));
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
    const obj = db.createObject({ arr: [1] });

    expect(obj.arr[0]).toBe(1);
    expect(obj.arr[1]).toBeNullable();
    expect(obj.arr.length).toBe(1);

    obj.arr.push(2);
    expect(obj.arr[1]).toBe(2);
    expect(obj.arr.length).toBe(2);
    obj.arr.pop();
    expect(obj.arr[1]).toBeNullable();
    expect(obj.arr.length).toBe(1);
  });

  test("array object", async () => {
    const db = await AnyStore.create();
    const obj = db.createObject({ arr: [{ name: "hello", age: 30 }] });

    expect(obj.arr[0].name).toBe("hello");
    expect(obj.arr[0].age).toBe(30);

    obj.arr.push({ name: "world", age: 25 });
    expect(obj.arr[1].name).toBe("world");
    expect(obj.arr[1].age).toBe(25);

    obj.arr.pop();
    expect(obj.arr[1]).toBeNullable();
  });
});
