import { AnyStore } from "../src/AnyStore";
import { describe, expect, test } from "vitest";
import { setupFetch } from "./setupFetch";

setupFetch();

describe("hello", () => {
  test("world", async () => {
    const db = await AnyStore.create();
    const obj = db.createObject();
    obj.foo = 10;
    obj.bar = 10.1;
    obj.baz = "hello";

    expect(obj.foo).toBe(10);
    expect(obj.bar).toBe(10.1);
    expect(obj.baz).toBe("hello");
  });
});
