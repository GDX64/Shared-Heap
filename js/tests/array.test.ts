import { describe, test, expect } from "vitest";
import { setupFetch } from "./setupFetch";
import { SharedHeap } from "../src/AnyStore";
import { SharedArray } from "../src/SharedArray";

setupFetch();

describe("SharedArray", () => {
  describe("basic operations", () => {
    test("length property", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      expect(obj.arr.length).toBe(3);
    });

    test("length property is read-only", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      expect(() => {
        obj.arr.length = 5;
      }).toThrow("Length property is read-only");
    });

    test("get method", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      expect(obj.arr.get(0)).toBe(10);
      expect(obj.arr.get(1)).toBe(20);
      expect(obj.arr.get(2)).toBe(30);
    });

    test("set method", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      obj.arr.set(1, 99);
      expect(obj.arr.get(1)).toBe(99);
    });

    test("at method with positive index", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      expect(obj.arr.at(0)).toBe(10);
      expect(obj.arr.at(1)).toBe(20);
      expect(obj.arr.at(2)).toBe(30);
    });

    test("at method with negative index", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      expect(obj.arr.at(-1)).toBe(30);
      expect(obj.arr.at(-2)).toBe(20);
      expect(obj.arr.at(-3)).toBe(10);
    });

    test("at method with out of bounds index", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      expect(obj.arr.at(5)).toBeUndefined();
      expect(obj.arr.at(-5)).toBeUndefined();
    });
  });

  describe("stack operations", () => {
    test("push single item", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2]) });
      obj.arr.push(3);
      expect(obj.arr.length).toBe(3);
      expect(obj.arr.get(2)).toBe(3);
    });

    test("push multiple items sequentially", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1]) });
      obj.arr.push(2);
      obj.arr.push(3);
      obj.arr.push(4);
      expect(obj.arr.length).toBe(4);
      expect(obj.arr.get(3)).toBe(4);
    });

    test("pop removes and returns last item", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      const popped = obj.arr.pop();
      expect(popped).toBe(3);
      expect(obj.arr.length).toBe(2);
    });

    test("pop on empty array", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([]) });
      const popped = obj.arr.pop();
      expect(popped).toBeUndefined();
    });
  });

  describe("queue operations", () => {
    test("shift removes and returns first item", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      const shifted = obj.arr.shift();
      expect(shifted).toBe(1);
      expect(obj.arr.length).toBe(2);
      expect(obj.arr.get(0)).toBe(2);
      expect(obj.arr.get(1)).toBe(3);
    });

    test("shift on empty array", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([]) });
      const shifted = obj.arr.shift();
      expect(shifted).toBeUndefined();
    });

    test("unshift single item", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([2, 3]) });
      const newLength = obj.arr.unshift(1);
      expect(newLength).toBe(3);
      expect(obj.arr.get(0)).toBe(1);
      expect(obj.arr.get(1)).toBe(2);
      expect(obj.arr.get(2)).toBe(3);
    });

    test("unshift multiple items", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([3, 4]) });
      const newLength = obj.arr.unshift(1, 2);
      expect(newLength).toBe(4);
      expect(obj.arr.get(0)).toBe(1);
      expect(obj.arr.get(1)).toBe(2);
      expect(obj.arr.get(2)).toBe(3);
      expect(obj.arr.get(3)).toBe(4);
    });

    test("unshift on empty array", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([]) });
      obj.arr.unshift(1, 2, 3);
      expect(obj.arr.length).toBe(3);
      expect(obj.arr.get(0)).toBe(1);
    });
  });

  describe("array manipulation", () => {
    test("slice with no arguments", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const sliced = obj.arr.slice();
      expect(sliced).toEqual([1, 2, 3, 4]);
    });

    test("slice with start only", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const sliced = obj.arr.slice(1);
      expect(sliced).toEqual([2, 3, 4]);
    });

    test("slice with start and end", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const sliced = obj.arr.slice(1, 3);
      expect(sliced).toEqual([2, 3]);
    });

    test("slice with negative indices", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const sliced = obj.arr.slice(-3, -1);
      expect(sliced).toEqual([2, 3]);
    });

    test("splice delete only", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const deleted = obj.arr.splice(1, 2);
      expect(deleted).toEqual([2, 3]);
      expect(obj.arr.slice()).toEqual([1, 4]);
    });

    test("splice insert without delete", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 4]) });
      const deleted = obj.arr.splice(1, 0, 2, 3);
      expect(deleted).toEqual([]);
      expect(obj.arr.slice()).toEqual([1, 2, 3, 4]);
    });

    test("splice replace elements", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const deleted = obj.arr.splice(1, 2, 99, 88);
      expect(deleted).toEqual([2, 3]);
      expect(obj.arr.slice()).toEqual([1, 99, 88, 4]);
    });

    test("splice with negative start", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const deleted = obj.arr.splice(-2, 1);
      expect(deleted).toEqual([3]);
      expect(obj.arr.slice()).toEqual([1, 2, 4]);
    });

    test("reverse", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const result = obj.arr.reverse();
      expect(result).toBe(obj.arr);
      expect(obj.arr.slice()).toEqual([4, 3, 2, 1]);
    });

    test("reverse odd length array", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      obj.arr.reverse();
      expect(obj.arr.slice()).toEqual([3, 2, 1]);
    });

    test("fill entire array", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const result = obj.arr.fill(0);
      expect(result).toBe(obj.arr);
      expect(obj.arr.slice()).toEqual([0, 0, 0, 0]);
    });

    test("fill with start", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      obj.arr.fill(0, 2);
      expect(obj.arr.slice()).toEqual([1, 2, 0, 0]);
    });

    test("fill with start and end", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      obj.arr.fill(0, 1, 3);
      expect(obj.arr.slice()).toEqual([1, 0, 0, 4]);
    });

    test("fill with negative indices", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      obj.arr.fill(0, -3, -1);
      expect(obj.arr.slice()).toEqual([1, 0, 0, 4]);
    });
  });

  describe("search methods", () => {
    test("indexOf finds element", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30, 20]) });
      expect(obj.arr.indexOf(20)).toBe(1);
    });

    test("indexOf returns first occurrence", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30, 20]) });
      expect(obj.arr.indexOf(20)).toBe(1);
    });

    test("indexOf with fromIndex", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30, 20]) });
      expect(obj.arr.indexOf(20, 2)).toBe(3);
    });

    test("indexOf returns -1 when not found", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      expect(obj.arr.indexOf(99)).toBe(-1);
    });

    test("indexOf with negative fromIndex", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30, 20]) });
      expect(obj.arr.indexOf(20, -2)).toBe(3);
    });

    test("includes returns true when element exists", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      expect(obj.arr.includes(20)).toBe(true);
    });

    test("includes returns false when element doesn't exist", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      expect(obj.arr.includes(99)).toBe(false);
    });

    test("includes with fromIndex", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30, 20]) });
      expect(obj.arr.includes(20, 2)).toBe(true);
    });

    test("find returns first matching element", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const found = obj.arr.find((x: number) => x > 2);
      expect(found).toBe(3);
    });

    test("find returns undefined when no match", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const found = obj.arr.find((x: number) => x > 10);
      expect(found).toBeUndefined();
    });

    test("findIndex returns index of first match", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const index = obj.arr.findIndex((x: number) => x > 2);
      expect(index).toBe(2);
    });

    test("findIndex returns -1 when no match", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const index = obj.arr.findIndex((x: number) => x > 10);
      expect(index).toBe(-1);
    });
  });

  describe("iteration methods", () => {
    test("forEach iterates over all elements", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      const result: number[] = [];
      obj.arr.forEach((value: number) => result.push(value));
      expect(result).toEqual([1, 2, 3]);
    });

    test("forEach receives value and index", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      const indices: number[] = [];
      obj.arr.forEach((_value: number, index: number) => indices.push(index));
      expect(indices).toEqual([0, 1, 2]);
    });

    test("map transforms elements", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      const mapped = obj.arr.map((x: number) => x * 2);
      expect(mapped).toEqual([2, 4, 6]);
    });

    test("map with index", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      const mapped = obj.arr.map((x: number, i: number) => x + i);
      expect(mapped).toEqual([10, 21, 32]);
    });

    test("filter returns matching elements", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4, 5]) });
      const filtered = obj.arr.filter((x: number) => x > 2);
      expect(filtered).toEqual([3, 4, 5]);
    });

    test("filter returns empty array when no matches", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      const filtered = obj.arr.filter((x: number) => x > 10);
      expect(filtered).toEqual([]);
    });

    test("reduce with initial value", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const sum = obj.arr.reduce((acc: number, val: number) => acc + val, 0);
      expect(sum).toBe(10);
    });

    test("reduce without initial value", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3, 4]) });
      const sum = obj.arr.reduce((acc: number, val: number) => acc + val);
      expect(sum).toBe(10);
    });

    test("reduce throws on empty array without initial value", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([]) });
      expect(() => {
        obj.arr.reduce((acc: number, val: number) => acc + val);
      }).toThrow("Reduce of empty array with no initial value");
    });
  });

  describe("boolean check methods", () => {
    test("every returns true when all match", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([2, 4, 6]) });
      const result = obj.arr.every((x: number) => x % 2 === 0);
      expect(result).toBe(true);
    });

    test("every returns false when one doesn't match", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([2, 3, 6]) });
      const result = obj.arr.every((x: number) => x % 2 === 0);
      expect(result).toBe(false);
    });

    test("every returns true for empty array", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([]) });
      const result = obj.arr.every((x: number) => x > 10);
      expect(result).toBe(true);
    });

    test("some returns true when at least one matches", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      const result = obj.arr.some((x: number) => x === 2);
      expect(result).toBe(true);
    });

    test("some returns false when none match", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      const result = obj.arr.some((x: number) => x > 10);
      expect(result).toBe(false);
    });

    test("some returns false for empty array", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([]) });
      const result = obj.arr.some((x: number) => x > 0);
      expect(result).toBe(false);
    });
  });

  describe("string conversion", () => {
    test("join with default separator", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      expect(obj.arr.join()).toBe("1,2,3");
    });

    test("join with custom separator", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      expect(obj.arr.join("-")).toBe("1-2-3");
    });

    test("join with empty separator", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      expect(obj.arr.join("")).toBe("123");
    });

    test("join handles null and undefined", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({
        arr: SharedArray.from([1, null, undefined, 4]),
      });
      // Note: undefined gets converted to null when stored
      expect(obj.arr.join(",")).toBe("1,,4");
    });

    test("toString", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      expect(obj.arr.toString()).toBe("1,2,3");
    });
  });

  describe("iterators", () => {
    test("Symbol.iterator", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });
      const result: number[] = [];
      for (const value of obj.arr) {
        result.push(value);
      }
      expect(result).toEqual([1, 2, 3]);
    });

    test("entries iterator", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      const entries: Array<[number, number]> = [];
      for (const entry of obj.arr.entries()) {
        entries.push(entry);
      }
      expect(entries).toEqual([
        [0, 10],
        [1, 20],
        [2, 30],
      ]);
    });

    test("keys iterator", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      const keys: number[] = [];
      for (const key of obj.arr.keys()) {
        keys.push(key);
      }
      expect(keys).toEqual([0, 1, 2]);
    });

    test("values iterator", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([10, 20, 30]) });
      const values: number[] = [];
      for (const value of obj.arr.values()) {
        values.push(value);
      }
      expect(values).toEqual([10, 20, 30]);
    });
  });

  describe("complex types", () => {
    test("array of objects", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({
        arr: SharedArray.from([
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 },
        ]),
      });
      expect(obj.arr.get(0)?.name).toBe("Alice");
      expect(obj.arr.get(1)?.age).toBe(25);
    });

    test("array of strings", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({
        arr: SharedArray.from(["hello", "world"]),
      });
      expect(obj.arr.get(0)).toBe("hello");
      expect(obj.arr.get(1)).toBe("world");
    });

    test("array of mixed types", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({
        arr: SharedArray.from([1, "two", { three: 3 }, null]),
      });
      expect(obj.arr.get(0)).toBe(1);
      expect(obj.arr.get(1)).toBe("two");
      expect(obj.arr.get(2)?.three).toBe(3);
      expect(obj.arr.get(3)).toBeNull();
    });
  });

  describe("edge cases", () => {
    test("empty array operations", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([]) });
      expect(obj.arr.length).toBe(0);
      expect(obj.arr.slice()).toEqual([]);
      expect(obj.arr.join()).toBe("");
    });

    test("single element array", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([42]) });
      expect(obj.arr.length).toBe(1);
      expect(obj.arr.get(0)).toBe(42);
      expect(obj.arr.pop()).toBe(42);
      expect(obj.arr.length).toBe(0);
    });

    test("operations maintain array integrity", async () => {
      const db = await SharedHeap.create();
      const obj = db.createObject({ arr: SharedArray.from([1, 2, 3]) });

      obj.arr.push(4);
      obj.arr.unshift(0);
      expect(obj.arr.slice()).toEqual([0, 1, 2, 3, 4]);

      obj.arr.reverse();
      expect(obj.arr.slice()).toEqual([4, 3, 2, 1, 0]);

      obj.arr.splice(2, 1, 99);
      expect(obj.arr.slice()).toEqual([4, 3, 99, 1, 0]);
    });

    test("large array operations", async () => {
      const db = await SharedHeap.create();
      const largeArray = Array.from({ length: 1000 }, (_, i) => i);
      const obj = db.createObject({ arr: SharedArray.from(largeArray) });

      expect(obj.arr.length).toBe(1000);
      expect(obj.arr.get(500)).toBe(500);

      const filtered = obj.arr.filter((x: number) => x % 2 === 0);
      expect(filtered.length).toBe(500);
    });
  });
});
