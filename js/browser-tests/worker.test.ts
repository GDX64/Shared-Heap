import { SharedHeap } from "../src/AnyStore";
import { test, describe, expect } from "vitest";
import Worker from "./worker?worker";

describe("worker window", async () => {
  const db = await SharedHeap.create();

  test("worker", async () => {
    const counter = db.createObject({ value: 0 });
    const N = 10_000;
    const N_WORKERS = 4;
    async function createWorker() {
      const worker = new Worker();
      const workerData = db.createWorker();
      worker.postMessage({
        counterID: SharedHeap.getIDOfProxy(counter),
        workerData,
        N,
      });
      await new Promise((resolve) => {
        worker.onmessage = (event) => {
          resolve(event.data);
        };
      });
    }

    await Promise.all(Array.from({ length: N_WORKERS }, createWorker));
    expect(counter.value).toBe(N * N_WORKERS);
  });
});
