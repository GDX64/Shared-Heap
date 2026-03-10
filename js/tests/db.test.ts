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
    const obj = db.createObject({ arr: [1] });

    expect(obj.arr.at(0)).toBe(1);
    expect(obj.arr.at(1)).toBeNullable();
    expect(obj.arr.length).toBe(1);

    obj.arr.push(2);
    expect(obj.arr.at(1)).toBe(2);
    expect(obj.arr.length).toBe(2);
    obj.arr.pop();
    expect(obj.arr.at(1)).toBeNullable();
    expect(obj.arr.length).toBe(1);
  });

  test("array object", async () => {
    const db = await SharedHeap.create();
    const obj = db.createObject({
      arr: [{ name: "hello", age: 30 }],
    });

    expect(obj.arr instanceof SharedArray).toBe(true);

    expect(obj.arr.at(0)?.name).toBe("hello");
    expect(obj.arr.at(0)?.age).toBe(30);

    obj.arr.push({ name: "world", age: 25 });
    expect(obj.arr.at(1)?.name).toBe("world");
    expect(obj.arr.at(1)?.age).toBe(25);

    obj.arr.pop();
    expect(obj.arr.at(1)).toBeNullable();
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
});
