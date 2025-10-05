import { LocalStorage } from "@raycast/api";
import { AudioDevice } from "./audio-device";

export enum DeviceType {
  Output = "output",
  Input = "input",
}

const OUTPUT_PRIORITY_KEY = "outputPriorityList";
const INPUT_PRIORITY_KEY = "inputPriorityList";
const OUTPUT_DEVICE_INFO_KEY = "outputDeviceInfo";
const INPUT_DEVICE_INFO_KEY = "inputDeviceInfo";
const OUTPUT_PRIORITY_DIRTY_KEY = "outputPriorityDirty";
const INPUT_PRIORITY_DIRTY_KEY = "inputPriorityDirty";

export type StoredDeviceInfo = {
  name: string;
  transportType: string;
};

export async function getOutputPriorityList(): Promise<string[]> {
  try {
    const stored = await LocalStorage.getItem<string>(OUTPUT_PRIORITY_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.log("Failed to parse output priority list, resetting:", error);
    await LocalStorage.removeItem(OUTPUT_PRIORITY_KEY);
    return [];
  }
}

export async function getInputPriorityList(): Promise<string[]> {
  try {
    const stored = await LocalStorage.getItem<string>(INPUT_PRIORITY_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.log("Failed to parse input priority list, resetting:", error);
    await LocalStorage.removeItem(INPUT_PRIORITY_KEY);
    return [];
  }
}

export async function setOutputPriorityList(priorityList: string[]): Promise<void> {
  await LocalStorage.setItem(OUTPUT_PRIORITY_KEY, JSON.stringify(priorityList));
  await setPriorityListDirty(DeviceType.Output);
}

export async function setInputPriorityList(priorityList: string[]): Promise<void> {
  await LocalStorage.setItem(INPUT_PRIORITY_KEY, JSON.stringify(priorityList));
  await setPriorityListDirty(DeviceType.Input);
}

export async function getDeviceInfo(deviceType: DeviceType): Promise<StoredDeviceInfo[]> {
  try {
    const key = deviceType === DeviceType.Output ? OUTPUT_DEVICE_INFO_KEY : INPUT_DEVICE_INFO_KEY;
    const stored = await LocalStorage.getItem<string>(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.log("Failed to parse device info, resetting:", error);
    const key = deviceType === DeviceType.Output ? OUTPUT_DEVICE_INFO_KEY : INPUT_DEVICE_INFO_KEY;
    await LocalStorage.removeItem(key);
    return [];
  }
}

export async function saveDeviceInfo(deviceInfo: StoredDeviceInfo[], deviceType: DeviceType): Promise<void> {
  const key = deviceType === DeviceType.Output ? OUTPUT_DEVICE_INFO_KEY : INPUT_DEVICE_INFO_KEY;
  await LocalStorage.setItem(key, JSON.stringify(deviceInfo));
}

export function mergeDeviceInfo(existing: StoredDeviceInfo[], current: AudioDevice[]): StoredDeviceInfo[] {
  const merged = [...existing];

  for (const device of current) {
    const existingIndex = merged.findIndex((info) => info.name === device.name);
    const deviceInfo = { name: device.name, transportType: device.transportType };

    if (existingIndex >= 0) {
      merged[existingIndex] = deviceInfo;
    } else {
      merged.push(deviceInfo);
    }
  }

  return merged;
}

export function getHighestPriorityDevice(devices: AudioDevice[], priorityList: string[]): AudioDevice | null {
  let highestPriorityDevice: AudioDevice | null = null;
  let highestPriorityRank = Infinity;

  for (const device of devices) {
    const priorityIndex = priorityList.findIndex((name) => name.toLowerCase() === device.name.toLowerCase());

    if (priorityIndex !== -1) {
      const rank = priorityIndex + 1;
      if (rank < highestPriorityRank) {
        highestPriorityRank = rank;
        highestPriorityDevice = device;
      }
    }
  }

  return highestPriorityDevice;
}

export async function isPriorityListDirty(deviceType: DeviceType): Promise<boolean> {
  const key = deviceType === DeviceType.Output ? OUTPUT_PRIORITY_DIRTY_KEY : INPUT_PRIORITY_DIRTY_KEY;
  const value = await LocalStorage.getItem<string>(key);
  return value === "true";
}

export async function setPriorityListDirty(deviceType: DeviceType): Promise<void> {
  const key = deviceType === DeviceType.Output ? OUTPUT_PRIORITY_DIRTY_KEY : INPUT_PRIORITY_DIRTY_KEY;
  await LocalStorage.setItem(key, "true");
}

export async function clearPriorityListDirty(deviceType: DeviceType): Promise<void> {
  const key = deviceType === DeviceType.Output ? OUTPUT_PRIORITY_DIRTY_KEY : INPUT_PRIORITY_DIRTY_KEY;
  await LocalStorage.removeItem(key);
}
