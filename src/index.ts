import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import type { Range, PrimeSearchOptions, SearchResult, SearchProgress } from './types.js';

export const getPhysicalCores = (): number => {
  // Return total logical CPUs (including hyperthreading) for maximum performance
  // On Intel i7-11800H: 16 threads (8 physical cores × 2 hyperthreads)
  return os.cpus().length;
};

export const calculateThreadRanges = (range: Range, threads: number): Range[] => {
  const threadRange = Math.floor((range.end - range.start) / threads);
  const ranges: Range[] = [];

  for (let i = 0; i < threads; i++) {
    ranges.push({
      start: range.start + i * threadRange,
      end: i === threads - 1 ? range.end : range.start + (i + 1) * threadRange - 1,
    });
  }

  return ranges;
};

const progressChars = ['|', '/', '-', '\\'];

export const searchPrimes = async (
  range: Range,
  options: PrimeSearchOptions = {}
): Promise<SearchResult> => {
  const { threads: threadOption = 1, showProgress = false, onProgress } = options;

  const numPhysicalCores = getPhysicalCores();
  let threads = threadOption === 'max' ? numPhysicalCores : threadOption || 1;
  threads = Math.min(threads, numPhysicalCores);

  // Worker path - assume we're in dist/ directory
  const workerPath = path.join(process.cwd(), 'dist', 'worker.js');
  const threadRanges = calculateThreadRanges(range, threads);

  let loops = 0;
  let intervalId: NodeJS.Timeout | undefined;

  if (showProgress || onProgress) {
    intervalId = setInterval(() => {
      loops++;
      const memoryUsage = parseFloat((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2));
      const progress: SearchProgress = {
        memoryUsage,
        threads,
        range,
        indicator: progressChars[loops % 4],
      };

      if (onProgress) {
        onProgress(progress);
      }

      if (showProgress) {
        process.stdout.write(
          `\rMem usage: ${memoryUsage} MB | Threads: ${threads} | Range: ${range.start} - ${range.end} | Searching primes: ${progress.indicator}`
        );
      }
    }, 1000);
  }

  const startTime = Date.now();

  const workerPromises = threadRanges.map(
    threadRange =>
      new Promise<number[]>((resolve, reject) => {
        const worker = new Worker(workerPath, { workerData: { range: threadRange } });

        worker.on('message', (primes: number[]) => {
          resolve(primes);
        });

        worker.on('error', reject);

        worker.on('exit', (code: number) => {
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });
      })
  );

  try {
    const results = await Promise.all(workerPromises);
    const primes = results.flat().sort((a, b) => a - b);
    const duration = Date.now() - startTime;

    if (intervalId) {
      clearInterval(intervalId);
      if (showProgress) {
        process.stdout.write('\n');
      }
    }

    const primesPerMinute = (primes.length / (duration / 1000)) * 60;

    return {
      primes,
      count: primes.length,
      duration,
      primesPerMinute,
      threads,
    };
  } catch (error) {
    if (intervalId) clearInterval(intervalId);
    throw error;
  }
};

export const searchPrimesFast = (
  range: Range,
  options: Omit<PrimeSearchOptions, 'threads'> = {}
): Promise<SearchResult> => {
  return searchPrimes(range, { ...options, threads: 'max' });
};

export const isPrimeNumber = (n: number): boolean => {
  if (n < 2) return false;
  if (n === 2 || n === 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;

  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
};
