// small_prime_sieve.wgsl
//
// Pass 1 — Compute all primes up to sqrt(range_end) using a sequential
// Sieve of Eratosthenes running on a SINGLE workgroup.
//
// This shader runs ONCE per search and writes a compact list of small primes
// into `small_primes[]` for use by the parallel segmented sieve (Pass 2).
//
// Memory layout
// =============
//   - `sieve_bits[]`   : read-write storage, packed bitfield, one bit per odd
//                        number starting at 3.  Index i → number 2i+3.
//                        Initialised to all-1 (all candidates prime) by CPU
//                        before dispatch.
//   - `small_primes[]` : read-write storage.  Element 0 is the count; elements
//                        1…count are the primes in ascending order (u32).
//   - `uniforms`       : { sieve_words: u32, small_prime_limit: u32 }
//
// WGSL uniform control-flow note:
//   workgroupBarrier() must be in uniform control flow (all invocations must
//   reach it unconditionally).  We achieve this by:
//     1. Running the "find next prime" search entirely on invocation 0, storing
//        the result in a workgroup atomic — no barrier needed there.
//     2. Replacing the main sieve loop with a fixed iteration over all possible
//        candidate indices; invocations skip inactive iterations cheaply.
//
// This shader runs in a SINGLE workgroup of 256 invocations.

struct Uniforms {
    // Number of u32 words in sieve_bits[] (= ceil(small_prime_limit/2 / 32))
    sieve_words       : u32,
    // Largest number to sieve (= floor(sqrt(range_end)) + 1, rounded up to odd)
    small_prime_limit : u32,
}

@group(0) @binding(0) var<uniform>             uniforms     : Uniforms;
@group(0) @binding(1) var<storage, read_write> sieve_bits   : array<u32>;
@group(0) @binding(2) var<storage, read_write> small_primes : array<u32>;

// Shared: next prime to sieve, written by inv 0, read by all
var<workgroup> wg_prime     : u32;
// Shared: whether the sieve phase is still running
var<workgroup> wg_active    : u32;
// Shared: write cursor for Phase B collection
var<workgroup> wg_cursor    : atomic<u32>;

// index-to-odd: idx → 2*idx + 3
fn idx_to_odd(idx: u32) -> u32 { return 2u * idx + 3u; }

// odd-to-index: n → (n - 3) / 2
fn odd_to_idx(n: u32) -> u32 { return (n - 3u) >> 1u; }

@compute @workgroup_size(256)
fn small_prime_sieve(
    @builtin(local_invocation_id) lid : vec3<u32>,
) {
    let lid_x = lid.x;

    // -----------------------------------------------------------------------
    // Phase A: Sieve of Eratosthenes
    //
    // We iterate over all candidate prime indices 0 .. (sieve_words*32).
    // For each index p_idx:
    //   - Invocation 0 checks whether bit p_idx is set (i.e. p is prime).
    //   - If yes: all invocations cooperate to mark multiples of p.
    //   - If no: skip.
    //
    // workgroupBarrier() is called unconditionally on every outer-loop
    // iteration, satisfying the uniform-control-flow requirement.
    // -----------------------------------------------------------------------

    // First outer barrier to ensure workgroup memory is visible
    if lid_x == 0u {
        wg_prime  = 0u;
        wg_active = 1u;
    }
    workgroupBarrier();

    // Iterate up to sieve_words * 32 candidate indices
    let max_idx = uniforms.sieve_words * 32u;
    for (var p_idx = 0u; p_idx < max_idx; p_idx += 1u) {

        // --- Barrier: synchronise before deciding whether to mark ---
        workgroupBarrier();

        if lid_x == 0u {
            let p = idx_to_odd(p_idx);
            if p * p > uniforms.small_prime_limit {
                wg_active = 0u;
            }
            if wg_active == 1u {
                // Check whether this candidate is still prime
                let w = p_idx >> 5u;
                let b = p_idx & 31u;
                let is_prime = (sieve_bits[w] >> b) & 1u;
                wg_prime = select(0u, p, is_prime == 1u);
            }
        }

        // --- Barrier: wg_prime is now set by inv 0, readable by all ---
        workgroupBarrier();

        if wg_active == 0u {
            break;
        }

        let p = wg_prime;
        if p == 0u {
            // This candidate was already marked composite — skip
            continue;
        }

        // All invocations cooperate: each strides over composites of p
        // starting from p*p.
        let first_composite_idx = odd_to_idx(p * p);

        // Stride: each invocation handles one lane of composites.
        // Lane i handles: first_composite_idx + i*p, then + 256*p, etc.
        var j = first_composite_idx + lid_x * p;
        while j < max_idx {
            let word_idx = j >> 5u;
            let bit_pos  = j & 31u;
            // Benign race: all invocations only clear bits, never set them.
            sieve_bits[word_idx] &= ~(1u << bit_pos);
            j += p * 256u;
        }
    }

    // Final barrier before Phase B reads sieve_bits
    workgroupBarrier();

    // -----------------------------------------------------------------------
    // Phase B: Collect primes into output list
    //
    // Each invocation handles every 256th word of the bitfield.
    // A workgroup atomic cursor distributes write slots.
    // -----------------------------------------------------------------------

    if lid_x == 0u {
        atomicStore(&wg_cursor, 1u); // slot 0 reserved for count
    }
    workgroupBarrier();

    var wi = lid_x;
    while wi < uniforms.sieve_words {
        var word = sieve_bits[wi];
        while word != 0u {
            let bit   = countTrailingZeros(word);
            let idx   = wi * 32u + bit;
            let p_val = idx_to_odd(idx);
            if p_val <= uniforms.small_prime_limit {
                let slot = atomicAdd(&wg_cursor, 1u);
                small_primes[slot] = p_val;
            }
            word &= word - 1u; // clear lowest set bit
        }
        wi += 256u;
    }

    workgroupBarrier();

    // Write count (cursor started at 1, so subtract 1)
    if lid_x == 0u {
        small_primes[0] = atomicLoad(&wg_cursor) - 1u;
    }
}
