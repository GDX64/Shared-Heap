const cache = new Map<string, bigint>();
const MAX_CACHE_SIZE = 1000;

export function fastHash(str: string): bigint {
  if (cache.has(str)) {
    return cache.get(str)!;
  }
  const hashValue = fnv(str);
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldValues = Array.from(cache.entries());
    cache.clear();
    for (const [key, value] of oldValues.slice(0, MAX_CACHE_SIZE / 2)) {
      cache.set(key, value);
    }
  }
  cache.set(str, hashValue);
  return hashValue;
}

export function fnv(str: string): bigint {
  // FNV-1a parameters for 64-bit
  const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK_64 = 0xffffffffffffffffn;

  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }

  return hash;
}
