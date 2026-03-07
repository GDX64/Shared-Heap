import { setupFetch } from "./setupFetch";
import { AnyStore } from "../src/AnyStore";
import { bench, describe } from "vitest";

setupFetch();

describe("benchmark", async () => {
  const db = await AnyStore.create();
  const counter = db.createObject({ value: 0 });
  const N = 100_000;
  bench("db", () => {
    for (let i = 0; i < N; i++) {
      counter.value += 1;
    }
  });

  let value = 0;
  bench("js", () => {
    for (let i = 0; i < N; i++) {
      value += 1;
    }
  });
});
