import { bench, describe } from "vitest";
import { BinView } from "../src/BinView";
import { SharedHeap } from "../src/AnyStore";
import { setupFetch } from "./setupFetch";

setupFetch();

describe("bin view", async () => {
  const BinViewConstructor = BinView.schema({
    counter: "f64",
  });
  const db = await SharedHeap.create();
  db.registerView(BinViewConstructor);
  const obj = db.createObject({
    view: BinViewConstructor.empty(),
  });
  const N = 10_000;
  const view = obj.view;
  view.counter = 0;
  bench("heap counting", async () => {
    for (let i = 0; i < N; i++) {
      view.counter += 1;
    }
  });

  let i = 0;
  bench("normal js counter", async () => {
    for (let j = 0; j < N; j++) {
      i += 1;
    }
  });
});
