import { Worker, isMainThread } from 'worker_threads';
import path from 'path';
import { Queue } from 'queue-typescript';

// NodeJS multithread test project
// Search prime numbers in a range using multiple threads
// Let's make a function that takes a range object {start: number, end: number} and a number of threads to use in a search
// Then we will split the range into equal parts and run a search in each part in a separate thread
// We test the speed with one thread vs. 5 threads
// The main function will track
// - start time
// - end time
// - memory usage
// - number of primes found per 60 seconds

const paramStart = +process.argv[2] || 0;
const paramEnd = +process.argv[3] || 1000000000000;

const range = {
    start: paramStart,
    end: paramEnd
}

const threads = +process.argv[4] || 1
const writeToFile = process.argv[5] === '-f' ? true : false;

// Main function will divide the range into equal parts and run a search in each part in a separate thread
// Then it will merge the results and return the array of prime numbers

if (!isMainThread) {
    // This block will not be executed in the main thread
} else {
    // Main function will divide the range into equal parts and run a search in each part in a separate thread
    // Then it will merge the results and return the array of prime numbers

    const multiThreadPrimeSearch = async (range: {start: number, end: number}, threads: number): Promise<number[]> => {
        // Always show the memory usage, not with console.log, but with stdout.write
        let loops = 0;
        const writeProgress = (loops: number) => {
            const proggress = ['|', '/', '-', '\\'];
            return proggress[loops % 4];
        };
        let intervalId = setInterval(() => {
            loops++;
            const memoryUsage = ((process.memoryUsage()).heapUsed/1024/1024).toFixed(2);
            const rangeString = `${range.start} - ${range.end}`;
            process.stdout.write(`\rMem usage: ${memoryUsage} MB | Threads: ${threads} | Range: ${rangeString} | Searching primes: ${writeProgress(loops)}`);
        }, 1000);

        // Dynamic load balancing
        const chunkSize = Math.floor((range.end - range.start) / 10);
        const chunks = new Queue<{start: number, end: number}>();
        for (let i = range.start; i < range.end; i += chunkSize) {
            chunks.enqueue({ start: i, end: Math.min(i + chunkSize - 1, range.end) });
        }

        const threadRange = Math.floor((range.end - range.start) / threads);
        const threadRanges = [];
        for (let i = 0; i < threads; i++) {
            threadRanges.push({
                start: range.start + i * threadRange,
                end: i === threads - 1 ? range.end : range.start + (i + 1) * threadRange - 1
            });
        }

        const workerPath = path.resolve(__dirname, 'worker.js');
        const workerPromises = threadRanges.map(threadRange => new Promise<number[]>((resolve, reject) => {
            const worker = new Worker(workerPath, { workerData: threadRange });
            worker.on('message', resolve);
            worker.on('error', reject);
            worker.on('exit', (code:number) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        }));

        const results = await Promise.all(workerPromises);
        clearInterval(intervalId);
        console.log('\n');
        return results.flat();
    }

    // Example usage
    (async () => {
        const startTime = Date.now();
        const primes = await multiThreadPrimeSearch(range, threads);
        const endTime = Date.now();
        console.log(`Found ${primes.length} primes in ${Math.round((endTime - startTime) / 1000)} seconds using ${threads} threads.`);
        // Calculate the number of primes found per/minute
        const primesPerMinute = primes.length / ((endTime - startTime) / 1000) * 60;
        console.log(`Speed: ${(primesPerMinute/1000000).toFixed(2)}M primes per minute.`);
        // write the primes to a file
        if (writeToFile) {
            const fs = require('fs');
            fs.writeFileSync('primes.txt', primes.join('\n'));
        }
    })();
}