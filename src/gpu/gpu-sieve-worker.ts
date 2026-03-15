/**
 * gpu-sieve-worker.ts
 *
 * Standalone GPU sieve worker process.
 *
 * Usage: node dist/gpu/gpu-sieve-worker.js <startOdd> <endOdd> <numSegments>
 *
 * Dawn.node v0.3.8 crashes on the second mapAsync call in the same process
 * when atomic compute shaders have been used beforehand (futex / mutex
 * corruption in dawn's internal fence tracking).
 *
 * Workaround: run exactly ONE GPU sieve call per process.  The parent
 * (gpu-sieve.ts) spawns this worker for each searchPrimes call.
 *
 * Output: raw binary — numSegments * WORDS_PER_SEGMENT * 4 bytes of u32
 * sieve bitfield written to stdout, then process.exit(0).
 * Bit i of word w is 1 if odd number (startOdd + (w*32+i)*2) is prime.
 */

import { initGPU } from './webgpu-backend.js';

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const [, , startOddStr, endOddStr, numSegmentsStr] = process.argv;
const startOdd = parseInt(startOddStr, 10);
const endOdd = parseInt(endOddStr, 10);
const numSegments = parseInt(numSegmentsStr, 10);

if (isNaN(startOdd) || isNaN(endOdd) || isNaN(numSegments)) {
  process.stderr.write('gpu-sieve-worker: invalid args\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Constants (must match gpu-sieve.ts)
// ---------------------------------------------------------------------------

const SEGMENT_BITS = 1 << 20;
const WORDS_PER_SEGMENT = SEGMENT_BITS >>> 5;
const sieveBytes = numSegments * WORDS_PER_SEGMENT * 4;

// ---------------------------------------------------------------------------
// CPU small-prime sieve
// ---------------------------------------------------------------------------

function cpuSmallPrimeSieve(limit: number): number[] {
  const s = new Uint8Array(limit + 1).fill(1);
  s[0] = 0;
  s[1] = 0;
  for (let i = 2; i * i <= limit; i++) {
    if (s[i]) for (let j = i * i; j <= limit; j += i) s[j] = 0;
  }
  const primes: number[] = [];
  for (let i = 3; i <= limit; i += 2) if (s[i]) primes.push(i);
  return primes;
}

// ---------------------------------------------------------------------------
// Shader source (inline — no fs.readFile needed in worker)
// ---------------------------------------------------------------------------

const shaderSrc = `
override SEGMENT_BITS     : u32 = ${SEGMENT_BITS}u;
override WORDS_PER_SEGMENT : u32 = ${WORDS_PER_SEGMENT}u;

struct Uniforms {
    range_start_odd  : u32,
    range_end_odd    : u32,
    num_small_primes : u32,
    num_segments     : u32,
}

@group(0) @binding(0) var<uniform>             uniforms     : Uniforms;
@group(0) @binding(1) var<storage, read>       small_primes : array<u32>;
@group(0) @binding(2) var<storage, read_write> sieve_output : array<atomic<u32>>;

@compute @workgroup_size(256)
fn sieve_init(
    @builtin(workgroup_id)        wgid : vec3<u32>,
    @builtin(local_invocation_id) lid  : vec3<u32>,
) {
    let base = wgid.x * WORDS_PER_SEGMENT;
    for (var w = lid.x; w < WORDS_PER_SEGMENT; w += 256u) {
        atomicStore(&sieve_output[base + w], 0xFFFFFFFFu);
    }
}

@compute @workgroup_size(256)
fn sieve_mark(
    @builtin(workgroup_id)        wgid : vec3<u32>,
    @builtin(local_invocation_id) lid  : vec3<u32>,
) {
    let seg    = wgid.x;
    let py     = wgid.y;
    let lx     = lid.x;

    if py >= uniforms.num_small_primes { return; }

    let p          = small_primes[py + 1u];
    let si         = seg * SEGMENT_BITS;
    let word_base  = seg * WORDS_PER_SEGMENT;
    let first_num  = uniforms.range_start_odd + si * 2u;

    var fm = ((first_num + p - 1u) / p) * p;
    if (fm & 1u) == 0u { fm += p; }
    if fm < p * p {
        fm = p * p;
        if (fm & 1u) == 0u { fm += p; }
    }
    if fm < uniforms.range_start_odd { return; }

    let fi     = (fm - uniforms.range_start_odd) >> 1u;
    let stride = 256u * p;
    var idx    = fi + lx * p;
    let se     = si + SEGMENT_BITS;

    while idx < se {
        let is_ = idx - si;
        atomicAnd(&sieve_output[word_base + (is_ >> 5u)], ~(1u << (is_ & 31u)));
        idx += stride;
    }
}
`;

// ---------------------------------------------------------------------------
// BATCH_SIZE: max Y-workgroups per sieve_mark dispatch (atomic contention TDR)
// ---------------------------------------------------------------------------
const BATCH_SIZE = 40;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const { device, info } = await initGPU();
// Write device name to stderr so parent can read it (prefixed to avoid confusion with errors)
process.stderr.write(`DEVICE:${info.device}\n`);

const sqrtEnd = Math.ceil(Math.sqrt(endOdd));
const smallPrimes = cpuSmallPrimeSieve(sqrtEnd);
const numBatches = smallPrimes.length > 0 ? Math.ceil(smallPrimes.length / BATCH_SIZE) : 1;

// Build pipeline (once per process)
const bgl = device.createBindGroupLayout({
  entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
  ],
});
const pl = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
const mod = device.createShaderModule({ code: shaderSrc });
const initP = device.createComputePipeline({
  layout: pl,
  compute: { module: mod, entryPoint: 'sieve_init' },
});
const markP = device.createComputePipeline({
  layout: pl,
  compute: { module: mod, entryPoint: 'sieve_mark' },
});

// Per-call buffers
const spBuf = device.createBuffer({
  size: Math.max((BATCH_SIZE + 1) * 4, 4),
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
const sieveBuf = device.createBuffer({
  size: sieveBytes,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
});
const uniBuf = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const staging = device.createBuffer({
  size: sieveBytes,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});

const bg = device.createBindGroup({
  layout: bgl,
  entries: [
    { binding: 0, resource: { buffer: uniBuf } },
    { binding: 1, resource: { buffer: spBuf } },
    { binding: 2, resource: { buffer: sieveBuf } },
  ],
});

// Init pass: fill sieve with all-1s
device.queue.writeBuffer(
  uniBuf,
  0,
  new Uint32Array([startOdd, endOdd, 0, numSegments]).buffer,
  0,
  16
);
{
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(initP);
  pass.setBindGroup(0, bg);
  pass.dispatchWorkgroups(numSegments);
  pass.end();
  device.queue.submit([enc.finish()]);
}

// Mark passes (batched), fold copy into last batch
for (let b = 0; b < numBatches; b++) {
  const bStart = b * BATCH_SIZE;
  const bPrimes = smallPrimes.slice(bStart, bStart + BATCH_SIZE);
  const bCount = bPrimes.length;

  const spData = new Uint32Array([bCount, ...bPrimes]);
  device.queue.writeBuffer(spBuf, 0, spData.buffer, 0, spData.byteLength);
  device.queue.writeBuffer(
    uniBuf,
    0,
    new Uint32Array([startOdd, endOdd, bCount, numSegments]).buffer,
    0,
    16
  );

  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(markP);
  pass.setBindGroup(0, bg);
  // Only dispatch if there are primes to mark
  if (bCount > 0) {
    pass.dispatchWorkgroups(numSegments, bCount);
  }
  pass.end();

  // Fold copyBufferToBuffer into the last batch encoder → single mapAsync
  if (b === numBatches - 1) {
    enc.copyBufferToBuffer(sieveBuf, 0, staging, 0, sieveBytes);
  }
  device.queue.submit([enc.finish()]);
}

// Single mapAsync per process lifetime
await staging.mapAsync(GPUMapMode.READ);
const mapped = staging.getMappedRange();
// Copy data out of mapped range, then immediately unmap + destroy GPU before
// writing stdout.  Dawn.node v0.3.8 crashes during process teardown if the
// device is still alive (futex/mutex corruption in fence tracking).
// Destroying the device explicitly here avoids that crash.
const raw = Buffer.from(mapped.slice(0));
staging.unmap();
device.destroy();

// Write raw sieve bytes to stdout — wait for full drain before exit
await new Promise<void>((resolve, reject) => {
  process.stdout.end(raw, (err?: Error | null) => {
    if (err) reject(err);
    else resolve();
  });
});

process.exit(0);
