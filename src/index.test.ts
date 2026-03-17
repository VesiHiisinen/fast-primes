import { describe, it, expect } from 'vitest';
import {
  isPrimeNumber,
  searchPrimes,
  searchPrimesFast,
  getPhysicalCores,
  calculateThreadRanges,
} from './index.js';
import { isPrime, searchPrimesInRange } from './worker.js';

describe('isPrimeNumber', () => {
  it('should return false for numbers less than 2', () => {
    expect(isPrimeNumber(0)).toBe(false);
    expect(isPrimeNumber(1)).toBe(false);
    expect(isPrimeNumber(-1)).toBe(false);
  });

  it('should return true for 2 and 3', () => {
    expect(isPrimeNumber(2)).toBe(true);
    expect(isPrimeNumber(3)).toBe(true);
  });

  it('should return false for even numbers greater than 2', () => {
    expect(isPrimeNumber(4)).toBe(false);
    expect(isPrimeNumber(10)).toBe(false);
    expect(isPrimeNumber(100)).toBe(false);
  });

  it('should correctly identify prime numbers', () => {
    expect(isPrimeNumber(5)).toBe(true);
    expect(isPrimeNumber(7)).toBe(true);
    expect(isPrimeNumber(11)).toBe(true);
    expect(isPrimeNumber(13)).toBe(true);
    expect(isPrimeNumber(17)).toBe(true);
    expect(isPrimeNumber(19)).toBe(true);
    expect(isPrimeNumber(97)).toBe(true);
  });

  it('should correctly identify composite numbers', () => {
    expect(isPrimeNumber(9)).toBe(false);
    expect(isPrimeNumber(15)).toBe(false);
    expect(isPrimeNumber(21)).toBe(false);
    expect(isPrimeNumber(25)).toBe(false);
    expect(isPrimeNumber(27)).toBe(false);
    expect(isPrimeNumber(100)).toBe(false);
  });

  it('should handle larger primes', () => {
    expect(isPrimeNumber(997)).toBe(true);
    expect(isPrimeNumber(1009)).toBe(true);
    expect(isPrimeNumber(7919)).toBe(true);
  });
});

describe('getPhysicalCores', () => {
  it('should return a positive number', () => {
    const cores = getPhysicalCores();
    expect(cores).toBeGreaterThan(0);
    expect(Number.isInteger(cores)).toBe(true);
  });
});

describe('calculateThreadRanges', () => {
  it('should divide range equally for single thread', () => {
    const ranges = calculateThreadRanges({ start: 0, end: 100 }, 1);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: 0, end: 100 });
  });

  it('should divide range for multiple threads', () => {
    const ranges = calculateThreadRanges({ start: 0, end: 100 }, 4);
    expect(ranges).toHaveLength(4);
    expect(ranges[0]).toEqual({ start: 0, end: 24 });
    expect(ranges[3]).toEqual({ start: 75, end: 100 });
  });

  it('should handle ranges that do not divide evenly', () => {
    const ranges = calculateThreadRanges({ start: 0, end: 10 }, 3);
    expect(ranges).toHaveLength(3);
    expect(ranges[2].end).toBe(10); // Last range should include remainder
  });
});

describe('searchPrimes', () => {
  it('should find primes in small range with single thread', async () => {
    const result = await searchPrimes({ start: 1, end: 10 }, { threads: 1, backend: 'cpu' });
    expect(result.primes).toEqual([2, 3, 5, 7]);
    expect(result.count).toBe(4);
    expect(result.threads).toBe(1);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.primesPerMinute).toBeGreaterThan(0);
  });

  it('should find primes in larger range', async () => {
    const result = await searchPrimes({ start: 1, end: 100 }, { threads: 1, backend: 'cpu' });
    expect(result.count).toBe(25); // 25 primes between 1 and 100
  });

  it('should work with multiple threads', async () => {
    const result = await searchPrimes({ start: 1, end: 1000 }, { threads: 2, backend: 'cpu' });
    expect(result.count).toBe(168); // 168 primes between 1 and 1000
    expect(result.threads).toBe(2);
  });

  it('should respect max threads limit', async () => {
    const cores = getPhysicalCores();
    const result = await searchPrimes({ start: 1, end: 100 }, { threads: 100, backend: 'cpu' });
    expect(result.threads).toBeLessThanOrEqual(cores);
  });

  it('should handle progress callback', async () => {
    const progressCalls: {
      memoryUsage: number;
      threads: number;
      range: { start: number; end: number };
      indicator: string;
    }[] = [];

    await searchPrimes(
      { start: 1, end: 100 },
      {
        threads: 1,
        backend: 'cpu',
        onProgress: progress => {
          progressCalls.push(progress);
        },
      }
    );

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[0]).toHaveProperty('memoryUsage');
    expect(progressCalls[0]).toHaveProperty('threads');
    expect(progressCalls[0]).toHaveProperty('range');
    expect(progressCalls[0]).toHaveProperty('indicator');
  });

  it('should sort results in ascending order', async () => {
    const result = await searchPrimes({ start: 1, end: 100 }, { threads: 2, backend: 'cpu' });

    for (let i = 1; i < result.primes.length; i++) {
      expect(result.primes[i]).toBeGreaterThan(result.primes[i - 1]);
    }
  });
});

describe('searchPrimesFast', () => {
  it('should use max threads by default', async () => {
    const cores = getPhysicalCores();
    const result = await searchPrimesFast({ start: 1, end: 1000 }, { backend: 'cpu' });
    expect(result.threads).toBe(cores);
  });
});

describe('Worker functions', () => {
  it('isPrime should match isPrimeNumber', () => {
    const testNumbers = [2, 3, 4, 5, 9, 17, 25, 100, 997];

    for (const n of testNumbers) {
      expect(isPrime(n)).toBe(isPrimeNumber(n));
    }
  });

  it('searchPrimesInRange should find primes correctly', () => {
    const primes = searchPrimesInRange({ start: 1, end: 10 });
    expect(primes).toEqual([2, 3, 5, 7]);
  });

  it('searchPrimesInRange should handle edge cases', () => {
    expect(searchPrimesInRange({ start: 2, end: 2 })).toEqual([2]);
    expect(searchPrimesInRange({ start: 1, end: 1 })).toEqual([]);
    expect(searchPrimesInRange({ start: 8, end: 10 })).toEqual([]);
  });
});
