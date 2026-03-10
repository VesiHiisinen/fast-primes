import { searchPrimesFast } from '../src/index.js';
import { writeFileSync } from 'fs';

/**
 * Cryptography example
 * Generate a list of potential prime candidates for cryptographic use
 */
async function cryptoExample() {
  console.log('Cryptographic Prime Generation\n');
  console.log('='.repeat(60));

  // Generate primes in a range suitable for cryptographic applications
  // (In real cryptography, use much larger ranges & specialized libraries)
  const result = await searchPrimesFast(
    { start: 1000000, end: 2000000 },
    { showProgress: true }
  );

  console.log(`\n✓ Generated ${result.count} prime candidates`);

  // Select random prime for demonstration
  const randomPrime = result.primes[Math.floor(Math.random() * result.count)];
  console.log(`✓ Random prime selected: ${randomPrime}`);

  // Save candidates to file
  const outputFile = 'crypto-primes.json';
  const cryptoData = {
    generatedAt: new Date().toISOString(),
    range: { start: 1000000, end: 2000000 },
    count: result.count,
    selectedPrime: randomPrime,
    candidates: result.primes.slice(0, 100), // First 100 for inspection
  };

  writeFileSync(outputFile, JSON.stringify(cryptoData, null, 2));
  console.log(`✓ Saved to ${outputFile}`);

  console.log('\nNote: For production cryptography, use:');
  console.log('  - Much larger prime numbers (2048+ bits)');
  console.log('  - Probabilistic primality tests (Miller-Rabin)');
  console.log('  - Specialized crypto libraries (e.g., node-forge)');
}

cryptoExample().catch(console.error);
