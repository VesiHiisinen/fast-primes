# AGENTS.md - Repository Guidelines

## Build Commands

```bash
# Compile TypeScript to JavaScript (outputs to ./out)
npx tsc

# Run the compiled application
node out/searchPrimes.js [start] [end] [threads] [-f]

# Example: Search primes from 0 to 1,000,000 using max threads
node out/searchPrimes.js 0 1000000 max

# Example: Search and save results to file
node out/searchPrimes.js 0 1000000 4 -f
```

## TypeScript Configuration

- Target: ES2022
- Module: NodeNext (ES modules)
- Strict mode enabled
- Source: `src/` → Output: `out/`

## Code Style Guidelines

### Imports
- Use ES module imports (`import ... from ...`)
- Node.js built-ins: `import { Worker } from 'worker_threads'`
- External modules: `import path from 'path'`

### Naming Conventions
- camelCase for variables, functions, methods
- PascalCase for interfaces and types (if any)
- Descriptive names: `multiThreadPrimeSearch`, `numPhysicalCores`

### Types
- Enable `strict: true` in tsconfig.json
- Explicit return types on exported functions
- Type annotations on function parameters
- Use TypeScript's built-in utility types

### Formatting
- Indent: 4 spaces
- Semicolons: required
- Quotes: single quotes for strings
- Trailing commas in objects/arrays

### Error Handling
- Use try-catch for async operations
- Check for worker thread context with `isMainThread`
- Validate numeric inputs with fallback defaults
- Use optional chaining (`parentPort?.postMessage`)

### Worker Threads
- Main thread: `searchPrimes.ts`
- Worker thread: `worker.ts`
- Communication via `workerData` and `postMessage`
- Worker compiled to `out/worker.js` (referenced at runtime)

## File Organization

```
src/
  searchPrimes.ts    # Main thread - orchestrates workers
  worker.ts          # Worker thread - prime computation
out/                 # Compiled JavaScript (gitignored)
output/              # Prime number results (gitignored)
```

## Runtime Behavior

- Automatically detects physical CPU cores
- Defaults to 1 thread if not specified
- Supports writing results to timestamped files in `output/`
- Progress indicator writes to stdout

## Dependencies

- TypeScript 5.7+
- Node.js 22+ (worker_threads, ES modules)
- External: `queue-typescript` (available but unused in current code)

## Notes

- No test runner configured - tests would need Jest/Vitest setup
- No linting configured - consider adding ESLint
- No formatter configured - consider adding Prettier
- Application is compute-intensive; respect user's CPU when running
