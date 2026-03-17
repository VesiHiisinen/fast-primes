/**
 * GPU benchmark suite.
 *
 * Compares WebGPU sieve performance against the CPU baseline across
 * a set of standard ranges.  Run with:
 *
 *   npm run benchmark:gpu
 */

import { gpuSieve, initGPU } from './gpu-sieve.js';
import { searchPrimes } from '../index.js';

interface BenchEntry {
  label: string;
  start: number;
  end: number;
}

const BENCH_RANGES: BenchEntry[] = [
  { label: '0–1M', start: 0, end: 1_000_000 },
  { label: '0–10M', start: 0, end: 10_000_000 },
  { label: '0–100M', start: 0, end: 100_000_000 },
  { label: '0–500M', start: 0, end: 500_000_000 },
  { label: '0–1B', start: 0, end: 1_000_000_000 },
  { label: '1B–2B', start: 1_000_000_000, end: 2_000_000_000 },
];

function fmt(n: number, unit: string): string {
  return `${n.toFixed(2)}${unit}`;
}

async function runBench(): Promise<void> {
  const { info } = await initGPU();

  console.log('='.repeat(72));
  console.log('fast-prime-search — GPU benchmark');
  console.log(`GPU: ${info.device} (${info.vendor})`);
  console.log(
    `     maxWorkgroupSizeX=${info.maxWorkgroupSizeX}, maxStorageBuffer=${info.maxWorkgroupStorageSize}B`
  );
  console.log(`     subgroups=${info.hasSubgroups}, timestampQuery=${info.hasTimestampQuery}`);
  console.log('='.repeat(72));

  const header = ['Range', 'GPU ms', 'GPU M/min', 'CPU ms', 'CPU M/min', 'Speedup']
    .map(s => s.padEnd(14))
    .join('');
  console.log(header);
  console.log('-'.repeat(72));

  for (const entry of BENCH_RANGES) {
    const range = { start: entry.start, end: entry.end };

    // GPU
    let gpuMs = 0;
    let gpuMperMin = 0;
    let gpuCount = 0;
    try {
      const gResult = await gpuSieve(range);
      gpuMs = gResult.duration;
      gpuMperMin = gResult.primesPerMinute / 1e6;
      gpuCount = gResult.count;
    } catch (e) {
      console.error(`  GPU FAILED for ${entry.label}: ${(e as Error).message}`);
    }

    // CPU (single-thread baseline)
    const cResult = await searchPrimes(range, { threads: 1, backend: 'cpu' });
    const cpuMs = cResult.duration;
    const cpuMperMin = cResult.primesPerMinute / 1e6;
    const cpuCount = cResult.count;

    const speedup = cpuMs > 0 ? cpuMs / (gpuMs || cpuMs) : 1;
    const countMatch =
      gpuCount === cpuCount ? '' : ` !! COUNT MISMATCH gpu=${gpuCount} cpu=${cpuCount}`;

    const row = [
      entry.label.padEnd(14),
      fmt(gpuMs, '').padEnd(14),
      fmt(gpuMperMin, '').padEnd(14),
      fmt(cpuMs, '').padEnd(14),
      fmt(cpuMperMin, '').padEnd(14),
      `${speedup.toFixed(1)}x`.padEnd(14),
    ].join('');
    console.log(row + countMatch);
  }

  console.log('='.repeat(72));
}

runBench().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
