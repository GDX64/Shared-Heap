import { SharedHeap } from "../src/AnyStore";

self.onmessage = async (event) => {
  const { N, workerData, counterID } = event.data;

  const db = await SharedHeap.fromModule(workerData);
  const counter = db.getObject<{ value: number }>(counterID)!;

  for (let i = 0; i < N; i++) {
    db.withLockOn(counter, () => {
      counter.value += 1;
    });
  }

  self.postMessage("done");
};
