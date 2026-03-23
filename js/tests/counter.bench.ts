import { setupFetch } from "./setupFetch";
import { SharedHeap } from "../src/AnyStore";
import { bench, describe } from "vitest";
import { reactive } from "vue";
import { BinView } from "../src/BinView";
import { SharedArray } from "../src/SharedArray";
import { SharedObj } from "../src/SharedObj";

setupFetch();

const db = await SharedHeap.create();
const N = 10_000;

// Simple counter benchmark
describe("simple counter increment", () => {
  const BinViewConstructor = BinView.schema({
    counter: "f64",
  });
  const CounterSchema = SharedObj.schema({
    value: SharedObj.value<number>(),
  });
  db.registerView(BinViewConstructor);
  db.registerObjectSchema(CounterSchema);
  const counter = db.createObject({
    value: 0,
    view: BinViewConstructor.empty(),
    arr: SharedArray.from([0], db),
  });
  const sharedObjCounter = CounterSchema.from({ value: 0 }, db);
  const view = counter.view;
  view.counter = 0;
  bench("view counting", () => {
    for (let i = 0; i < N; i++) {
      view.counter += 1;
    }
  });

  const arr = counter.arr;
  bench("array counting", () => {
    for (let i = 0; i < N; i++) {
      arr.set(0, arr.get(0) + 1);
    }
  });

  bench("shared heap", () => {
    for (let i = 0; i < N; i++) {
      counter.value += 1;
    }
  });

  bench("shared object kind", () => {
    try {
      for (let i = 0; i < N; i++) {
        sharedObjCounter.value += 1;
      }
    } catch (e) {
      console.error("Error during shared object counting benchmark:", e);
    }
  });

  const normalCounter = { value: 0 };
  bench("normal js", () => {
    for (let i = 0; i < N; i++) {
      normalCounter.value += 1;
    }
  });

  const vueCounter = reactive({ value: 0 });
  bench("vue js", () => {
    for (let i = 0; i < N; i++) {
      vueCounter.value += 1;
    }
  });
});
