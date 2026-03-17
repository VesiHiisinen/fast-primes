// segment_sieve.wgsl
//
// Pass 2 — Parallel segmented Sieve of Eratosthenes.
//
// Kernel redesign to avoid GPU TDR timeout:
//   OLD: one workgroup per segment, each invocation handles one small prime
//        → invocation 0 (p=3) does SEGMENT_BITS/3 iterations — hits TDR
//   NEW: dispatch split into two phases:
//        Phase A: one workgroup per segment, initialise bits to all-1
//        Phase B: one workgroup per (segment × small_prime), each invocation
//                 marks every (workgroup_size * p)-th composite in its stripe
//                 → max iterations = SEGMENT_BITS / (p × 256) ≈ 16K/256 ≈ 64
//
// Buffer layout (set by the orchestrator in gpu-sieve.ts)
// =======================================================
//   binding 0 : Uniforms          (uniform)
//   binding 1 : small_primes[]    (storage, read)
//   binding 2 : sieve_output[]    (storage, read_write)
//
// Segment i covers odd indices [i*SEGMENT_BITS, (i+1)*SEGMENT_BITS).
// Odd index k maps to number: range_start_odd + k*2.
//
// SEGMENT_BITS and WORDS_PER_SEGMENT are shader override constants.
//
// --- Dispatch for init pass (entry: sieve_init) ---
//   dispatchWorkgroups(num_segments)
//   workgroup_id.x = segment index
//
// --- Dispatch for mark pass (entry: sieve_mark) ---
//   dispatchWorkgroups(num_segments, num_small_primes)
//   workgroup_id.x = segment index
//   workgroup_id.y = prime index (0-based into small_primes[1..])

override SEGMENT_BITS    : u32 = 1048576u; // 2^20 odd candidates per segment
override WORDS_PER_SEGMENT : u32 = 32768u; // SEGMENT_BITS / 32

struct Uniforms {
    // First odd number in the entire search range (≥ 3).
    range_start_odd   : u32,
    // Last odd number in the search range (inclusive).
    range_end_odd     : u32,
    // Number of small primes in small_primes[1..count+1].
    num_small_primes  : u32,
    // Total number of segments dispatched.
    num_segments      : u32,
}

@group(0) @binding(0) var<uniform>             uniforms     : Uniforms;
@group(0) @binding(1) var<storage, read>       small_primes : array<u32>;
@group(0) @binding(2) var<storage, read_write> sieve_output : array<atomic<u32>>;

// ---------------------------------------------------------------------------
// Phase A — initialise every segment word to all-ones (all candidates prime)
// ---------------------------------------------------------------------------
@compute @workgroup_size(256)
fn sieve_init(
    @builtin(workgroup_id)        wgid : vec3<u32>,
    @builtin(local_invocation_id) lid  : vec3<u32>,
) {
    let seg          = wgid.x;
    let lid_x        = lid.x;
    let seg_word_base = seg * WORDS_PER_SEGMENT;

    for (var w = lid_x; w < WORDS_PER_SEGMENT; w += 256u) {
        atomicStore(&sieve_output[seg_word_base + w], 0xFFFFFFFFu);
    }
}

// ---------------------------------------------------------------------------
// Phase B — mark composites.
//
// Dispatch: dispatchWorkgroups(num_segments, num_small_primes)
//   workgroup_id.x = segment index
//   workgroup_id.y = prime index (0-based; prime = small_primes[y + 1])
//
// Each invocation i handles composites at positions:
//   first_mult_idx + i*p, first_mult_idx + (i + WG)*p, first_mult_idx + (i + 2*WG)*p, …
//   where WG = 256 (workgroup size).
// Maximum iterations per invocation = ceil(SEGMENT_BITS / (p * 256)).
//   For SEGMENT_BITS=1<<20, p=3: 1048576 / (3*256) = 1365 iterations — well under TDR.
// ---------------------------------------------------------------------------
@compute @workgroup_size(256)
fn sieve_mark(
    @builtin(workgroup_id)        wgid : vec3<u32>,
    @builtin(local_invocation_id) lid  : vec3<u32>,
) {
    let seg      = wgid.x;
    let prime_y  = wgid.y;   // 0-based prime index
    let lid_x    = lid.x;

    // Guard: prime_y must be < num_small_primes (in case of over-dispatch)
    if prime_y >= uniforms.num_small_primes { return; }

    let p = small_primes[prime_y + 1u];

    let seg_start_idx  = seg * SEGMENT_BITS;
    let seg_word_base  = seg * WORDS_PER_SEGMENT;

    // Actual first odd number in this segment
    let seg_first_num  = uniforms.range_start_odd + seg_start_idx * 2u;

    // First multiple of p that is ≥ seg_first_num and odd
    var first_mult = ((seg_first_num + p - 1u) / p) * p;
    if (first_mult & 1u) == 0u {
        first_mult += p;
    }
    // Don't start before p² (all smaller composites already sieved)
    if first_mult < p * p {
        first_mult = p * p;
        if (first_mult & 1u) == 0u {
            first_mult += p;
        }
    }

    // If first multiple is before range_start_odd, nothing to do in this segment
    if first_mult < uniforms.range_start_odd { return; }

    // Index of first composite in the whole range
    let first_idx_in_range = (first_mult - uniforms.range_start_odd) >> 1u;

    // Adjust to first composite owned by this invocation within this segment:
    //   each invocation i handles positions: first_idx_in_range + i*p, then + WG*p, …
    // So invocation lid_x starts at first_idx_in_range + lid_x * p.
    let stride = 256u * p;  // distance between consecutive hits for the same invocation

    // idx_in_range for this invocation's first hit
    var idx_in_range = first_idx_in_range + lid_x * p;

    let seg_end_idx = seg_start_idx + SEGMENT_BITS;

    while idx_in_range < seg_end_idx {
        let idx_in_seg = idx_in_range - seg_start_idx;
        let word_idx   = idx_in_seg >> 5u;
        let bit_pos    = idx_in_seg & 31u;
        atomicAnd(&sieve_output[seg_word_base + word_idx], ~(1u << bit_pos));
        idx_in_range += stride;
    }
}
