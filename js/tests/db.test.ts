import { SharedHeap } from "../src/AnyStore";
import { describe, expect, test } from "vitest";
import { setupFetch } from "./setupFetch";
import { SharedArray } from "../src/SharedArray";

setupFetch();

describe("hello", () => {
  test("world", async () => {
    const db = await SharedHeap.create();
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
    const db = await SharedHeap.create();
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
    const db = await SharedHeap.create();
    const obj = db.createObject({ arr: SharedArray.from([1]) });
    expect(obj.arr.get(0)).toBe(1);
    expect(obj.arr.get(1)).toBeNullable();
    expect(obj.arr.length).toBe(1);

    obj.arr.push(2);
    expect(obj.arr.get(1)).toBe(2);
    expect(obj.arr.length).toBe(2);
    obj.arr.pop();
    expect(obj.arr.get(1)).toBeNullable();
    expect(obj.arr.length).toBe(1);
  });

  test("array object", async () => {
    const db = await SharedHeap.create();
    const obj = db.createObject({
      arr: SharedArray.from([{ name: "hello", age: 30 }]),
    });
    expect(obj.arr instanceof SharedArray).toBe(true);

    expect(obj.arr.get(0)?.name).toBe("hello");
    expect(obj.arr.get(0)?.age).toBe(30);

    obj.arr.push({ name: "world", age: 25 });
    expect(obj.arr.get(1)?.name).toBe("world");
    expect(obj.arr.get(1)?.age).toBe(25);

    obj.arr.pop();
    expect(obj.arr.get(1)).toBeNullable();
  });

  test("force drop", async () => {
    const db = await SharedHeap.create();
    const obj = db.createObject({ name: "test" });
    expect(obj.name).toBe("test");
    db.drop(obj);
    expect(obj.name).toBeNullable();
  });

  test("nested drop", async () => {
    const db = await SharedHeap.create();
    const obj = db.createObject({
      child: { name: "child" },
      child2: { name: "child2" } as { name: string } | null,
    });
    expect(db.getReferenceCount(obj)).toBe(1);
    const child = obj.child;
    const child2 = obj.child2;

    expect(db.getReferenceCount(child)).toBe(2);
    expect(db.getReferenceCount(child2)).toBe(2);

    obj.child2 = null;
    expect(obj.child2).toBeNullable();
    expect(db.getReferenceCount(child2)).toBe(1);

    db.drop(child2);
    expect(db.getReferenceCount(child2)).toBe(0);

    expect(obj.child.name).toBe("child");
    db.drop(obj);

    expect(db.getReferenceCount(child)).toBe(1);

    expect(obj.child).toBeNullable();
    expect(child.name).toBe("child");
    db.drop(child);
    expect(child.name).toBeNullable();
  });

  test("dynamic drop", async () => {
    const db = await SharedHeap.create();
    const obj = db.createObject({} as { child?: { name: string } });
    expect(obj.child).toBeNullable();

    obj.child = { name: "child" };
    expect(obj.child.name).toBe("child");
    //now there are 2 refs to child
    //one ref is in the proxy that we just created
    //by accessing obj.child, the other is in the obj itself
    expect(db.getReferenceCount(obj.child)).toBe(2);
    obj.child;
    obj.child;
    obj.child;
    //we can access obj.child multiple times, but the reference count should still be 2
    expect(db.getReferenceCount(obj.child)).toBe(2);

    const childID = SharedHeap.getIDOfProxy(obj.child);
    db.drop(obj.child);
    //now we dropped the proxy for child, there should still be 1 ref to child in obj
    expect(db.getReferenceCount(childID)).toBe(1);
    //the simple act of accessing obj.child should recreate the proxy for child, and increase the ref count to 2 again
    expect(db.getReferenceCount(obj.child)).toBe(2);

    db.drop(childID);
    expect(db.getReferenceCount(childID)).toBe(1);

    //the only way of dropping the last ref to child is to drop obj, since obj is the only thing that holds a ref to child
    db.drop(obj);
    expect(db.getReferenceCount(childID)).toBe(0);
  });

  test("worker mode mirrors updates across module instances", async () => {
    const db = await SharedHeap.create();
    const counter = db.createObject({ value: 1 });
    const counterID = SharedHeap.getIDOfProxy(counter)!;

    const workerData = db.createWorker();
    const dbFromWorker = await SharedHeap.fromModule(workerData);
    const workerCounter = dbFromWorker.getObject<{ value: number }>(counterID)!;

    workerCounter.value += 4;
    expect(counter.value).toBe(5);

    counter.value += 3;
    expect(workerCounter.value).toBe(8);
  });

  test("createWorker increments worker id", async () => {
    const db = await SharedHeap.create();
    const first = db.createWorker();
    const second = db.createWorker();

    expect(first.workerID).toBe(1);
    expect(second.workerID).toBe(2);
    expect(first.memory).toBe(second.memory);
  });

  test("withLockOn executes callback and returns value", async () => {
    const db = await SharedHeap.create();
    const counter = db.createObject({ value: 10 });

    const result = db.withLockOn(counter, () => {
      counter.value += 2;
      return counter.value;
    });

    expect(result).toBe(12);
    expect(counter.value).toBe(12);
  });

  test("withLockOn rejects non-proxy values", async () => {
    const db = await SharedHeap.create();

    expect(() => db.withLockOn({ plain: true }, () => 1)).toThrow(
      "Can only lock shared-heap proxy objects",
    );
  });

  test("getObject returns null for dropped id", async () => {
    const db = await SharedHeap.create();
    const obj = db.createObject({ alive: true });
    const id = SharedHeap.getIDOfProxy(obj)!;

    db.drop(obj);

    expect(db.getObject(id)).toBeNull();
  });

  test("static helpers for proxy detection", async () => {
    const db = await SharedHeap.create();
    const obj = db.createObject({ foo: 1 });

    expect(SharedHeap.isProxy(obj)).toBe(true);
    expect(SharedHeap.getIDOfProxy(obj)).toBeTypeOf("bigint");

    expect(SharedHeap.isProxy({})).toBe(false);
    expect(SharedHeap.getIDOfProxy({})).toBeNull();
  });

  test("somethingFromValue maps supported types", () => {
    expect(SharedHeap.somethingFromValue(10)).toEqual({
      tag: "i32",
      value: 10,
    });
    expect(SharedHeap.somethingFromValue(10.5)).toEqual({
      tag: "f64",
      value: 10.5,
    });
    expect(SharedHeap.somethingFromValue("hello")).toEqual({
      tag: "string",
      value: "hello",
    });
    expect(SharedHeap.somethingFromValue(null)).toEqual({
      tag: "null",
      value: null,
    });
    expect(SharedHeap.somethingFromValue(new Uint8Array([1, 2]))).toEqual({
      tag: "blob",
      value: new Uint8Array([1, 2]),
    });
    expect(SharedHeap.somethingFromValue({ nope: true })).toBeNull();
  });
});
