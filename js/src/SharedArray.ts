import type { SharedHeap } from "./AnyStore";

export class SharedArray<T = any> {
  private initialItems: T[] | null = null;
  constructor(
    public readonly heapID: bigint,
    private store: SharedHeap,
  ) {}

  static from<T>(arr: readonly T[]): SharedArray<T> {
    const sharedArray = new SharedArray(0n, null as any);
    sharedArray.initialItems = [...arr];
    return sharedArray;
  }

  get length(): number {
    return this.store["arrayGetLength"](this.heapID);
  }

  set length(_value: number) {
    throw new Error(
      "Length property is read-only. Use push/pop/shift/unshift/splice to modify the array.",
    );
  }

  takeInitialItems(): T[] {
    const result = this.initialItems;
    this.initialItems = null;
    return result ?? [];
  }

  get(index: number): T {
    return this.store["arrayGet"](this.heapID, index) as T;
  }

  at(index: number): T | undefined {
    const length = this.length;
    const actualIndex = index < 0 ? length + index : index;
    if (actualIndex < 0 || actualIndex >= length) {
      return undefined;
    }
    return this.get(actualIndex);
  }

  set(index: number, value: T): void {
    this.store["setArrayElement"](this.heapID, index, value);
  }

  push(item: T) {
    this.store["arrayPush"](this.heapID, item);
  }

  pop(): T {
    return this.store["arrayPop"](this.heapID) as T;
  }

  shift(): T | undefined {
    const length = this.length;
    if (length === 0) {
      return undefined;
    }

    const firstElement = this.get(0);

    // Shift all elements down by one
    for (let i = 1; i < length; i++) {
      this.set(i - 1, this.get(i));
    }

    // Remove the last element (which is now a duplicate)
    this.pop();
    return firstElement;
  }

  unshift(...items: T[]): number {
    const itemCount = items.length;
    if (itemCount === 0) {
      return this.length;
    }

    const oldLength = this.length;

    // Expand the array by pushing placeholders
    for (let i = 0; i < itemCount; i++) {
      this.push(null as T);
    }

    // Shift existing elements up
    for (let i = oldLength - 1; i >= 0; i--) {
      this.set(i + itemCount, this.get(i));
    }

    // Insert new items at the beginning
    for (let i = 0; i < itemCount; i++) {
      this.set(i, items[i]);
    }

    return this.length;
  }

  slice(start?: number, end?: number): T[] {
    const length = this.length;
    const actualStart =
      start === undefined
        ? 0
        : start < 0
          ? Math.max(0, length + start)
          : Math.min(start, length);
    const actualEnd =
      end === undefined
        ? length
        : end < 0
          ? Math.max(0, length + end)
          : Math.min(end, length);

    const result: T[] = [];
    for (let i = actualStart; i < actualEnd; i++) {
      result.push(this.get(i));
    }
    return result;
  }

  splice(start: number, deleteCount?: number, ...items: T[]): T[] {
    const length = this.length;
    const actualStart =
      start < 0 ? Math.max(0, length + start) : Math.min(start, length);
    const actualDeleteCount =
      deleteCount === undefined
        ? length - actualStart
        : Math.max(0, Math.min(deleteCount, length - actualStart));

    // Store deleted elements
    const deleted: T[] = [];
    for (let i = 0; i < actualDeleteCount; i++) {
      deleted.push(this.get(actualStart + i));
    }

    const itemCount = items.length;
    const delta = itemCount - actualDeleteCount;

    // Adjust the array length first if growing
    if (delta > 0) {
      // Growing: push placeholders
      for (let i = 0; i < delta; i++) {
        this.push(null as T);
      }
    }

    if (delta < 0) {
      // Shift elements down
      for (let i = actualStart + actualDeleteCount; i < length; i++) {
        this.set(i + delta, this.get(i));
      }
    } else if (delta > 0) {
      // Shift elements up
      for (let i = length - 1; i >= actualStart + actualDeleteCount; i--) {
        this.set(i + delta, this.get(i));
      }
    }

    // Insert new items
    for (let i = 0; i < itemCount; i++) {
      this.set(actualStart + i, items[i]);
    }

    // Shrink if needed
    if (delta < 0) {
      // Shrinking: pop excess elements
      for (let i = 0; i < -delta; i++) {
        this.pop();
      }
    }

    return deleted;
  }

  indexOf(searchElement: T, fromIndex?: number): number {
    const length = this.length;
    const start =
      fromIndex === undefined
        ? 0
        : fromIndex < 0
          ? Math.max(0, length + fromIndex)
          : fromIndex;

    for (let i = start; i < length; i++) {
      if (this.get(i) === searchElement) {
        return i;
      }
    }
    return -1;
  }

  includes(searchElement: T, fromIndex?: number): boolean {
    return this.indexOf(searchElement, fromIndex) !== -1;
  }

