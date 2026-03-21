import { SharedHeap } from "../src/AnyStore";
import { describe, expect, test } from "vitest";
import { setupFetch } from "./setupFetch";
import { SharedObj } from "../src/SharedObj";

setupFetch();

describe("SharedObj", () => {
  test("world", async () => {
    const db = await SharedHeap.create();
    const Schema = SharedObj.schema({
      foo: 0,
      name: "alice",
    });
    const obj = Schema.from({ foo: 10, name: "bob" }, db);
    db.registerObjectSchema(Schema);

    obj.foo += 5;
    obj.name = "charlie";

    expect(obj.foo).toBe(15);
    expect(obj.name).toBe("charlie");
  });
});
