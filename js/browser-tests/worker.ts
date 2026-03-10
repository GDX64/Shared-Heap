import { SharedHeap } from "../src/AnyStore";
import { SharedArray } from "../src/SharedArray";

self.onmessage = async (event) => {
  const { N, workerData, counterID } = event.data;

  const db = await SharedHeap.fromModule(workerData);
  const counter = db.getObject<{ value: number }>(counterID)!;
  const arr = db.createObject(SharedArray.from([0]));

  for (let i = 0; i < N * 100; i++) {
    arr.set(0, arr.get(0) + 1);
    // db.withLockOn(counter, () => {
    // counter.value += 1;
    // });
  }

  self.postMessage("done");
};
