/**
 * API usage example
 * Demonstrates all available functions
 */
import { 
  searchPrimes, 
  searchPrimesFast, 
  isPrimeNumber, 
  getPhysicalCores 
} from '../src/index.js';

async function apiExample() {
  console.log('API Usage Examples\n');
  console.log('='.repeat(50));

  // Example 1: Check if a number is prime
  console.log('\n1. Check if a number is prime:');
  const number = 7919;
  const isPrime = isPrimeNumber(number);
  console.log(`Is ${number} prime? ${isPrime ? 'Yes' : 'No'}`);

  // Example 2: Get CPU core count
  console.log('\n2. System information:');
  const cores = getPhysicalCores();
  console.log(`Physical CPU cores: ${cores}`);

  // Example 3: Search with custom thread count
  console.log('\n3. Custom thread count (2 threads):');
  const customResult = await searchPrimes(
    { start: 1, end: 100000 },
    { threads: 2 }
  );
  console.log(`Found ${customResult.count} primes in ${customResult.duration}ms`);

  // Example 4: Use all CPU cores automatically
  console.log('\n4. Using all CPU cores:');
  const fastResult = await searchPrimesFast(
    { start: 1, end: 500000 },
    { showProgress: true }
  );
  console.log(`\nFound ${fastResult.count} primes`);
  console.log(`Speed: ${(fastResult.primesPerMinute / 1000000).toFixed(2)}M primes/min`);

  // Example 5: Progress callback
  console.log('\n5. Progress callback:');
  let lastProgress = 0;
  await searchPrimes(
    { start: 1, end: 100000 },
    {
      threads: 4,
      onProgress: (progress) => {
        const current = Math.floor(progress.memoryUsage);
        if (current !== lastProgress) {
          lastProgress = current;
          process.stdout.write(`Memory: ${current}MB\r`);
        }
      },
    }
  );
  console.log('\nDone!');
}

apiExample().catch(console.error);
