import type { SharedHeap } from "./AnyStore";

export class SharedArray<T = any> {
  private initialItems: T[] | null = null;
  constructor(
    public readonly heapID: bigint,
    private store: SharedHeap,
  ) {}

  static from<T>(arr: T[]): SharedArray<T> {
    const sharedArray = new SharedArray(0n, null as any);
    sharedArray.initialItems = arr;
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

  get(index: number): any {
    return this.store["arrayGet"](this.heapID, index);
  }

  at(index: number): any {
    const length = this.length;
    const actualIndex = index < 0 ? length + index : index;
    if (actualIndex < 0 || actualIndex >= length) {
      return undefined;
    }
    return this.get(actualIndex);
  }

  set(index: number, value: any): void {
    this.store["setArrayElement"](this.heapID, index, value);
  }

  push(item: T) {
    this.store["arrayPush"](this.heapID, item);
  }

  pop(): T {
    return this.store["arrayPop"](this.heapID) as T;
  }

  shift(): any {
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

  unshift(...items: any[]): number {
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

  slice(start?: number, end?: number): any[] {
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

    const result: any[] = [];
    for (let i = actualStart; i < actualEnd; i++) {
      result.push(this.get(i));
    }
    return result;
  }

  splice(start: number, deleteCount?: number, ...items: any[]): any[] {
    const length = this.length;
    const actualStart =
      start < 0 ? Math.max(0, length + start) : Math.min(start, length);
    const actualDeleteCount =
      deleteCount === undefined
        ? length - actualStart
        : Math.max(0, Math.min(deleteCount, length - actualStart));

    // Store deleted elements
    const deleted: any[] = [];
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

  indexOf(searchElement: any, fromIndex?: number): number {
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

  includes(searchElement: any, fromIndex?: number): boolean {
    return this.indexOf(searchElement, fromIndex) !== -1;
  }

  forEach(callback: (value: T, index: number) => void, thisArg?: any): void {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      callback.call(thisArg, this.get(i), i);
    }
  }

  map<T>(callback: (value: any, index: number) => T, thisArg?: any): T[] {
    const length = this.length;
    const result: T[] = [];
    for (let i = 0; i < length; i++) {
      result.push(callback.call(thisArg, this.get(i), i));
    }
    return result;
  }

  filter(
    callback: (value: any, index: number) => boolean,
    thisArg?: any,
  ): any[] {
    const length = this.length;
    const result: any[] = [];
    for (let i = 0; i < length; i++) {
      const value = this.get(i);
      if (callback.call(thisArg, value, i)) {
        result.push(value);
      }
    }
    return result;
  }

  find(callback: (value: any, index: number) => boolean, thisArg?: any): any {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      const value = this.get(i);
      if (callback.call(thisArg, value, i)) {
        return value;
      }
    }
    return undefined;
  }

  findIndex(
    callback: (value: any, index: number) => boolean,
    thisArg?: any,
  ): number {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      if (callback.call(thisArg, this.get(i), i)) {
        return i;
      }
    }
    return -1;
  }

  every(
    callback: (value: any, index: number) => boolean,
    thisArg?: any,
  ): boolean {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      if (!callback.call(thisArg, this.get(i), i)) {
        return false;
      }
    }
    return true;
  }

  some(
    callback: (value: any, index: number) => boolean,
    thisArg?: any,
  ): boolean {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      if (callback.call(thisArg, this.get(i), i)) {
        return true;
      }
    }
    return false;
  }

  reduce<T>(
    callback: (previousValue: T, currentValue: any, currentIndex: number) => T,
    initialValue?: T,
  ): T {
    const length = this.length;
    let accumulator: T;
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
      accumulator = callback(accumulator, this.get(i), i);
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

  fill(value: any, start?: number, end?: number): this {
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

  [Symbol.iterator]() {
    let index = 0;
    const length = this.length;
    const self = this;

    return {
      next(): IteratorResult<any> {
        if (index < length) {
          return { value: self.get(index++), done: false };
        } else {
          return { value: undefined, done: true };
        }
      },
    };
  }

  entries() {
    let index = 0;
    const length = this.length;
    const self = this;

    return {
      [Symbol.iterator]() {
        return this;
      },
      next(): IteratorResult<[number, any]> {
        if (index < length) {
          return {
            value: [index, self.get(index++)] as [number, any],
            done: false,
          };
        } else {
          return { value: undefined as any, done: true };
        }
      },
    };
  }

  keys() {
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

  values() {
    let index = 0;
    const length = this.length;
    const self = this;

    return {
      [Symbol.iterator]() {
        return this;
      },
      next(): IteratorResult<any> {
        if (index < length) {
          return { value: self.get(index++), done: false };
        } else {
          return { value: undefined as any, done: true };
        }
      },
    };
  }
}
