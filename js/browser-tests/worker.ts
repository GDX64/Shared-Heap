import { SharedHeap } from "../src/AnyStore";

self.onmessage = async (event) => {
  if (event.data.testCase === "db-primitives") {
    await dbPrimitivesTest(event);
    return;
  }

  if (event.data.testCase === "db-recursive") {
    await dbRecursiveTest(event);
    return;
  }

  if (event.data.testCase === "db-array-push") {
    await dbArrayPushTest(event);
    return;
  }

  self.postMessage("done");
};

async function dbPrimitivesTest(event: MessageEvent) {
  const { iterations, workerData, rootID } = event.data;

  const db = await SharedHeap.fromModule(workerData);
  const root = db.getObject<{ foo: number; bar: number; baz: string }>(rootID)!;

  for (let i = 0; i < iterations; i++) {
    db.withLockOn(root, () => {
      root.foo += 1;
      root.bar += 0.5;
      root.baz = "hello";
    });
  }

  self.postMessage("done");
}

async function dbRecursiveTest(event: MessageEvent) {
  const { iterations, workerData, rootID } = event.data;

  const db = await SharedHeap.fromModule(workerData);
  const root = db.getObject<{ foo: { bar: number; baz: { qux: string } } }>(
    rootID,
  )!;

  for (let i = 0; i < iterations; i++) {
    db.withLockOn(root, () => {
      root.foo.bar += 1;
      root.foo.baz.qux = "world";
    });
  }

  self.postMessage("done");
}

async function dbArrayPushTest(event: MessageEvent) {
  const { iterations, workerData, rootID } = event.data;

  const db = await SharedHeap.fromModule(workerData);
  const root = db.getObject<{
    arr: {
      length: number;
      push: (item: { name: string; age: number }) => void;
    };
  }>(rootID)!;

  for (let i = 0; i < iterations; i++) {
    root.arr.push({ name: "worker", age: 25 });
  }

  self.postMessage("done");
}
