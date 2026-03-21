import { SharedHeap } from "../src/AnyStore";
import { describe, expect, test } from "vitest";
import { setupFetch } from "./setupFetch";
import { SharedObj } from "../src/SharedObj";

setupFetch();

describe("SharedObj", () => {
  test("schema-based object reads and writes", async () => {
    const db = await SharedHeap.create();
    const Schema = SharedObj.schema({
      foo: 0,
      name: "alice",
    });
    db.registerObjectSchema(Schema);

    const obj = Schema.from({ foo: 10, name: "bob" }, db);

    obj.foo += 5;
    obj.name = "charlie";

    expect(obj.foo).toBe(15);
    expect(obj.name).toBe("charlie");
  });

  test("marker instance can be nested in createObject", async () => {
    const db = await SharedHeap.create();
    const User = SharedObj.schema({
      id: 0,
      name: "",
    });
    db.registerObjectSchema(User);

    const root = db.createObject({
      user: User.from({ id: 1, name: "alice" }),
    });

    expect(root.user.id).toBe(1);
    expect(root.user.name).toBe("alice");

    root.user.name = "bob";
    expect(root.user.name).toBe("bob");
  });
});
