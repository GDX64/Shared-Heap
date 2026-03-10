import { describe, expect, test } from "vitest";
import { SharedHeap } from "../src/AnyStore";
import { BinView } from "../src/BinView";
import { setupFetch } from "./setupFetch";

setupFetch();

describe("bin view", async () => {
  test("bin view", async () => {
    const db = await SharedHeap.create();
    const view = BinView.schema({
      a: "f64",
      b: "i32",
    });

    db.registerView(view);

    const obj = db.createObject({
      view: view.empty(),
      another: view.empty(),
    });

    obj.view.a = 10.5;
    obj.view.b = 42;

    obj.another.a = 20.5;
    obj.another.b = 84;

    const another = obj.another;

    expect(obj.view.a).toBe(10.5);
    expect(obj.view.b).toBe(42);
    expect(another.a).toBe(20.5);
    expect(another.b).toBe(84);

    db.drop(obj);

    expect(db.getReferenceCount(another)).toBe(1);
    const anotherID = SharedHeap.getIDOfProxy(another);
    db.drop(another);
    expect(db.getReferenceCount(anotherID)).toBe(0);
  });
});
