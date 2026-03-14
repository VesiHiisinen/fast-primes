import { parentPort, workerData } from 'worker_threads';
import type { WorkerData } from './types.js';

export const isPrime = (n: number): boolean => {
  if (n < 2) return false;
  if (n === 2 || n === 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;

  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
};

export const searchPrimesInRange = (range: { start: number; end: number }): number[] => {
  const primes: number[] = [];
  let start = range.start;

  if (start <= 2) {
    if (start <= 2 && range.end >= 2) primes.push(2);
    start = 3;
  } else if (start % 2 === 0) {
    start++;
  }

  for (let i = start; i <= range.end; i += 2) {
    if (isPrime(i)) primes.push(i);
  }

  return primes;
};

// Only run worker logic if this is actually a prime search worker thread
if (parentPort && workerData && (workerData as WorkerData).range) {
  const data = workerData as WorkerData;
  const primes = searchPrimesInRange(data.range);
  parentPort.postMessage(primes);
}
