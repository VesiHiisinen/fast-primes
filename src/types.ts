/**
 * Represents a numeric range with start and end values
 */
export interface Range {
  start: number;
  end: number;
}

/**
 * Options for prime number search
 */
export interface PrimeSearchOptions {
  /** Number of threads to use (default: 1, use 'max' for all cores) */
  threads?: number | 'max';
  /** Whether to show progress indicator */
  showProgress?: boolean;
  /** Callback for progress updates */
  onProgress?: (progress: SearchProgress) => void;
}

/**
 * Progress information during prime search
 */
export interface SearchProgress {
  /** Current memory usage in MB */
  memoryUsage: number;
  /** Number of threads being used */
  threads: number;
  /** Current range being searched */
  range: Range;
  /** Progress indicator character */
  indicator: string;
}

/**
 * Result of a prime number search
 */
export interface SearchResult {
  /** Array of found prime numbers */
  primes: number[];
  /** Total count of primes found */
  count: number;
  /** Time taken in milliseconds */
  duration: number;
  /** Primes found per minute */
  primesPerMinute: number;
  /** Number of threads used */
  threads: number;
}

/**
 * Worker thread data structure
 */
export interface WorkerData {
  range: Range;
}

/**
 * CLI arguments structure
 */
export interface CliArgs {
  start: number;
  end: number;
  threads: number | 'max';
  outputFile?: string;
  silent: boolean;
}