import { parentPort, workerData } from 'worker_threads';

const isPrime = (n: number): boolean => {
    if (n < 2) return false;
    if (n === 2 || n === 3) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;

    // Skip multiples of 2 and 3, start from 5, check every (6k ± 1)
    for (let i = 5; i * i <= n; i += 6) {
        if (n % i === 0 || n % (i + 2) === 0) return false;
    }
    return true;
};

const workerFunction = (range: { start: number; end: number }): number[] => {
    const primes = [];
    let start = range.start;
    if (start <= 2) {
        if (start === 2) primes.push(2);
        start = 3;
    } else if (start % 2 === 0) {
        start++; // skip even numbers
    }
    for (let i = start; i <= range.end; i+=2) { // Increment by 2 (skip evens)
        if (isPrime(i)) primes.push(i);
    }
    return primes;
};

parentPort?.postMessage(workerFunction(workerData));