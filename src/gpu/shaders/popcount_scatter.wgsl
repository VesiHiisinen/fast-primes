// popcount_scatter.wgsl
//
// Pass 3 — Count primes per segment (popcount) then scatter primes to output.
//
// This shader runs in two sub-dispatches:
//
//   Sub-dispatch A  (entry: count_pass)
//     One workgroup per segment.  Each workgroup reads its sieve word slice,
//     counts set bits with countOneBits(), accumulates into prime_counts[seg].
//
//   Sub-dispatch B  (entry: scatter_pass)
//     Runs after a CPU-side exclusive prefix sum has filled prime_offsets[].
//     One workgroup per segment.  Each workgroup iterates its set bits,
//     decodes each to an actual u64 prime value, and scatters it to the
//     correct slot in result_primes[].
//
// Buffer layout
// =============
//   binding 0 : Uniforms         (uniform)
//   binding 1 : sieve_output[]   (storage, read)   — filled by Pass 2
//   binding 2 : prime_counts[]   (storage, read_write, atomic)
//   binding 3 : prime_offsets[]  (storage, read)   — filled by CPU prefix sum
//   binding 4 : result_primes[]  (storage, read_write)  — u32 pairs (lo, hi)

override SEGMENT_BITS      : u32 = 1048576u;
override WORDS_PER_SEGMENT : u32 = 32768u;

struct Uniforms {
    range_start_odd  : u32,
    range_end_odd    : u32,
    num_small_primes : u32,
    num_segments     : u32,
}

@group(0) @binding(0) var<uniform>             uniforms       : Uniforms;
@group(0) @binding(1) var<storage, read>       sieve_output   : array<u32>;
@group(0) @binding(2) var<storage, read_write> prime_counts   : array<atomic<u32>>;
@group(0) @binding(3) var<storage, read>       prime_offsets  : array<u32>;
@group(0) @binding(4) var<storage, read_write> result_primes  : array<u32>;

// ---------------------------------------------------------------------------
// Sub-dispatch A: count set bits per segment
// ---------------------------------------------------------------------------
@compute @workgroup_size(256)
fn count_pass(
    @builtin(workgroup_id)        wgid : vec3<u32>,
    @builtin(local_invocation_id) lid  : vec3<u32>,
) {
    let seg       = wgid.x;
    let lid_x     = lid.x;
    let word_base = seg * WORDS_PER_SEGMENT;

    var local_count: u32 = 0u;
    for (var w = lid_x; w < WORDS_PER_SEGMENT; w += 256u) {
        local_count += countOneBits(sieve_output[word_base + w]);
    }

    // Reduce within workgroup using atomicAdd on a single per-segment slot.
    // (A proper warp-level reduction is left for Phase 2 optimisation.)
    atomicAdd(&prime_counts[seg], local_count);
}

// ---------------------------------------------------------------------------
// Sub-dispatch B: scatter primes into result buffer
// ---------------------------------------------------------------------------
//
// Each prime is stored as a pair of u32 words (lo, hi) representing a u64.
// This avoids the WGSL limitation that u64 is not a native scalar type.
// The CPU reassembles: value = u64(hi) << 32 | u64(lo).
@compute @workgroup_size(256)
fn scatter_pass(
    @builtin(workgroup_id)        wgid : vec3<u32>,
    @builtin(local_invocation_id) lid  : vec3<u32>,
) {
    let seg        = wgid.x;
    let lid_x      = lid.x;
    let word_base  = seg * WORDS_PER_SEGMENT;
    let seg_offset = prime_offsets[seg]; // base index in result_primes[]

    // Each invocation collects its own write cursor (private, not shared)
    // by first counting how many primes precede its words, then writing.
    //
    // We do a two-phase approach:
    //  Phase B1: count primes in words [0 .. lid_x*stride) → local_pre_count
    //  Phase B2: iterate words [lid_x*stride .. (lid_x+1)*stride) → scatter

    // Stride-based assignment: invocation i handles words i, i+256, i+512, …
    // We need the write offset for invocation i's first prime.
    // Compute prefix across the 256-stride slices using a warp-sequential scan.

    // For each invocation, count how many primes are in words with index < lid_x
    // (i.e., words handled by invocations 0 … lid_x-1 in a round-robin sense).
    // This is O(WORDS_PER_SEGMENT/256 × 256) = O(WORDS_PER_SEGMENT) per invocation
    // which would be too slow.  Instead, we accept that invocations may write
    // out-of-order within a segment (the CPU sorts or the output is segment-sorted
    // but within a segment unordered — acceptable since we sort globally anyway).
    //
    // Simple approach: use a shared atomic write cursor per segment.
    // Each invocation atomicAdds the count of its primes, gets a slot base.

    var local_offset: u32 = 0u;

    // Count primes in this invocation's words to reserve a contiguous block
    var my_count: u32 = 0u;
    for (var w = lid_x; w < WORDS_PER_SEGMENT; w += 256u) {
        my_count += countOneBits(sieve_output[word_base + w]);
    }

    // Reserve slots via the (already-computed) prime_counts as an atomic cursor.
    // We repurpose prime_counts[seg] as a write cursor in this sub-dispatch.
    // The CPU must zero prime_counts[] again before dispatching scatter_pass,
    // or we use a separate cursor buffer.  Here we use prime_counts itself
    // (the orchestrator resets it to 0 before scatter dispatch).
    let slot_base = atomicAdd(&prime_counts[seg], my_count);
    local_offset = seg_offset + slot_base;

    // Scatter: iterate words, decode set bits, write u64 prime as (lo, hi) pair
    var write_idx = local_offset;
    for (var w = lid_x; w < WORDS_PER_SEGMENT; w += 256u) {
        var word = sieve_output[word_base + w];
        while word != 0u {
            let bit    = countTrailingZeros(word);
            // Candidate index in the range (0-based odd index from range_start_odd)
            let idx    = seg * SEGMENT_BITS + w * 32u + bit;
            // Actual prime value: range_start_odd + idx * 2
            // Use 64-bit arithmetic emulated with two u32
            let lo32   = uniforms.range_start_odd + idx * 2u;
            // Carry: if lo32 overflowed (i.e. the multiplication alone)
            // For simplicity, store as two u32 (hi is always 0 for ≤ 2^32 ranges)
            // TODO Phase 2: extend to u64 via (hi, lo) pair for > 4G ranges
            result_primes[write_idx * 2u]       = lo32;
            result_primes[write_idx * 2u + 1u]  = 0u; // hi word
            write_idx += 1u;
            word &= word - 1u; // clear lowest set bit
        }
    }
}
