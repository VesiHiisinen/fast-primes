/**
 * Typed GPU buffer helpers.
 *
 * Thin wrappers around GPUDevice.createBuffer / mapAsync that keep
 * usage flags, size arithmetic, and upload/download boilerplate in one place.
 */

// ---------------------------------------------------------------------------
// Creation helpers
// ---------------------------------------------------------------------------

/**
 * Create a GPU-side storage buffer (STORAGE | COPY_SRC | COPY_DST).
 * This is the general-purpose read/write buffer used for sieve state,
 * prime lists, and intermediate results.
 */
export function createStorageBuffer(
  device: GPUDevice,
  sizeBytes: number,
  label?: string
): GPUBuffer {
  return device.createBuffer({
    label,
    size: alignTo4(sizeBytes),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
}

/**
 * Create a GPU-side storage buffer and upload `data` into it immediately.
 */
export function createStorageBufferWithData(
  device: GPUDevice,
  data: Uint32Array | BigUint64Array,
  label?: string
): GPUBuffer {
  const buf = device.createBuffer({
    label,
    size: alignTo4(data.byteLength),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  if (data instanceof Uint32Array) {
    new Uint32Array(buf.getMappedRange()).set(data);
  } else {
    new BigUint64Array(buf.getMappedRange()).set(data);
  }
  buf.unmap();
  return buf;
}

/**
 * Create a uniform buffer (read-only on GPU, written from CPU).
 * Used to pass per-dispatch parameters (segment count, range bounds, etc.).
 */
export function createUniformBuffer(
  device: GPUDevice,
  sizeBytes: number,
  label?: string
): GPUBuffer {
  return device.createBuffer({
    label,
    size: alignTo256(sizeBytes), // uniform buffers require 256-byte alignment
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

/**
 * Create a staging buffer used to read results back to the CPU.
 * MAP_READ | COPY_DST — not visible to the GPU compute pipeline.
 */
export function createReadbackBuffer(
  device: GPUDevice,
  sizeBytes: number,
  label?: string
): GPUBuffer {
  return device.createBuffer({
    label,
    size: alignTo4(sizeBytes),
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
}

// ---------------------------------------------------------------------------
// Upload / download
// ---------------------------------------------------------------------------

/** Write a Uint32Array into a GPU buffer via the queue (no mapping needed). */
export function writeU32Buffer(
  device: GPUDevice,
  buf: GPUBuffer,
  data: Uint32Array,
  byteOffset = 0
): void {
  device.queue.writeBuffer(buf, byteOffset, data.buffer, data.byteOffset, data.byteLength);
}

/** Write a BigUint64Array into a GPU buffer via the queue. */
export function writeU64Buffer(
  device: GPUDevice,
  buf: GPUBuffer,
  data: BigUint64Array,
  byteOffset = 0
): void {
  device.queue.writeBuffer(buf, byteOffset, data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Copy `srcBytes` from a storage buffer to a staging buffer, then map and
 * return a copy as a Uint32Array.  The staging buffer is destroyed after read.
 */
export async function readbackU32(
  device: GPUDevice,
  src: GPUBuffer,
  srcByteOffset: number,
  srcBytes: number
): Promise<Uint32Array> {
  const staging = createReadbackBuffer(device, srcBytes, 'readback-u32');
  const enc = device.createCommandEncoder({ label: 'readback-encoder' });
  enc.copyBufferToBuffer(src, srcByteOffset, staging, 0, srcBytes);
  device.queue.submit([enc.finish()]);

  await staging.mapAsync(GPUMapMode.READ);
  const copy = new Uint32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return copy;
}

/**
 * Copy from a storage buffer and return a BigUint64Array.
 */
export async function readbackU64(
  device: GPUDevice,
  src: GPUBuffer,
  srcByteOffset: number,
  srcBytes: number
): Promise<BigUint64Array> {
  const staging = createReadbackBuffer(device, srcBytes, 'readback-u64');
  const enc = device.createCommandEncoder({ label: 'readback-encoder-u64' });
  enc.copyBufferToBuffer(src, srcByteOffset, staging, 0, srcBytes);
  device.queue.submit([enc.finish()]);

  await staging.mapAsync(GPUMapMode.READ);
  const copy = new BigUint64Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return copy;
}

// ---------------------------------------------------------------------------
// Alignment utilities
// ---------------------------------------------------------------------------

function alignTo4(n: number): number {
  return (n + 3) & ~3;
}

function alignTo256(n: number): number {
  return (n + 255) & ~255;
}
