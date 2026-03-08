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

    const obj = db.createObject({
      view: view.definition(),
    });

    obj.view.a = 10.5;
    obj.view.b = 42;

    expect(obj.view.a).toBe(10.5);
    expect(obj.view.b).toBe(42);
  });
});
