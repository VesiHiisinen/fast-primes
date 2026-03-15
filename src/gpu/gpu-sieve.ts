/**
 * GPU Sieve Orchestrator
 *
 * Dawn.node v0.3.8 crashes on the second mapAsync call in the same process
 * when atomic compute shaders have been used (futex / internal fence bug).
 * Workaround: spawn gpu-sieve-worker.js as a child process for every call.
 * Each worker process does exactly one GPU init → sieve → mapAsync → exit.
 *
 * Worker protocol:
 *   stdin : nothing
 *   args  : <startOdd> <endOdd> <numSegments>
 *   stdout: numSegments × WORDS_PER_SEGMENT × 4 raw bytes (u32 sieve bitfield)
 *   exit 0: success
 *   exit 1: error (stderr contains message)
 *
 * The parent decodes the bitfield to a prime list and returns GPUSieveResult.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

import type { Range } from '../types.js';

// ---------------------------------------------------------------------------
// Constants — must match gpu-sieve-worker.ts
// ---------------------------------------------------------------------------

const SEGMENT_BITS = 1 << 20;
const WORDS_PER_SEGMENT = SEGMENT_BITS >>> 5;

// ---------------------------------------------------------------------------
// GPU sieve result
// ---------------------------------------------------------------------------

export interface GPUSieveResult {
  primes: number[];
  count: number;
  duration: number;
  primesPerMinute: number;
  gpuDevice: string;
  backend: 'webgpu';
}

// ---------------------------------------------------------------------------
// Worker path
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_PATH = path.join(__dirname, 'gpu-sieve-worker.js');

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the GPU prime sieve for `range`.
 * Spawns a child process for each call to work around dawn.node mapAsync bug.
 */
export async function gpuSieve(range: Range): Promise<GPUSieveResult> {
  const wallStart = Date.now();

  const rangeStart = range.start < 2 ? 2 : range.start;
  const rangeEnd = range.end;

  if (rangeEnd > 0xffffffff) {
    throw new Error('GPU sieve: range.end > 2^32-1 not yet supported');
  }

  // Trivial ranges
  if (rangeEnd < 2) {
    return buildResult([], range, wallStart, 'webgpu');
  }

  const include2 = rangeStart <= 2 && rangeEnd >= 2;

  const startOdd = Math.max(3, (rangeStart & 1) === 0 ? rangeStart + 1 : rangeStart);
  const endOdd = (rangeEnd & 1) === 0 ? rangeEnd - 1 : rangeEnd;

  if (startOdd > endOdd) {
    return buildResult(include2 ? [2] : [], range, wallStart, 'webgpu');
  }

  const totalBits = ((endOdd - startOdd) >>> 1) + 1;
  const numSegments = Math.ceil(totalBits / SEGMENT_BITS);

  const { data: rawBits, gpuDevice } = await spawnWorker(startOdd, endOdd, numSegments);

  // Decode sieve bitfield to prime list
  const primes: number[] = include2 ? [2] : [];
  const words = new Uint32Array(rawBits.buffer, rawBits.byteOffset, rawBits.byteLength >>> 2);

  for (let i = 0; ; i++) {
    const num = startOdd + i * 2;
    if (num > endOdd) break;
    const word = i >>> 5;
    const bit = i & 31;
    if ((words[word] >>> bit) & 1) primes.push(num);
  }

  return buildResult(primes, range, wallStart, gpuDevice);
}

// ---------------------------------------------------------------------------
// Spawn helper
// ---------------------------------------------------------------------------

interface WorkerResult {
  data: Buffer;
  gpuDevice: string;
}

function spawnWorker(startOdd: number, endOdd: number, numSegments: number): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [WORKER_PATH, startOdd.toString(), endOdd.toString(), numSegments.toString()],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    const errLines: string[] = [];
    let gpuDevice = 'webgpu';
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        if (line.startsWith('DEVICE:')) {
          gpuDevice = line.slice(7).trim();
        } else if (!line.startsWith('Warning:') && line.trim()) {
          errLines.push(line);
        }
      }
    });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(
          new Error(
            `gpu-sieve-worker exited with code ${code}` +
              (errLines.length ? ': ' + errLines.join('') : '')
          )
        );
        return;
      }
      resolve({ data: Buffer.concat(chunks), gpuDevice });
    });

    child.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildResult(
  primes: number[],
  _range: Range,
  startMs: number,
  gpuDevice: string
): GPUSieveResult {
  const duration = Date.now() - startMs;
  const primesPerMinute = duration > 0 ? (primes.length / (duration / 1000)) * 60 : 0;
  return {
    primes,
    count: primes.length,
    duration,
    primesPerMinute,
    gpuDevice,
    backend: 'webgpu',
  };
}

// Re-export for callers that need GPU init info
export { initGPU, type GPUDeviceInfo } from './webgpu-backend.js';
