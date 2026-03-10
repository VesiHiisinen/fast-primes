/**
 * Basic usage example
 * Search for primes in a range using multiple threads
 */
import { searchPrimes } from '../src/index.js';

async function basicExample() {
  console.log('Basic Prime Search Example\n');

  // Search for primes from 1 to 1 million using 4 threads
  const result = await searchPrimes(
    { start: 1, end: 1000000 },
    { threads: 4, showProgress: true }
  );

  console.log('\nResults:');
  console.log(`Total primes found: ${result.count}`);
  console.log(`Time taken: ${(result.duration / 1000).toFixed(2)} seconds`);
  console.log(`Threads used: ${result.threads}`);
  console.log(`Primes per minute: ${(result.primesPerMinute / 1000000).toFixed(2)}M`);
  console.log(`\nFirst 10 primes: ${result.primes.slice(0, 10).join(', ')}`);
  console.log(`Last 10 primes: ${result.primes.slice(-10).join(', ')}`);
}

basicExample().catch(console.error);
