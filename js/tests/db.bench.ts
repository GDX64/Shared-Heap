import { setupFetch } from "./setupFetch";
import { SharedHeap } from "../src/AnyStore";
import { bench, describe } from "vitest";
import { SharedArray } from "../src/SharedArray";
import { SharedObj } from "../src/SharedObj";

setupFetch();

const db = await SharedHeap.create();
const N = 10_000;

//User record updates (realistic scenario)
describe("user record updates", () => {
  const UserSchema = SharedObj.schema({
    id: 1,
    name: "John Doe",
    age: 30,
    score: 0,
  });
  db.registerObjectSchema(UserSchema);

  const user = db.createObject({
    id: 1,
    name: "John Doe",
    age: 30,
    score: 0,
  });

  const sharedUser = UserSchema.from(
    {
      id: 1,
      name: "John Doe",
      age: 30,
      score: 0,
    },
    db,
  );

  bench("shared heap", () => {
    for (let i = 0; i < N; i++) {
      user.score += 1;
      if (user.score % 100 === 0) {
        user.age += 1;
      }
    }
  });

  bench("shared object kind", () => {
    for (let i = 0; i < N; i++) {
      sharedUser.score += 1;
      if (sharedUser.score % 100 === 0) {
        sharedUser.age += 1;
      }
    }
  });

  let normalUser = {
    id: 1,
    name: "John Doe",
    age: 30,
    score: 0,
  };

  bench("normal js", () => {
    for (let i = 0; i < N; i++) {
      normalUser.score += 1;
      if (normalUser.score % 100 === 0) {
        normalUser.age += 1;
      }
    }
  });
});

// Array operations
describe("array push operations", () => {
  const list = db.createObject({ items: SharedArray.from<number>([]) });

  bench("shared heap", () => {
    list.items = SharedArray.from<number>([]);
    for (let i = 0; i < 1000; i++) {
      list.items.push(i);
    }
  });

  let normalList = { items: [] as number[] };

  bench("normal js", () => {
    normalList.items = [];
    for (let i = 0; i < 1000; i++) {
      normalList.items.push(i);
    }
  });
});

// Mixed operations (read/write)
describe("mixed read/write operations", () => {
  const data = db.createObject({
    counter: 0,
    total: 0,
    average: 0,
  });

  bench("shared heap", () => {
    for (let i = 0; i < N; i++) {
      data.counter += 1;
      data.total += i;
      data.average = data.total / data.counter;
    }
  });

  let normalData = {
    counter: 0,
    total: 0,
    average: 0,
  };

  bench("normal js", () => {
    for (let i = 0; i < N; i++) {
      normalData.counter += 1;
      normalData.total += i;
      normalData.average = normalData.total / normalData.counter;
    }
  });
});

// Object property access pattern
describe("property access pattern", () => {
  const ConfigSchema = SharedObj.schema({
    enabled: true,
    count: 0,
    multiplier: 1.5,
  });
  db.registerObjectSchema(ConfigSchema);

  const config = db.createObject({
    enabled: true,
    count: 0,
    multiplier: 1.5,
  });

  const sharedConfig = ConfigSchema.from(
    {
      enabled: true,
      count: 0,
      multiplier: 1.5,
    },
    db,
  );

  bench("shared heap", () => {
    for (let i = 0; i < N; i++) {
      if (config.enabled) {
        config.count += config.multiplier;
      }
    }
  });

  bench("shared object kind", () => {
    for (let i = 0; i < N; i++) {
      if (sharedConfig.enabled) {
        sharedConfig.count += sharedConfig.multiplier;
      }
    }
  });

  let normalConfig = {
    enabled: true,
    count: 0,
    multiplier: 1.5,
  };

  bench("normal js", () => {
    for (let i = 0; i < N; i++) {
      if (normalConfig.enabled) {
        normalConfig.count += normalConfig.multiplier;
      }
    }
  });
});
