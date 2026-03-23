import { SharedHeap } from "../src/AnyStore";
import { test, describe, expect } from "vitest";
import Worker from "./worker?worker";
import { SharedArray } from "../src/SharedArray";
import { SharedObj } from "../src/lib";

describe("worker window", async () => {
  const db = await SharedHeap.create();

  async function runWorker(payload: {
    rootID: bigint;
    iterations: number;
    testCase: string;
  }): Promise<void> {
    const worker = new Worker();
    const workerData = db.createWorker();

    try {
      await new Promise<void>((resolve) => {
        worker.onmessage = (event) => {
          resolve(event.data);
        };
        worker.postMessage({
          ...payload,
          workerData,
        });
      });
    } finally {
      worker.terminate();
    }
  }

  test("parallel workers update primitive properties on same object", async () => {
    const root = db.createObject({ foo: 10, bar: 10.1, baz: "init" });
    const rootID = SharedHeap.getIDOfProxy(root)!;
    const iterations = 3_000;
    const N_WORKERS = 4;

    await Promise.all(
      Array.from({ length: N_WORKERS }, () =>
        runWorker({ rootID, iterations, testCase: "db-primitives" }),
      ),
    );

    expect(root.foo).toBe(10 + iterations * N_WORKERS);
    expect(root.bar).toBe(10.1 + iterations * N_WORKERS * 0.5);
    expect(root.baz).toBe("hello");
  });

  test("parallel workers update nested object properties", async () => {
    const root = db.createObject({
      foo: {
        bar: 10,
        baz: { qux: "start" },
      },
    });
    const rootID = SharedHeap.getIDOfProxy(root)!;
    const iterations = 2_000;
    const N_WORKERS = 5;

    await Promise.all(
      Array.from({ length: N_WORKERS }, () =>
        runWorker({ rootID, iterations, testCase: "db-recursive" }),
      ),
    );

    expect(root.foo.bar).toBe(10 + iterations * N_WORKERS);
    expect(root.foo.baz.qux).toBe("world");
  });

  test("parallel workers push to same shared array", async () => {
    const root = db.createObject({
      arr: SharedArray.from([{ name: "worker0" }], db),
    });
    const rootID = SharedHeap.getIDOfProxy(root)!;
    const iterations = 1_500;
    const N_WORKERS = 4;

    await Promise.all(
      Array.from({ length: N_WORKERS }, () =>
        runWorker({ rootID, iterations, testCase: "db-array-push" }),
      ),
    );

    expect(root.arr.length).toBe(1 + iterations * N_WORKERS);
    const allCorrect = root.arr.every((item, index) => {
      return item.name === "worker" + index;
    });
    expect(allCorrect).toBe(true);
  });
});

describe("shared obj", () => {
  test("shared obj", async () => {
    const db = await SharedHeap.create();
    const CounterSchema = SharedObj.schema({
      value: SharedObj.value<number>(),
    });
    db.registerObjectSchema(CounterSchema);
    const counter = CounterSchema.from({ value: 0 }, db);

    for (let i = 0; i < 1000_000; i++) {
      counter.value += 1;
    }
    expect(counter.value).toBe(1000_000);
  });
});
