# Examples

This directory contains usage examples for the `fast-prime-search` package.

## Running Examples

First, build the project:

```bash
npm run build
```

Then run any example:

```bash
# Basic usage
node dist/examples/basic.js

# API demonstration
node dist/examples/api.js

# Cryptographic applications
node dist/examples/cryptography.js
```

## Example Descriptions

### basic.ts
Demonstrates the most common use case - searching for primes in a range with progress display.

### api.ts
Shows all available API methods and their usage patterns.

### cryptography.ts  
Example of generating prime candidates for cryptographic applications.

## Creating Your Own

Copy any example and modify it for your needs:

```typescript
import { searchPrimes, isPrimeNumber } from 'fast-prime-search';

const result = await searchPrimes(
  { start: 1, end: 1000000 },
  { threads: 'max', showProgress: true }
);

console.log(`Found ${result.count} primes!`);
```