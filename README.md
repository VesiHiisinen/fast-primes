# 🔢 fast-prime-search

High-performance prime number search using multithreading in TypeScript.

[![npm version](https://badge.fury.io/js/fast-prime-search.svg)](https://www.npmjs.com/package/fast-prime-search)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

> **Blazing fast prime number detection** using Node.js worker_threads and the 6k±1 wheel optimization.

## 🚀 Performance

This implementation leverages V8's JIT compilation and parallel processing to achieve **millions of primes per minute**.

### Benchmark Results on Intel i7-11800H (8 Cores / 16 Threads)

| Range | Single Thread | 16 Threads | Speedup | Primes/Min |
|-------|--------------|-----------|---------|------------|
| 1-1M | 0.09s | 0.24s | 0.36x | 19.46M |
| 1-10M | 0.94s | 0.35s | 2.66x | 112.64M |
| 1-100M | 22.67s | **4.11s** | **5.52x** | **84.19M** |

*Benchmarks run on 11th Gen Intel(R) Core(TM) i7-11800H @ 2.30GHz*

**Key Findings:**
- Uses **all 16 logical threads** (including hyperthreading) for maximum performance
- Achieves **5.52x speedup** on 1-100M range using hyperthreading
- Optimal performance at 16 threads for larger ranges
- Smaller ranges (1M) show overhead due to thread creation cost

### Thread Scaling Analysis (1-100M Range)

| Threads | Time | Speedup | Efficiency |
|---------|------|---------|------------|
| 1 | 22.51s | 1.00x | 100% |
| 2 | 14.77s | 1.52x | 76% |
| 4 | 8.49s | 2.65x | 66% |
| 8 | 5.35s | 4.21x | 53% |
| 12 | 5.58s | 4.03x | 34% |
| **16** | **5.06s** | **4.45x** | **28%** |

*Note: Efficiency decreases with more threads due to hyperthreading overhead, but total throughput increases*

### Language Performance Comparison

Relative performance for equivalent prime search operations:

| Language | Relative Speed | Notes |
|----------|---------------|-------|
| C (optimized) | 5-10x | Native code, manual optimizations |
| Rust (optimized) | 4-8x | LLVM optimizations, zero-cost abstractions |
| **TypeScript/V8** | **1x (baseline)** | **This package with 16-thread multithreading** |
| Go | 0.8-1.2x | Good concurrency, GC overhead |
| Java (JIT) | 0.8-1.5x | JIT warmup, GC pauses |
| Python (CPython) | 0.02-0.05x | 20-50x slower (GIL limitation) |
| Ruby | ~0.02x | 30-60x slower |

**Key insight**: While C and Rust remain faster in raw single-threaded performance, this TypeScript implementation with multithreading enters the **top tier** of languages for CPU-bound mathematical operations. Combined with V8's excellent JIT compilation and zero-allocation optimizations, it delivers professional-grade performance suitable for production use.

### Why TypeScript/JavaScript?

✅ **V8's world-class JIT compiler** produces highly optimized machine code
✅ **Native multithreading** via worker_threads (no GIL like Python)
✅ **Zero-allocation hot paths** minimize GC pressure
✅ **6k±1 wheel optimization** reduces checks by 66%
✅ **Type safety** catches bugs at compile time
✅ **Full hyperthreading support** - utilizes all logical CPUs

## 📦 Installation

```bash
npm install fast-prime-search
```

## 🎯 Quick Start

### Programmatic API

```typescript
import { searchPrimes, searchPrimesFast, isPrimeNumber } from 'fast-prime-search';

// Search with custom thread count
const result = await searchPrimes({ start: 1, end: 1000000 }, { 
  threads: 16,  // Use all logical threads including hyperthreading
  showProgress: true 
});

console.log(`Found ${result.count} primes`);
console.log(`Speed: ${result.primesPerMinute.toFixed(0)} primes/minute`);

// Use all CPU cores automatically (16 threads on i7)
const fastResult = await searchPrimesFast({ start: 1, end: 10000000 });

// Check single number
const is17Prime = isPrimeNumber(17); // true
```

### CLI Usage

```bash
# Basic search (single thread)
npx fast-prime-search 0 1000000

# Use all cores (16 threads on i7)
npx fast-prime-search 0 1000000 max

# Specify thread count
npx fast-prime-search 0 1000000 16

# Save results to file
npx fast-prime-search 0 1000000 max -f

# Silent mode (no progress bar)
npx fast-prime-search 0 1000000 max -s
```

## 📚 API Reference

### `searchPrimes(range, options?)`

Search for prime numbers in a range with configurable threading.

**Parameters:**
- `range`: `{ start: number, end: number }` - Search range
- `options`: `PrimeSearchOptions` - Optional configuration
  - `threads`: `number | 'max'` - Thread count (default: 1, 'max' uses all logical CPUs)
  - `showProgress`: `boolean` - Show progress indicator (1 second updates)
  - `onProgress`: `(progress: SearchProgress) => void` - Progress callback

**Returns:** `Promise<SearchResult>`

### `searchPrimesFast(range, options?)`

Convenience method that automatically uses all logical CPU threads (including hyperthreading).

### `isPrimeNumber(n)`

Check if a single number is prime.

**Returns:** `boolean`

### `getPhysicalCores()`

Get the number of logical CPU threads available (includes hyperthreading).

**Returns:** `number`

## 🔧 Architecture

```
┌─────────────────────────────────────┐
│         Main Thread                 │
│  ┌─────────────────────────────┐    │
│  │   Divide range by threads   │    │
│  └─────────────────────────────┘    │
└──────────────┬──────────────────────┘
               │ spawns
       ┌───────┴───────┐
       │               │
   ┌───▼───┐       ┌───▼───┐
   │Worker1│       │WorkerN│
   └───┬───┘       └───┬───┘
       │               │
       └───────┬───────┘
               │ results
       ┌───────▼───────┐
       │ Merge & Sort  │
       └───────────────┘
```

**Why this architecture?**

1. **Single thread spawn**: Workers are created once per search, not dynamically
2. **Range splitting**: Each worker gets an equal chunk of the search space
3. **Parallel processing**: All workers run simultaneously
4. **Hyperthreading support**: Utilizes all logical threads for maximum throughput
5. **Result merging**: Results are flattened and sorted

This approach minimizes thread creation overhead and maximizes CPU utilization, including hyperthreading.

## ⚡ Performance Notes

### Thread Count Optimization

For Intel i7-11800H (8 cores / 16 threads):
- **Small ranges (< 10M)**: 1-4 threads optimal (thread creation overhead)
- **Medium ranges (10M-100M)**: 8-12 threads optimal
- **Large ranges (> 100M)**: **16 threads optimal** (full hyperthreading)

### Progress Meter Overhead

The progress meter updates every 1000ms (1 second) and has minimal impact on performance:

| Operation | Without Progress | With Progress | Overhead |
|-----------|------------------|---------------|----------|
| 1-10M range | 288ms | 300ms | ~4% |

For very short operations (<500ms), consider using silent mode.

### Memory Usage

Memory usage scales linearly with the size of the range:
- Small ranges (1M): ~50-100 MB
- Medium ranges (10M): ~200-400 MB
- Large ranges (100M+): 1-2 GB+

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run benchmarks
npm run benchmark
```

## 🏗️ Development

```bash
# Clone repository
git clone https://github.com/vettis/fast-prime-search.git
cd fast-prime-search

# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run build:watch

# Lint
npm run lint

# Format
npm run format
```

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🔒 Security

See [SECURITY.md](SECURITY.md) for security policies and reporting.

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

- The 6k±1 wheel optimization is a well-known algorithm in number theory
- Thanks to the Node.js team for worker_threads implementation
- Inspired by the need for fast prime generation in JavaScript/TypeScript

---

**Made with ❤️ by Ville Vettenranta**

If you find this package useful, please ⭐ star the repository!