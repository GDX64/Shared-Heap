import type { SharedHeap } from "./AnyStore";

export class SharedArray {
  constructor(
    public readonly heapID: bigint,
    private __store: SharedHeap,
  ) {}

  static empty<T = any>(): SharedArray {
    // Return a marker instance with heapID 0n to indicate this should be an array
    return new SharedArray(0n, null as any);
  }

  get length(): number {
    return (this.__store as any)["arrayGetLength"](this.heapID);
  }

  set length(value: number) {
    (this.__store as any)["arraySetLength"](this.heapID, value);
  }

  get(index: number): any {
    return (this.__store as any)["arrayGet"](this.heapID, index);
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
    (this.__store as any)["setArrayElement"](this.heapID, index, value);
  }

  push(...items: any[]): number {
    return (this.__store as any)["arrayPush"](this.heapID, ...items);
  }

  pop(): any {
    return (this.__store as any)["arrayPop"](this.heapID);
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

    this.length = length - 1;
    return firstElement;
  }

  unshift(...items: any[]): number {
    const itemCount = items.length;
    if (itemCount === 0) {
      return this.length;
    }

    const oldLength = this.length;
    const newLength = oldLength + itemCount;

    // Shift existing elements up
    for (let i = oldLength - 1; i >= 0; i--) {
      this.set(i + itemCount, this.get(i));
    }

    // Insert new items at the beginning
    for (let i = 0; i < itemCount; i++) {
      this.set(i, items[i]);
    }

    this.length = newLength;
    return newLength;
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

    this.length = length + delta;
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

  forEach(
    callback: (value: any, index: number, array: SharedArray) => void,
    thisArg?: any,
  ): void {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      callback.call(thisArg, this.get(i), i, this);
    }
  }

  map<T>(
    callback: (value: any, index: number, array: SharedArray) => T,
    thisArg?: any,
  ): T[] {
    const length = this.length;
    const result: T[] = [];
    for (let i = 0; i < length; i++) {
      result.push(callback.call(thisArg, this.get(i), i, this));
    }
    return result;
  }

  filter(
    callback: (value: any, index: number, array: SharedArray) => boolean,
    thisArg?: any,
  ): any[] {
    const length = this.length;
    const result: any[] = [];
    for (let i = 0; i < length; i++) {
      const value = this.get(i);
      if (callback.call(thisArg, value, i, this)) {
        result.push(value);
      }
    }
    return result;
  }

  find(
    callback: (value: any, index: number, array: SharedArray) => boolean,
    thisArg?: any,
  ): any {
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
    callback: (value: any, index: number, array: SharedArray) => boolean,
    thisArg?: any,
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
    callback: (value: any, index: number, array: SharedArray) => boolean,
    thisArg?: any,
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
    callback: (value: any, index: number, array: SharedArray) => boolean,
    thisArg?: any,
  ): boolean {
    const length = this.length;
    for (let i = 0; i < length; i++) {
      if (callback.call(thisArg, this.get(i), i, this)) {
        return true;
      }
    }
    return false;
  }

  reduce<T>(
    callback: (
      previousValue: T,
      currentValue: any,
      currentIndex: number,
      array: SharedArray,
    ) => T,
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
    return this[Symbol.iterator]();
  }
}
