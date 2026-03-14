# GPU Prime Sieve — Architecture & Implementation Design

**Status:** Design / Pre-implementation  
**Target branch:** `feature/gpu-sieve`  
**Author:** Ville Vettenranta  
**Date:** 2026-03-14

---

## 1. Motivation

The current CPU implementation (`src/index.ts`) achieves ~84M primes/min on an 8-core/16-thread i7-11800H
using the 6k±1 wheel and Node.js worker_threads. This is competitive for a CPU, but it is
fundamentally limited by serial memory bandwidth and the number of physical cores.

A modern mid-range GPU exposes **thousands of independent shader cores** and memory bandwidth
an order of magnitude wider than a CPU. LingSieve (the current fastest public CUDA sieve) counts
all primes up to 10^11 in **0.225 seconds** on a GTX 5060 Ti — our CPU takes ~22 seconds for
the same range (100× difference).

The goal of this document is to design a **WebGPU-native** implementation that:

- Runs in Node.js today via the `webgpu` npm package (dawn.node — Google's Dawn runtime)
- Targets **all GPU vendors** (NVIDIA, AMD, Intel, Apple Silicon) without requiring CUDA
- Pushes every hardware abstraction layer as hard as the WebGPU spec allows
- Lays the groundwork for a CUDA fast-path via N-API when an NVIDIA GPU is detected

---

## 2. Algorithm Selection

### 2.1 Why not trial division at scale?

The current CPU hot path (`isPrime`) uses 6k±1 trial division: O(√n) per number.
At n ≈ 10^9, √n ≈ 31 623 divisions per candidate. Even at 10^12 ops/sec this is
fundamentally memory-latency-bound per number on a GPU warp — threads would diverge
on early exits, killing occupancy.

### 2.2 Segmented Sieve of Eratosthenes — the right primitive

The Sieve of Eratosthenes is **embarrassingly parallel** at the segment level:

```
For each segment [L, L+S):
  For each small prime p ≤ √(L+S):
    Mark multiples of p in this segment as composite
  Remaining unmarked numbers are prime
```

Each segment is independent of all others after the initial small-prime precomputation.
This maps directly onto a GPU workgroup grid.

### 2.3 Bit-packing

Store the sieve as a **packed bitfield**, one bit per odd number (evens trivially excluded).
A 32-bit uint stores 32 candidates. This gives:

- **32× memory reduction** vs. byte-per-candidate
- Bitfield operations map to native GPU 32-bit integer instructions
- A 256 KB L1/shared-memory block covers a sieve segment of **4 million candidates**

### 2.4 Wheel factorisation (mod 30)

Pre-eliminate multiples of 2, 3, and 5 via a mod-30 wheel. Only 8 of every 30 integers
can be prime (the residues 1, 7, 11, 13, 17, 19, 23, 29). This gives:

- **73% reduction** in memory footprint vs. odd-only
- Each 32-bit word now represents 30×4 = 120 candidate integers
- Lookup tables for wheel step and bit index fit in GPU constant memory

---

## 3. GPU Architecture

### 3.1 Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  CPU / Node.js                                                   │
│  ┌──────────────┐    ┌──────────────────────────────────────┐   │
│  │  Range split │───▶│   Upload small-prime table to GPU   │   │
│  └──────────────┘    └──────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────┘
                                 │  GPUBuffer (uniform)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  GPU — Pass 1: Precompute small primes (≤ √maxRange)            │
│                                                                  │
│  Single workgroup, sequential sieve up to ~10^6                  │
│  Output: packed small-prime list in GPUBuffer                   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  GPU — Pass 2: Parallel segmented sieve                          │
│                                                                  │
│  Grid: N workgroups, each owns one segment                       │
│  Workgroup size: 256 invocations                                 │
│  Shared memory: packed bitfield for the segment                  │
│  Each invocation sieves a stripe of the bitfield                 │
│                                                                  │
│  Inner loop: for each small prime p                              │
│    - Compute first multiple ≥ segment start (mod arithmetic)     │
│    - Each invocation advances by p×256 (coalesced stride)       │
│    - Atomic OR to mark composite bits                            │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  GPU — Pass 3: Popcount + prefix sum                             │
│                                                                  │
│  Count primes per segment using warp-level popcount              │
│  Exclusive prefix sum across segments → global index array       │
│  Scatter primes into output GPUBuffer (sorted, compact)          │
└────────────────────────────────┬────────────────────────────────┘
                                 │  readback via mapAsync
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  CPU — Decode & emit                                             │
│  Reconstruct actual integers from bit positions + segment offset │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Workgroup / Dispatch Parameters

| Parameter          | Value                                                      | Rationale                                        |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------ |
| Segment size       | 2^23 bits = 1M candidates (mod-30 wheel → ~3.75M integers) | Fits in 256 KB shared mem                        |
| Workgroup size     | 256 invocations                                            | Optimal occupancy on all major GPU architectures |
| Max dispatch       | 65535 workgroups (WebGPU limit)                            | Covers ranges up to ~245 billion per dispatch    |
| Small prime limit  | √(2^64) ≈ 4.3 billion                                      | Precomputed on GPU once, reused per dispatch     |
| Bitfield word size | u32                                                        | Native GPU int; popcount is a single instruction |

### 3.3 Memory Layout

```
GPUBuffer: small_primes[]  (read-only storage)
  [p0, p1, p2, ..., pK]  — all primes ≤ √(range_end)
  K ≈ 3.4M for range up to 10^14 (< 14 MB)

GPUBuffer: sieve_output[]  (read-write storage)
  One u32 per 32 candidates
  Per segment: 2^23 / 32 = 262144 words = 1 MB

GPUBuffer: prime_counts[]  (atomic, read-write)
  One u32 per segment — filled by popcount pass

GPUBuffer: prime_offsets[] (prefix sum result)
  One u32 per segment — base index for scatter

GPUBuffer: result_primes[] (write-only storage)
  Packed u64 array of found primes
```

### 3.4 Shader Strategy (WGSL)

Three compute shaders, all written in WGSL:

#### Shader 1 — `small_prime_sieve.wgsl`

Single-dispatch sieve up to `sqrt(range_end)`. Classical sequential sieve on GPU,
but only needs to run once per search. Uses `workgroupstorageBarrier()` between
passes to keep the bitfield in shared memory.

#### Shader 2 — `segment_sieve.wgsl`

The hot path. One workgroup per segment.

```wgsl
@compute @workgroup_size(256)
fn segment_sieve(
  @builtin(workgroup_id) wg: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>
) {
  // Each workgroup loads its segment offset
  let seg_start = wg.x * SEGMENT_SIZE_BITS;

  // Shared memory bitfield — 1 MB per workgroup
  var<workgroup> bits: array<atomic<u32>, WORDS_PER_SEGMENT>;

  // Initialise: all candidates assumed prime (all bits set)
  for (var i = lid.x; i < WORDS_PER_SEGMENT; i += 256u) {
    atomicStore(&bits[i], 0xFFFFFFFFu);
  }
  workgroupBarrier();

  // Sieve: each invocation handles one prime p in a stride
  for (var pi = lid.x; pi < num_small_primes; pi += 256u) {
    let p = small_primes[pi];
    // First multiple of p in segment (wheel-corrected)
    var first = first_multiple_in_segment(p, seg_start);
    // Mark composites — stride = p to maintain coalescing
    while (first < seg_start + SEGMENT_SIZE_BITS) {
      let word = (first - seg_start) >> 5u;
      let bit  = (first - seg_start) & 31u;
      atomicAnd(&bits[word], ~(1u << bit));
      first += p;
    }
  }
  workgroupBarrier();

  // Flush to global buffer
  for (var i = lid.x; i < WORDS_PER_SEGMENT; i += 256u) {
    sieve_output[wg.x * WORDS_PER_SEGMENT + i] = atomicLoad(&bits[i]);
  }
}
```

#### Shader 3 — `popcount_scatter.wgsl`

Two sub-passes:

1. **Popcount**: `countOneBits(word)` per word → segment count
2. **Scatter**: iterate set bits, decode to actual integers, write to `result_primes[]`
   using the prefix-sum offset as base index.

`countOneBits` maps to a single hardware instruction on all GPU vendors (NVIDIA `POPC`,
AMD `s_bcnt1_i32_b32`, Intel `dp4a`-equivalent).

---

## 4. Hardware-Specific Optimisations

### 4.1 NVIDIA — Tensor Cores (future fast-path)

WebGPU does not expose tensor cores. However, for a native CUDA fast-path:

- **Tensor cores** (Ampere+) can be repurposed via `mma.sync.aligned` for
  **bitmatrix multiply-accumulate**: multiplying a vector of candidate bits against
  a small-prime bitmask in 4×4 or 8×16 sub-tiles, computing 256 candidate marks
  per instruction instead of 1.
- This requires the CUDA N-API bridge (see §5).
- Expected speedup over baseline CUDA: 3-5×.

### 4.2 AMD — Wave64 & LDS Banks

AMD GCN/RDNA uses 64-wide wavefronts (vs NVIDIA's 32-wide warps).

- Increase workgroup size to 512 on AMD to fill the wavefront
- Use 32-bank LDS (Local Data Store) layout that avoids bank conflicts on the
  bitfield words — stride accesses by lane index
- `subgroupBallot` for warp-level popcount (WebGPU `subgroupBallot` extension,
  currently behind a flag — fall back to `countOneBits` otherwise)

### 4.3 Apple Silicon — Unified Memory

Apple M-series has no discrete VRAM. CPU and GPU share the same physical memory pool.

- **Zero-copy path**: avoid `mapAsync` readback entirely; use shared `MTLBuffer`
  accessible from both CPU and GPU without transfer
- In WebGPU terms: request `GPUBufferUsage.MAP_READ | STORAGE` and use
  `buffer.getMappedRange()` directly after the compute pass completes
- Expected speedup vs copy: 40-60% on M1/M2 for large result buffers

### 4.4 Intel Arc / Xe — EU width

Intel GPUs use 8-wide SIMD-8 or SIMD-16 execution units. Ensure workgroup dimensions
are multiples of 16 for optimal EU packing. Use `subgroupSize` query at runtime.

---

## 5. CUDA N-API Bridge (Optional Fast-Path)

When `nvidia-smi` is detected at startup, the implementation may load a native N-API
addon (`gpu_sieve.node`) compiled from CUDA C++:

```
src/
  gpu/
    wgsl/                    ← WebGPU shaders (all platforms)
      small_prime_sieve.wgsl
      segment_sieve.wgsl
      popcount_scatter.wgsl
    cuda/                    ← CUDA fast-path (NVIDIA only)
      sieve_kernel.cu        ← Main segmented sieve kernel
      tensor_sieve.cu        ← Tensor-core bitmatrix path (Ampere+)
      binding.cpp            ← N-API bindings
      CMakeLists.txt
```

The TypeScript layer detects the addon at runtime and falls through gracefully:

```typescript
let gpuBackend: GPUBackend;

try {
  // Try CUDA N-API addon first (NVIDIA only, highest performance)
  gpuBackend = await loadCudaBackend();
} catch {
  try {
    // Fall back to WebGPU (all GPU vendors)
    gpuBackend = await loadWebGPUBackend();
  } catch {
    // Final fallback: CPU worker_threads
    gpuBackend = loadCPUBackend();
  }
}
```

---

## 6. Memory Transfer Optimisation

The bottleneck for large ranges shifts from computation to **PCIe bandwidth** (discrete GPUs).

Strategies to minimise it:

1. **Do not transfer the sieve bitfield back** — only transfer the final prime list.
   For a range of 10^10, the sieve bitfield is ~300 MB but the prime list is ~400 MB
   (40M primes × 10 bytes). At this scale, transferring counts + doing decode on CPU
   is cheaper.

2. **Chunked streaming**: process and stream results in 10^9-element chunks.
   Each chunk's result is transferred while the GPU sieve runs the next chunk
   (double-buffered GPU ↔ CPU pipeline).

3. **Compressed transfer**: use run-length encoding of prime gaps (average gap at 10^10
   is ~23) — a gap fits in a single byte 99.9% of the time, reducing transfer to ~40 MB
   for 10^10 primes. Decode on CPU.

---

## 7. Expected Performance Targets

Based on LingSieve (CUDA, GTX 1080) as a reference baseline, scaled to WebGPU overhead:

| Range | CPU (4-core i5-4670K) | CPU (16T i7-11800H) | WebGPU est. (GTX 1080) | CUDA est. (GTX 1080) |
| ----- | --------------------- | ------------------- | ---------------------- | -------------------- |
| 10^9  | ~4s                   | ~0.6s               | ~0.05s                 | ~0.02s               |
| 10^10 | ~40s                  | ~6s                 | ~0.5s                  | ~0.2s                |
| 10^11 | ~400s                 | ~60s                | ~5s                    | ~1s                  |
| 10^12 | impractical           | ~600s               | ~50s                   | ~10s                 |

WebGPU introduces overhead vs raw CUDA (~2-5×) due to:

- Shader compilation / pipeline creation (one-time, cached)
- Validation layer (can be disabled in production)
- No direct access to shared memory from host

---

## 8. Implementation Plan

### Phase 1 — WebGPU scaffold (branch: `feature/gpu-sieve`)

- [ ] Add `webgpu` npm package (dawn.node)
- [ ] `src/gpu/webgpu-backend.ts` — adapter init, device query, feature detection
- [ ] `src/gpu/buffers.ts` — typed GPU buffer helpers (upload, download, zero)
- [ ] `src/gpu/shaders/small_prime_sieve.wgsl` — Pass 1 shader
- [ ] `src/gpu/shaders/segment_sieve.wgsl` — Pass 2 shader
- [ ] `src/gpu/shaders/popcount_scatter.wgsl` — Pass 3 shader
- [ ] `src/gpu/gpu-sieve.ts` — orchestration (init → dispatch → readback)
- [ ] Integration with existing `searchPrimes` API (new `backend: 'gpu'` option)
- [ ] GPU benchmark suite (`src/gpu/benchmark.ts`)

### Phase 2 — Optimisation

- [ ] Subgroup extensions (`subgroupBallot`, `subgroupAdd`) where available
- [ ] Double-buffered chunked streaming
- [ ] Compressed gap encoding on GPU
- [ ] Apple Silicon zero-copy path
- [ ] Runtime GPU profiling via `GPUQuerySet` (timestamp queries)

### Phase 3 — CUDA fast-path (optional, NVIDIA only)

- [ ] CUDA kernel for segmented sieve
- [ ] Tensor-core bitmatrix path (Ampere+)
- [ ] N-API binding + CMake build system
- [ ] CI matrix: CPU / WebGPU / CUDA

---

## 9. API Design

The GPU backend is exposed as an opt-in option on the existing API, preserving full
backwards compatibility:

```typescript
import { searchPrimes } from 'fast-prime-search';

// Auto-select best available backend (GPU → CPU fallback)
const result = await searchPrimes(
  { start: 1_000_000_000, end: 2_000_000_000 },
  {
    backend: 'auto', // 'auto' | 'gpu' | 'cpu'
    threads: 'max', // ignored when backend = 'gpu'
    showProgress: true,
  }
);

console.log(`Backend used: ${result.backend}`); // 'webgpu' | 'cuda' | 'cpu'
console.log(`GPU device: ${result.gpuDevice}`); // 'NVIDIA GeForce RTX 4090' etc.
console.log(`Found ${result.count} primes`);
```

---

## 10. References

- LingSieve v3.0 — fastest known CUDA sieve implementation (GTX 5060 Ti benchmarks above)
  https://github.com/LingUaan/LingSieve
- Kim Walisch's primesieve — reference CPU implementation (segmented sieve + OpenMP)
  https://github.com/kimwalisch/primesieve
- WebGPU Specification — W3C, §10 (Compute Pipelines)
  https://www.w3.org/TR/webgpu/
- WGSL Specification — `countOneBits`, `subgroupBallot`
  https://www.w3.org/TR/WGSL/
- dawn.node — Node.js WebGPU via Google Dawn
  https://github.com/dawn-gpu/node-webgpu
- NVIDIA CUDA Best Practices Guide — Shared Memory, Warp Primitives
  https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/
- "Parallel Prime Sieve on GPU" (Himsen, 2012) — foundational segmented GPU sieve
  https://himsen.github.io/pdf/Project1_parallel_algorithms_Torben.pdf
