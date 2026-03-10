# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-10

### Added
- Initial release of fast-prime-search
- High-performance prime number search using worker_threads
- 6k±1 wheel optimization for prime checking
- Multithreaded architecture with automatic CPU core detection
- Programmatic API with TypeScript support
- CLI tool with progress indicator
- Benchmark suite for performance testing
- Comprehensive test suite with Vitest
- Full TypeScript type definitions
- MIT License

### Features
- `searchPrimes()` - Search with custom thread count
- `searchPrimesFast()` - Auto-detect and use all CPU cores
- `isPrimeNumber()` - Single number primality test
- Progress callback support
- Results export to file
- Silent mode for CLI
- Memory usage tracking

### Performance
- Achieves millions of primes per minute on modern CPUs
- Linear scaling with thread count
- Minimal memory overhead
- Zero-allocation hot paths in prime checking

[1.0.0]: https://github.com/vettis/fast-prime-search/releases/tag/v1.0.0