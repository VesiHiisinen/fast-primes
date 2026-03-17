# Development Journal

## About This Document

This is a **persistent memory** for AI coding agents working on the fast-prime-search project. It tracks progress, decisions, and context that agents need to maintain continuity across sessions.

### How to Use This Document

**As an AI Agent:**

1. **Read first**: Always check this file at the start of a session to understand current state
2. **Summarize briefly**: After completing work, add a short entry with timestamp
3. **Be specific**: Include file names, key decisions, and blockers
4. **Update context**: If assumptions change or new requirements emerge, document them

### Entry Format

```
## [YYYY-MM-DD HH:MM] - Brief Description

- What was done
- Key decisions made
- Files modified/created
- Blockers or open questions
- Next steps (if clear)
```

### Appending Entries

**Append to the END of the file** (after all existing entries). This maintains chronological order with newest at the bottom, while keeping instructions at the top for easy reference.

---

## Entries

### Template (Copy this for new entries)

```
## [YYYY-MM-DD HH:MM] -

**Status:**
**Files:**
**Decisions:**
**Blockers:**
**Next:**
```

---

## [2026-03-10 11:00] - Package Ready for Publication

**Status:** Complete - Package fully prepared for GitHub and NPM publication
**Files:**

- `package.json` - Updated with author "Ville Vettenranta"
- `LICENSE` - Copyright 2026 Ville Vettenranta
- `README.md` - Comprehensive documentation with real benchmarks
- `CHANGELOG.md` - Release notes updated to 2026
- `src/index.ts` - Main library with 16-thread hyperthreading support
- `src/worker.ts` - Worker thread for prime computation
- `src/cli.ts` - Command-line interface
- `src/types.ts` - TypeScript type definitions
- `src/index.test.ts` - Comprehensive test suite
- `src/benchmark.ts` - Performance benchmarking suite
- `.github/workflows/` - CI/CD configuration
- `examples/` - Usage examples (basic, api, cryptography)
- `CONTRIBUTING.md` - Contribution guidelines
- `SECURITY.md` - Security policy
- `AGENTS.md` - Development guidelines for AI agents
- `GITHUB_SETUP.md` - Instructions for creating GitHub repository

**Context:**

- User had existing prime search implementation in TypeScript
- Architecture uses one-time worker spawning (optimal for performance)
- Uses 6k±1 wheel optimization for primality testing
- Supports up to 16 threads (hyperthreading on Intel i7-11800H)

**Decisions:**

- Refactored from CLI-only to proper library with both programmatic API and CLI
- Used real name (Ville Vettenranta) for publication - code quality justifies it
- Updated all copyright dates from 2024 to 2026
- Fixed worker data passing issue (workerData must include `{ range: {...} }` structure)
- Optimized CPU detection to use all logical threads (16) for maximum performance
- Benchmarks run with `showProgress: false` (silent mode) for accurate measurements

**Performance Results (Intel i7-11800H, 16 threads):**

- 1-1M range: 0.24s, 19.46M primes/min
- 1-10M range: 0.35s, 112.64M primes/min
- 1-100M range: 4.11s, 84.19M primes/min (5.52x speedup vs single thread)

**Blockers:** None
**Next:**

1. Create GitHub repository at https://github.com/new
2. Add remote and push code: `git remote add origin https://github.com/vettis/fast-prime-search.git && git push -u origin main`
3. Add NPM_TOKEN secret in GitHub Settings
4. Create release v1.0.0 to trigger NPM publish

---

## [2026-03-10 09:37] - Initial Session

**Status:** Started project transformation to NPM package
**Files:** Reviewed existing `searchPrimes.ts` and `worker.ts`

**Context:**

- User wants to publish prime search as NPM package
- Existing code used optimal architecture (single thread spawn, not dynamic)
- User concerned about AI advice to use dynamic thread launching (which would be slower)
- Confirmed current architecture is correct: divide range by threads once, spawn all workers in parallel

**Decisions:**

- Package name: `fast-prime-search` (available on NPM)
- Target: Professional-grade open source package
- Features: TypeScript types, CLI tool, programmatic API, benchmarks, tests
- Author: Ville Vettenranta (real name, since code quality is publishable)

**Blockers:** None
**Next:** Create project structure and configuration files

---

## [2026-03-15 13:30] - GPU Sieve: stdout drain fix, 10M working, 50M SIGSEGV

**Status:** GPU backend works for ranges up to 10M. Ranges >10M hit upstream dawn.node SIGSEGV.

**Files:**

- `src/gpu/gpu-sieve-worker.ts` — Fixed two critical bugs:
  1. **stdout drain**: `process.stdout.write(raw)` is async for large buffers. Child was calling `process.exit(0)` before pipe fully flushed, so parent received truncated data (146176 of 655360 bytes for 10M range). Fix: `device.destroy()` before write, then `process.stdout.end(raw, callback)` with await before exit.
  2. **device teardown crash**: dawn.node crashes during process exit if GPU device is still alive (futex/mutex corruption in fence tracking). Fix: call `device.destroy()` explicitly before writing stdout, so no GPU cleanup runs during Node.js teardown.
- `src/gpu/gpu-sieve.ts` — orchestrator, no changes this session
- `src/gpu/webgpu-backend.ts` — GPU init, no changes this session
- `src/index.ts` — backend:'auto'|'gpu'|'cpu' dispatch
- `src/types.ts` — SearchResult.backend, SearchResult.gpuDevice
- `.gitignore` — added gpu debug script patterns

**Discoveries:**

- **Root cause of 10M bug was NOT GPU/staging/buffer size** — it was Node.js stdout pipe not draining before process.exit(). The staging buffer readback works fine for 640KB+ in isolation.
- **50M range (24 segments, 3MB sieve+staging buffers) causes SIGSEGV** during `device.createBindGroup()`. All 4 individual buffer creates succeed, but the bind group call segfaults. This is a dawn.node v0.3.8 upstream bug — no user-side workaround found.
- **Tested in isolation**: same 24 segments, same shader, same dispatch pattern works perfectly when run in a standalone .mjs script (gpu-50m-isolate.mjs). The crash only occurs in the compiled worker process. Cause unknown — possibly a V8/dawn interaction specific to the compiled ESM worker bootstrap path.
- **v0.3.8 is the latest webgpu npm release** (no newer version available as of 2026-03-15).

**Decisions:**

- Committed working implementation with 10M limit documented
- Will draft a 3-route plan for breaking past the 50M limitation
- Debug .mjs scripts gitignored but kept locally for future investigation

**Verified:**

- All 20 vitest tests pass (CPU backend)
- GPU: 0-100 (25), 0-1K (168), 0-10K (1229), 0-100K (9592), 0-1M (78498), 0-10M (664579) — all correct
- GPU device: nvidia-geforce-rtx-3060, ~260-320ms per call (dominated by GPU init overhead)

**Commits:**

- `b1acbb8` feat(gpu): add WebGPU compute shader prime sieve backend
- `5392f83` chore: gitignore GPU debug/test scripts

**Next:**

- Draft plan document with 3 routes past the 50M limitation
- Investigate whether chunked worker calls (multiple child spawns for sub-ranges) can work as an immediate workaround
- Monitor dawn-gpu/node-webgpu for new releases

---