  forEach(
    callback: (value: T, index: number, array: SharedArray<T>) => void,
    thisArg?: unknown,
  ): void {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      callback.call(thisArg, this.get(i), i, this);
    }
  }

  map<U>(
    callback: (value: T, index: number, array: SharedArray<T>) => U,
    thisArg?: unknown,
  ): U[] {
    const length = this.length;
    const result: U[] = [];
    for (let i = 0; i < length; i++) {
      result.push(callback.call(thisArg, this.get(i), i, this));
    }
    return result;
  }

  filter<S extends T>(
    callback: (value: T, index: number, array: SharedArray<T>) => value is S,
    thisArg?: unknown,
  ): S[];
  filter(
    callback: (value: T, index: number, array: SharedArray<T>) => unknown,
    thisArg?: unknown,
  ): T[];
  filter(
    callback: (value: T, index: number, array: SharedArray<T>) => unknown,
    thisArg?: unknown,
  ): T[] {
    const length = this.length;
    const result: T[] = [];
    for (let i = 0; i < length; i++) {
      const value = this.get(i);
      if (callback.call(thisArg, value, i, this)) {
        result.push(value);
      }
    }
    return result;
  }

  find<S extends T>(
    callback: (value: T, index: number, array: SharedArray<T>) => value is S,
    thisArg?: unknown,
  ): S | undefined;
  find(
    callback: (value: T, index: number, array: SharedArray<T>) => unknown,
    thisArg?: unknown,
  ): T | undefined;
  find(
    callback: (value: T, index: number, array: SharedArray<T>) => unknown,
    thisArg?: unknown,
  ): T | undefined {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      const value = this.get(i);
      if (callback.call(thisArg, value, i, this)) {
        return value;
      }
    }
    return undefined;
  }

  findIndex(
    callback: (value: T, index: number, array: SharedArray<T>) => unknown,
    thisArg?: unknown,
  ): number {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      if (callback.call(thisArg, this.get(i), i, this)) {
        return i;
      }
    }
    return -1;
  }

  every(
    callback: (value: T, index: number, array: SharedArray<T>) => boolean,
    thisArg?: unknown,
  ): boolean {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      if (!callback.call(thisArg, this.get(i), i, this)) {
        return false;
      }
    }
    return true;
  }

  some(
    callback: (value: T, index: number, array: SharedArray<T>) => boolean,
    thisArg?: unknown,
  ): boolean {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      if (callback.call(thisArg, this.get(i), i, this)) {
        return true;
      }
    }
    return false;
  }

  reduce(
    callback: (
      previousValue: T,
      currentValue: T,
      currentIndex: number,
      array: SharedArray<T>,
    ) => T,
  ): T;
  reduce(
    callback: (
      previousValue: T,
      currentValue: T,
      currentIndex: number,
      array: SharedArray<T>,
    ) => T,
    initialValue: T,
  ): T;
  reduce<U>(
    callback: (
      previousValue: U,
      currentValue: T,
      currentIndex: number,
      array: SharedArray<T>,
    ) => U,
    initialValue: U,
  ): U;
  reduce<U>(
    callback: (
      previousValue: T | U,
      currentValue: T,
      currentIndex: number,
      array: SharedArray<T>,
    ) => T | U,
    initialValue?: U,
  ): T | U {
    const length = this.length;
    let accumulator: T | U;
    let startIndex = 0;

    if (initialValue === undefined) {
      if (length === 0) {
        throw new TypeError("Reduce of empty array with no initial value");
      }
      accumulator = this.get(0);
      startIndex = 1;
    } else {
      accumulator = initialValue;
    }

    for (let i = startIndex; i < length; i++) {
      accumulator = callback(accumulator, this.get(i), i, this);
    }

    return accumulator;
  }

  join(separator?: string): string {
    const length = this.length;
    const sep = separator === undefined ? "," : separator;
    let result = "";

    for (let i = 0; i < length; i++) {
      if (i > 0) {
        result += sep;
      }
      const value = this.get(i);
      result += value === null || value === undefined ? "" : String(value);
    }

    return result;
  }

  toString(): string {
    return this.join(",");
  }

  reverse(): this {
    const length = this.length;
    const mid = Math.floor(length / 2);

    for (let i = 0; i < mid; i++) {
      const temp = this.get(i);
      this.set(i, this.get(length - 1 - i));
      this.set(length - 1 - i, temp);
    }

    return this;
  }

  fill(value: T, start?: number, end?: number): this {
    const length = this.length;
    const actualStart =
      start === undefined
        ? 0
        : start < 0
          ? Math.max(0, length + start)
          : Math.min(start, length);
    const actualEnd =
      end === undefined
        ? length
        : end < 0
          ? Math.max(0, length + end)
          : Math.min(end, length);

    for (let i = actualStart; i < actualEnd; i++) {
      this.set(i, value);
    }

    return this;
  }

  [Symbol.iterator](): IterableIterator<T> {
    let index = 0;
    const length = this.length;
    const self = this;

    return {
      next(): IteratorResult<T> {
        if (index < length) {
          return { value: self.get(index++), done: false };
        } else {
          return { value: undefined as any, done: true };
        }
      },
      [Symbol.iterator]() {
        return this;
      },
    };
  }

  entries(): IterableIterator<[number, T]> {
    let index = 0;
    const length = this.length;
    const self = this;

    return {
      [Symbol.iterator]() {
        return this;
      },
      next(): IteratorResult<[number, T]> {
        if (index < length) {
          return {
            value: [index, self.get(index++)] as [number, T],
            done: false,
          };
        } else {
          return { value: undefined as any, done: true };
        }
      },
    };
  }

  keys(): IterableIterator<number> {
    let index = 0;
    const length = this.length;

    return {
      [Symbol.iterator]() {
        return this;
      },
      next(): IteratorResult<number> {
        if (index < length) {
          return { value: index++, done: false };
        } else {
          return { value: undefined as any, done: true };
        }
      },
    };
  }

  values(): IterableIterator<T> {
    let index = 0;
    const length = this.length;
    const self = this;

    return {
      [Symbol.iterator]() {
        return this;
      },
      next(): IteratorResult<T> {
        if (index < length) {
          return { value: self.get(index++), done: false };
        } else {
          return { value: undefined as any, done: true };
        }
      },
    };
  }
}
