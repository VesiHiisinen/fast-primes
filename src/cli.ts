#!/usr/bin/env node

import { searchPrimes, getPhysicalCores } from './index.js';
import fs from 'fs';
import path from 'path';
import type { Range, SearchResult } from './types.js';

const showHelp = (): void => {
  console.log(`
fast-prime-search - High-performance prime number search using multithreading

Usage:
  fast-prime-search [options] <start> <end> [threads]

Arguments:
  start     Starting number of the range (default: 0)
  end       Ending number of the range (default: 1000000)
  threads   Number of threads to use (default: 1, use 'max' for all cores)

Options:
  -f, --file       Save results to a file
  -s, --silent     Disable progress output
  -h, --help       Show this help message
  -v, --version    Show version number

Examples:
  fast-prime-search 0 1000000           # Search with 1 thread
  fast-prime-search 0 1000000 4         # Use 4 threads
  fast-prime-search 0 1000000 max       # Use all CPU cores
  fast-prime-search 0 1000000 max -f    # Save to file
`);
};

const parseArgs = (): { range: Range; threads: number | 'max'; outputFile?: string; silent: boolean } => {
  const args = process.argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    console.log(packageJson.version);
    process.exit(0);
  }

  const outputFile = args.includes('-f') || args.includes('--file') ? generateOutputPath() : undefined;
  const silent = args.includes('-s') || args.includes('--silent');

  // Remove flags from args
  const filteredArgs = args.filter(arg => !['-f', '--file', '-s', '--silent', '-h', '--help', '-v', '--version'].includes(arg));

  const start = parseInt(filteredArgs[0], 10) || 0;
  const end = parseInt(filteredArgs[1], 10) || 1000000;
  const threads = filteredArgs[2] === 'max' ? 'max' : parseInt(filteredArgs[2], 10) || 1;

  return { range: { start, end }, threads, outputFile, silent };
};

const generateOutputPath = (): string => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/:/g, '.').slice(0, -5);
  return path.join(process.cwd(), `${timestamp}_primes.txt`);
};

const saveResults = (filePath: string, result: SearchResult): void => {
  const content = [
    `# Prime Search Results`,
    `# Range: ${result.primes[0]} - ${result.primes[result.primes.length - 1]}`,
    `# Total primes found: ${result.count}`,
    `# Duration: ${result.duration}ms`,
    `# Threads used: ${result.threads}`,
    `# Speed: ${(result.primesPerMinute / 1000000).toFixed(2)}M primes/min`,
    ``,
    ...result.primes.map(p => p.toString()),
  ].join('\n');

  fs.writeFileSync(filePath, content);
  console.log(`Results saved to: ${filePath}`);
};

const main = async (): Promise<void> => {
  const { range, threads, outputFile, silent } = parseArgs();

  if (!silent) {
    console.log(`Number of physical cores: ${getPhysicalCores()}`);
    console.log(`Searching primes from ${range.start} to ${range.end}...`);
  }

  try {
    const result = await searchPrimes(range, {
      threads,
      showProgress: !silent,
    });

    console.log(`\nFound ${result.count} primes in ${(result.duration / 1000).toFixed(2)} seconds using ${result.threads} threads.`);
    console.log(`Speed: ${(result.primesPerMinute / 1000000).toFixed(2)}M primes per minute.`);

    if (outputFile) {
      saveResults(outputFile, result);
    }

    if (!silent && result.count > 0) {
      console.log(`\nFirst 10 primes: ${result.primes.slice(0, 10).join(', ')}`);
      console.log(`Last 10 primes: ${result.primes.slice(-10).join(', ')}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};

main();
