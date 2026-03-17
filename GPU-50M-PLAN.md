# GPU Sieve: Routes Past the 50M Limitation

## Problem Statement

The GPU prime sieve works correctly for ranges up to 10M (5 segments,
640KB sieve buffer) but crashes with SIGSEGV for ranges >= 50M (24
segments, 3MB sieve buffer) when running as a compiled TypeScript worker
process (`dist/gpu/gpu-sieve-worker.js`).

**Critical observation**: The same 50M GPU workload runs perfectly in a
standalone `.mjs` script (`gpu-50m-isolate.mjs`). The crash is specific
to the compiled ESM worker process, not a fundamental dawn.node buffer
size limitation.

The crash occurs at `device.createBindGroup()` after all buffers have
been successfully created. Exit signal is SIGSEGV (code 139).

Library: `webgpu` npm package v0.3.8 (dawn.node). Last release:
2025-09-25. No newer version available. 3 open issues on GitHub, low
maintenance cadence.

---

## Route A: .mjs Worker Script (Immediate, Low Risk)

### Idea

Since 50M works in a `.mjs` script but not in compiled TypeScript, ship
the GPU worker as a raw `.mjs` file instead of compiling it through
`tsc`. The orchestrator (`gpu-sieve.ts`) already spawns the worker as a
child process — it just needs to point at a `.mjs` file instead of the
compiled `.js`.

### Implementation

1. Create `src/gpu/gpu-sieve-worker.mjs` — plain JavaScript (ES modules),
   no TypeScript, no compilation step.
2. Copy the worker logic verbatim from the current `.ts` file, stripping
   type annotations.
3. Update `gpu-sieve.ts` to resolve the `.mjs` worker path.
4. Add a `postbuild` script to copy the `.mjs` to `dist/gpu/`.
5. Test all ranges: 100, 1K, 10K, 100K, 1M, 10M, 50M, 100M, 500M, 1B.

### Pros

- Minimal code change. The worker is already isolated — changing its
  file extension and skipping `tsc` for that one file is trivial.
- Directly addresses the root cause (compiled ESM bootstrap vs raw .mjs).
- No new dependencies.
- Can be done in < 1 hour.

### Cons

- One file outside the TypeScript compilation pipeline (no type checking
  for the worker). Mitigated by keeping it simple and stable.
- Need to manually keep the `.mjs` in sync if the WGSL shader or
  protocol changes.

### Verdict

**Try this first.** It's the fastest path and directly targets the
observed behavior difference.

---

## Route B: Chunked Multi-Spawn (Moderate Effort, No New Dependencies)

### Idea

If the crash is truly related to buffer size (even in `.mjs`), break
large ranges into sub-ranges that each stay under the 10M / 5-segment
limit. Spawn one worker per chunk, then merge results in the parent.

### Implementation

1. In `gpu-sieve.ts`, if `numSegments > MAX_SAFE_SEGMENTS` (e.g. 5),
   split the range into chunks of `MAX_SAFE_SEGMENTS * SEGMENT_BITS * 2`
   odd numbers each.
2. Spawn workers in parallel (or sequentially if GPU contention is an
   issue — only one GPU, so sequential is safer).
3. Each worker returns its sieve bitfield for its sub-range.
4. Parent decodes each chunk's primes and merges into a single sorted
   array.
5. Handle edge cases: small primes for each sub-range must be
   recomputed from `sqrt(sub_end)`, and the sieve for each chunk must
   use the correct `startOdd`.

### Pros

- Works within the known-safe 5-segment limit.
- No new dependencies, no build changes.
- Compositional — each chunk is independently verifiable.

### Cons

- Each worker spawn has ~230ms GPU init overhead. A 1B range (477
  segments) would need ~96 spawns × 230ms = ~22 seconds of init
  overhead alone. This eliminates any GPU speed advantage over CPU for
  large ranges.
- More complex merge logic in the parent.
- Sequential spawns can't overlap GPU work (only one device).

### Verdict

**Viable fallback if Route A fails.** Acceptable for moderate ranges
(50M–100M) but the per-spawn overhead makes it impractical for 500M+.

---

## Route C: Replace dawn.node with wgpu-native N-API Addon (High Effort, Best Long-Term)

### Idea

Build a custom N-API native addon that links against `wgpu-native`
(Rust/C) instead of dawn.node. This gives us full control over the
WebGPU implementation, avoids dawn.node's known bugs, and provides a
stable, well-maintained backend.

### Implementation

1. Set up a Rust project with `napi-rs` (or C with `node-addon-api`)
   that links `wgpu-native`.
2. Expose a minimal API surface to Node.js:
   - `gpuSieve(startOdd: number, endOdd: number, numSegments: number): Buffer`
   - Internally: init adapter/device, create buffers, compile WGSL
     shader, dispatch, readback, return bitfield.
3. The WGSL shader code is identical — both dawn and wgpu-native
   support the same WGSL spec.
4. Publish as an optional native dependency
   (`@fast-prime-search/gpu-native`), with the pure-JS dawn.node path
   as fallback.
5. Use `prebuild` / `prebuildify` for prebuilt binaries on
   Linux/macOS/Windows.

### Pros

- `wgpu-native` is actively maintained by the gfx-rs team (Mozilla
  lineage). Much larger community than dawn.node.
- No spawn-per-call needed — wgpu-native handles multiple
  submissions correctly in a single process.
- No buffer size limitations (wgpu allocates directly through Vulkan).
- Full control over GPU lifecycle, error handling, profiling.
- Best possible performance — no child process overhead, no IPC.

### Cons

- Requires Rust toolchain (or C toolchain) for building.
- Significant implementation effort (1-2 weeks).
- Cross-platform prebuilt binaries are a maintenance burden.
- Adds a native compilation dependency to the package.

### Verdict

**The right long-term solution.** Dawn.node is experimental and
undermaintained. If GPU acceleration is a core feature of
`fast-prime-search`, investing in a wgpu-native addon pays off. But
only pursue this after Route A has been validated.

---

## Recommended Order

```
Route A (.mjs worker)     →  try immediately, < 1 hour
Route B (chunked spawns)  →  fallback if A still crashes
Route C (wgpu-native)     →  long-term, if GPU perf is a priority
```

Route A should be attempted first because it directly explains the
observed behavior: the same code works in `.mjs` but crashes when
compiled. If the `.mjs` worker handles 50M+, the problem is solved
with minimal effort and we can defer Route C until dawn.node proves
to be a broader liability.
