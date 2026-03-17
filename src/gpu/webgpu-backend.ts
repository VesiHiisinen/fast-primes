/**
 * WebGPU backend initialisation.
 *
 * Installs the dawn.node globals into globalThis, requests an adapter and
 * device, and returns a descriptor of what the GPU can do so callers can
 * tune dispatch parameters accordingly.
 */

import { create, globals } from 'webgpu';

/** Information about the initialised GPU. */
export interface GPUDeviceInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  /** Maximum number of invocations per workgroup dimension X (≥256 guaranteed). */
  maxWorkgroupSizeX: number;
  /** Maximum total workgroup storage bytes (shared memory). */
  maxWorkgroupStorageSize: number;
  /** Maximum number of workgroups in a single dispatch per dimension X. */
  maxComputeWorkgroupsPerDimension: number;
  /** Whether the subgroups extension is available (warp-level intrinsics). */
  hasSubgroups: boolean;
  /** Whether timestamp queries are available for GPU profiling. */
  hasTimestampQuery: boolean;
}

export interface InitialisedGPU {
  device: GPUDevice;
  info: GPUDeviceInfo;
}

let cachedGPU: InitialisedGPU | null = null;

/**
 * Initialise WebGPU via dawn.node.
 *
 * Idempotent — a second call returns the already-initialised device.
 * Throws if no WebGPU adapter is available on this machine.
 */
export async function initGPU(): Promise<InitialisedGPU> {
  if (cachedGPU !== null) {
    return cachedGPU;
  }

  // Install dawn.node globals (GPUDevice, GPUBuffer, GPUBufferUsage, …)
  Object.assign(globalThis, globals);

  const gpu: GPU = await create([]);

  const adapter = await gpu.requestAdapter({
    powerPreference: 'high-performance',
  });

  if (adapter === null) {
    throw new Error(
      'No WebGPU adapter found. ' +
        'Make sure your system has a GPU and the webgpu npm package is installed.'
    );
  }

  // Collect adapter info (dawn.node uses .info, not .requestAdapterInfo)
  const adapterInfo = (adapter as unknown as { info: GPUAdapterInfo }).info;

  // Detect optional features
  const hasSubgroups = adapter.features.has('subgroups' as GPUFeatureName);
  const hasTimestampQuery = adapter.features.has('timestamp-query');

  // Request device — enable optional features when available
  const requiredFeatures: GPUFeatureName[] = [];
  if (hasSubgroups) requiredFeatures.push('subgroups' as GPUFeatureName);
  if (hasTimestampQuery) requiredFeatures.push('timestamp-query');

  const device = await adapter.requestDevice({
    requiredFeatures,
  });

  // Surface the limits we care about
  const limits = device.limits;
  const info: GPUDeviceInfo = {
    vendor: adapterInfo?.vendor ?? 'unknown',
    architecture: adapterInfo?.architecture ?? 'unknown',
    device: adapterInfo?.device ?? 'unknown',
    description: adapterInfo?.description ?? 'unknown',
    maxWorkgroupSizeX: limits.maxComputeWorkgroupSizeX,
    maxWorkgroupStorageSize: limits.maxComputeWorkgroupStorageSize,
    maxComputeWorkgroupsPerDimension: limits.maxComputeWorkgroupsPerDimension,
    hasSubgroups,
    hasTimestampQuery,
  };

  cachedGPU = { device, info };
  return cachedGPU;
}

/** Tear down the cached GPU device (call this at process exit if needed). */
export function destroyGPU(): void {
  if (cachedGPU !== null) {
    cachedGPU.device.destroy();
    cachedGPU = null;
  }
}
