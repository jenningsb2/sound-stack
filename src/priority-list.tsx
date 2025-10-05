import { Action, ActionPanel, Color, Icon, Keyboard, List, showToast, Toast, getPreferenceValues } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState, useEffect } from "react";
import {
  getInputDevices,
  getOutputDevices,
  getDefaultInputDevice,
  getDefaultOutputDevice,
  TransportType,
  setDefaultOutputDevice,
  setDefaultInputDevice,
  setDefaultSystemDevice,
  AudioDevice,
} from "./audio-device";
import {
  getOutputPriorityList,
  getInputPriorityList,
  setOutputPriorityList,
  setInputPriorityList,
  getDeviceInfo,
  saveDeviceInfo,
  mergeDeviceInfo,
  DeviceType,
} from "./priority-utils";

// AudioDevice extended with UI state for priority list display
type DeviceWithPriority = AudioDevice & {
  priorityRank: number;
  isAvailable: boolean;
  isCurrent: boolean;
};

interface Preferences {
  enableAutoSwitch: boolean;
  systemOutput: boolean;
}

export default function ListDevices() {
  const preferences = getPreferenceValues<Preferences>();

  // Local state for priority lists to enable immediate updates
  const [localOutputPriorityList, setLocalOutputPriorityList] = useState<string[]>([]);
  const [localInputPriorityList, setLocalInputPriorityList] = useState<string[]>([]);

  const { data: deviceData, isLoading } = usePromise(async () => {
    const [outputDevices, inputDevices, currentOutputDevice, currentInputDevice] = await Promise.all([
      getOutputDevices(),
      getInputDevices(),
      getDefaultOutputDevice(),
      getDefaultInputDevice(),
    ]);

    // Get existing priority lists (don't auto-add missing devices here)
    let [outputPriorityList, inputPriorityList] = await Promise.all([getOutputPriorityList(), getInputPriorityList()]);

    // Get stored device info for transport types of disconnected devices
    const [outputDeviceInfo, inputDeviceInfo] = await Promise.all([
      getDeviceInfo(DeviceType.Output),
      getDeviceInfo(DeviceType.Input),
    ]);

    // Merge and save device info
    await Promise.all([
      saveDeviceInfo(mergeDeviceInfo(outputDeviceInfo, outputDevices), DeviceType.Output),
      saveDeviceInfo(mergeDeviceInfo(inputDeviceInfo, inputDevices), DeviceType.Input),
    ]);

    // Auto-initialize priority lists if empty - rank all available devices with current active device as #1
    if (outputPriorityList.length === 0 && outputDevices.length > 0) {
      outputPriorityList = currentOutputDevice
        ? [
            currentOutputDevice.name,
            ...outputDevices.filter((d) => d.name !== currentOutputDevice.name).map((d) => d.name),
          ]
        : outputDevices.map((d) => d.name);
      await setOutputPriorityList(outputPriorityList);
    }

    if (inputPriorityList.length === 0 && inputDevices.length > 0) {
      inputPriorityList = currentInputDevice
        ? [
            currentInputDevice.name,
            ...inputDevices.filter((d) => d.name !== currentInputDevice.name).map((d) => d.name),
          ]
        : inputDevices.map((d) => d.name);
      await setInputPriorityList(inputPriorityList);
    }

    // Create full device lists including unavailable devices from priority lists
    const createFullDeviceList = (
      availableDevices: AudioDevice[],
      priorityList: string[],
      deviceType: DeviceType,
      currentDevice: AudioDevice,
    ): DeviceWithPriority[] => {
      const devices: DeviceWithPriority[] = [];
      const storedDeviceInfo = deviceType === DeviceType.Output ? outputDeviceInfo : inputDeviceInfo;

      // Add all devices from priority list (available or not)
      priorityList.forEach((deviceName, index) => {
        const availableDevice = availableDevices.find((d) => d.name.toLowerCase() === deviceName.toLowerCase());

        if (availableDevice) {
          // Device is currently available
          devices.push({
            ...availableDevice,
            priorityRank: index + 1,
            isAvailable: true,
            isCurrent: availableDevice.uid === currentDevice.uid,
          });
        } else {
          // Device is in priority list but not currently available - use stored transport type
          const storedInfo = storedDeviceInfo.find((info) => info.name.toLowerCase() === deviceName.toLowerCase());
          devices.push({
            id: "",
            uid: `unavailable-${deviceName}`,
            name: deviceName,
            transportType: (storedInfo?.transportType as TransportType) || TransportType.Unknown,
            isInput: deviceType === DeviceType.Input,
            isOutput: deviceType === DeviceType.Output,
            priorityRank: index + 1,
            isAvailable: false,
            isCurrent: false,
          });
        }
      });

      // All available devices should already be in the priority list at this point
      // Add any remaining available devices that might have been missed
      availableDevices.forEach((device) => {
        const alreadyIncluded = devices.some((d) => d.name.toLowerCase() === device.name.toLowerCase());
        if (!alreadyIncluded) {
          // Find the rank from the priority list
          const rankIndex = priorityList.findIndex((name) => name.toLowerCase() === device.name.toLowerCase());
          devices.push({
            ...device,
            priorityRank: rankIndex >= 0 ? rankIndex + 1 : priorityList.length + 1,
            isAvailable: true,
            isCurrent: device.uid === currentDevice.uid,
          });
        }
      });

      return devices;
    };

    // Add any new devices to priority lists before creating device lists
    const newOutputDevices = outputDevices.filter(
      (device) => !outputPriorityList.some((name) => name.toLowerCase() === device.name.toLowerCase()),
    );
    if (newOutputDevices.length > 0) {
      outputPriorityList = [...outputPriorityList, ...newOutputDevices.map((d) => d.name)];
      await setOutputPriorityList(outputPriorityList);
    }

    const newInputDevices = inputDevices.filter(
      (device) => !inputPriorityList.some((name) => name.toLowerCase() === device.name.toLowerCase()),
    );
    if (newInputDevices.length > 0) {
      inputPriorityList = [...inputPriorityList, ...newInputDevices.map((d) => d.name)];
      await setInputPriorityList(inputPriorityList);
    }

    const processedOutputDevices = createFullDeviceList(
      outputDevices,
      outputPriorityList,
      DeviceType.Output,
      currentOutputDevice,
    );
    const processedInputDevices = createFullDeviceList(
      inputDevices,
      inputPriorityList,
      DeviceType.Input,
      currentInputDevice,
    );

    // Sort devices by priority rank (lower rank = higher priority)
    processedOutputDevices.sort((a, b) => a.priorityRank - b.priorityRank);
    processedInputDevices.sort((a, b) => a.priorityRank - b.priorityRank);

    return {
      outputDevices: processedOutputDevices,
      inputDevices: processedInputDevices,
      outputPriorityList,
      inputPriorityList,
      currentOutputDevice,
      currentInputDevice,
    };
  }, []);

  // Initialize local state when data loads
  useEffect(() => {
    if (deviceData) {
      setLocalOutputPriorityList(deviceData.outputPriorityList);
      setLocalInputPriorityList(deviceData.inputPriorityList);
    }
  }, [deviceData]);

  // Re-rank devices based on local priority changes
  const processedDeviceData = deviceData
    ? {
        outputDevices: deviceData.outputDevices
          .map((device) => {
            const priorityIndex = localOutputPriorityList.findIndex(
              (name) => name.toLowerCase() === device.name.toLowerCase(),
            );
            return {
              ...device,
              priorityRank: priorityIndex >= 0 ? priorityIndex + 1 : localOutputPriorityList.length + 1,
            };
          })
          .sort((a, b) => a.priorityRank - b.priorityRank),
        inputDevices: deviceData.inputDevices
          .map((device) => {
            const priorityIndex = localInputPriorityList.findIndex(
              (name) => name.toLowerCase() === device.name.toLowerCase(),
            );
            return {
              ...device,
              priorityRank: priorityIndex >= 0 ? priorityIndex + 1 : localInputPriorityList.length + 1,
            };
          })
          .sort((a, b) => a.priorityRank - b.priorityRank),
      }
    : null;

  if (isLoading) {
    return <List isLoading={true} />;
  }

  if (!processedDeviceData) {
    return (
      <List>
        <List.EmptyView
          title="No Devices Found"
          description="No audio devices are currently available"
          icon={Icon.SpeakerOn}
        />
      </List>
    );
  }

  const autoSwitchIfTopPriority = async (device: DeviceWithPriority, newRank = 1, deviceType: "output" | "input") => {
    if (preferences.enableAutoSwitch && device.isAvailable && newRank === 1) {
      try {
        if (deviceType === "output" && device.isOutput) {
          await setDefaultOutputDevice(device.id);
          if (preferences.systemOutput) {
            await setDefaultSystemDevice(device.id);
          }
          showToast({ style: Toast.Style.Success, title: `Auto-switched to output: ${device.name}` });
        } else if (deviceType === "input" && device.isInput) {
          await setDefaultInputDevice(device.id);
          showToast({ style: Toast.Style.Success, title: `Auto-switched to input: ${device.name}` });
        }
      } catch (error) {
        console.log("Auto-switch failed:", error);
      }
    }
  };

  const setAsTopPriority = async (device: DeviceWithPriority, deviceType: "output" | "input") => {
    try {
      const currentList = deviceType === "output" ? localOutputPriorityList : localInputPriorityList;
      const newList = [device.name, ...currentList.filter((name) => name.toLowerCase() !== device.name.toLowerCase())];

      // Update local state immediately for instant visual feedback
      if (deviceType === "output") {
        setLocalOutputPriorityList(newList);
        await setOutputPriorityList(newList);
        showToast({ style: Toast.Style.Success, title: `Set ${device.name} as top priority output device` });
      } else {
        setLocalInputPriorityList(newList);
        await setInputPriorityList(newList);
        showToast({ style: Toast.Style.Success, title: `Set ${device.name} as top priority input device` });
      }

      // Auto-switch if enabled and device is available
      await autoSwitchIfTopPriority(device, 1, deviceType);
    } catch {
      showToast({ style: Toast.Style.Failure, title: "Failed to set priority" });
    }
  };

  const moveUp = async (device: DeviceWithPriority, deviceType: "output" | "input") => {
    try {
      const currentList = deviceType === "output" ? localOutputPriorityList : localInputPriorityList;
      const currentIndex = currentList.findIndex((name) => name.toLowerCase() === device.name.toLowerCase());

      if (currentIndex > 0) {
        const newList = [...currentList];
        // Swap with the device above
        [newList[currentIndex], newList[currentIndex - 1]] = [newList[currentIndex - 1], newList[currentIndex]];

        // Update local state immediately for instant visual feedback
        if (deviceType === "output") {
          setLocalOutputPriorityList(newList);
          await setOutputPriorityList(newList);
        } else {
          setLocalInputPriorityList(newList);
          await setInputPriorityList(newList);
        }

        showToast({ style: Toast.Style.Success, title: `Moved ${device.name} up in priority` });

        // Auto-switch if device moved to #1 position
        if (currentIndex === 1) {
          // Was at position 2, now at position 1
          await autoSwitchIfTopPriority(device, 1, deviceType);
        }
      }
    } catch {
      showToast({ style: Toast.Style.Failure, title: "Failed to move device up" });
    }
  };

  const moveDown = async (device: DeviceWithPriority, deviceType: "output" | "input") => {
    try {
      const currentList = deviceType === "output" ? localOutputPriorityList : localInputPriorityList;
      const currentIndex = currentList.findIndex((name) => name.toLowerCase() === device.name.toLowerCase());

      if (currentIndex < currentList.length - 1 && currentIndex !== -1) {
        const newList = [...currentList];
        // Swap with the device below
        [newList[currentIndex], newList[currentIndex + 1]] = [newList[currentIndex + 1], newList[currentIndex]];

        // Update local state immediately for instant visual feedback
        if (deviceType === "output") {
          setLocalOutputPriorityList(newList);
          await setOutputPriorityList(newList);
        } else {
          setLocalInputPriorityList(newList);
          await setInputPriorityList(newList);
        }

        showToast({ style: Toast.Style.Success, title: `Moved ${device.name} down in priority` });
      }
    } catch {
      showToast({ style: Toast.Style.Failure, title: "Failed to move device down" });
    }
  };

  const moveToBottom = async (device: DeviceWithPriority, deviceType: "output" | "input") => {
    try {
      const currentList = deviceType === "output" ? localOutputPriorityList : localInputPriorityList;
      const newList = [...currentList.filter((name) => name.toLowerCase() !== device.name.toLowerCase()), device.name];

      // Update local state immediately for instant visual feedback
      if (deviceType === "output") {
        setLocalOutputPriorityList(newList);
        await setOutputPriorityList(newList);
        showToast({ style: Toast.Style.Success, title: `Moved ${device.name} to bottom of output priority list` });
      } else {
        setLocalInputPriorityList(newList);
        await setInputPriorityList(newList);
        showToast({ style: Toast.Style.Success, title: `Moved ${device.name} to bottom of input priority list` });
      }
    } catch {
      showToast({ style: Toast.Style.Failure, title: "Failed to move device" });
    }
  };

  const renderDeviceActions = (device: DeviceWithPriority, deviceType: "output" | "input") => (
    <ActionPanel>
      <ActionPanel.Section title="Priority Actions">
        <Action
          title="Set as Top Priority"
          icon={Icon.ChevronUp}
          onAction={() => setAsTopPriority(device, deviceType)}
          shortcut={{ modifiers: ["cmd"], key: "t" }}
        />
        {device.priorityRank > 1 && (
          <Action
            title="Move up in Priority"
            icon={Icon.ArrowUp}
            onAction={() => moveUp(device, deviceType)}
            shortcut={{ modifiers: ["cmd", "opt"], key: "arrowUp" }}
          />
        )}
        <Action
          title="Move Down in Priority"
          icon={Icon.ArrowDown}
          onAction={() => moveDown(device, deviceType)}
          shortcut={{ modifiers: ["cmd", "opt"], key: "arrowDown" }}
        />
        <Action
          title="Move to Bottom"
          icon={Icon.ChevronDown}
          onAction={() => moveToBottom(device, deviceType)}
          shortcut={{ modifiers: ["cmd"], key: "b" }}
        />
        {!device.isAvailable && (
          <Action
            title="Remove from Priority List"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            onAction={async () => {
              try {
                const currentList = deviceType === "output" ? localOutputPriorityList : localInputPriorityList;
                const newList = currentList.filter((name) => name.toLowerCase() !== device.name.toLowerCase());

                // Update local state immediately for instant visual feedback
                if (deviceType === "output") {
                  setLocalOutputPriorityList(newList);
                  await setOutputPriorityList(newList);
                } else {
                  setLocalInputPriorityList(newList);
                  await setInputPriorityList(newList);
                }

                showToast({
                  style: Toast.Style.Success,
                  title: `Removed ${device.name} from ${deviceType} priority list`,
                });
              } catch {
                showToast({ style: Toast.Style.Failure, title: "Failed to remove device" });
              }
            }}
            shortcut={{ modifiers: ["cmd"], key: "backspace" }}
          />
        )}
      </ActionPanel.Section>

      <ActionPanel.Section title="Copy Actions">
        <Action.CopyToClipboard
          title="Copy Device Name"
          content={device.name}
          shortcut={Keyboard.Shortcut.Common.Copy}
        />
        <Action.CopyToClipboard
          title="Copy Device ID"
          content={device.id}
          shortcut={{ modifiers: ["cmd"], key: "i" }}
        />
        <Action.CopyToClipboard
          title="Copy Device UID"
          content={device.uid}
          shortcut={{ modifiers: ["cmd"], key: "u" }}
        />
      </ActionPanel.Section>

      <ActionPanel.Section title="Info">
        <Action
          title="Show Device Details"
          icon={Icon.Info}
          onAction={() => {
            showToast({
              style: Toast.Style.Success,
              title: device.name,
              message: `Type: ${device.transportType}\nID: ${device.id}\nUID: ${device.uid}`,
            });
          }}
          shortcut={{ modifiers: ["cmd"], key: "d" }}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );

  const getDeviceIcon = (device: DeviceWithPriority): Icon => {
    // Check if it's a Bluetooth device
    if (device.transportType === TransportType.Bluetooth || device.transportType === TransportType.BluetoothLowEnergy) {
      const name = device.name.toLowerCase();
      if (name.includes("airpods")) {
        return Icon.Airpods;
      }
      if (name.includes("headphone") || name.includes("headset")) {
        return Icon.Headphones;
      }
      return Icon.Bluetooth;
    }

    // Default icons based on device type (includes AirPlay, USB, HDMI, etc.)
    return device.isInput ? Icon.Microphone : Icon.Speaker;
  };

  const getDeviceAccessories = (device: DeviceWithPriority): List.Item.Accessory[] => {
    const accessories: List.Item.Accessory[] = [];

    if (device.isAvailable) {
      accessories.push({ text: device.id, tooltip: `Device ID: ${device.id}` });
    } else {
      accessories.push({ icon: Icon.WifiDisabled, tooltip: "Device disconnected" });
    }

    if (device.isCurrent) {
      accessories.push({ icon: Icon.Checkmark, tooltip: "Currently active device" });
    }

    accessories.push({ text: `#${device.priorityRank}`, tooltip: `Priority rank ${device.priorityRank}` });

    return accessories;
  };

  return (
    <List searchBarPlaceholder="Search audio devices...">
      <List.Section title={`Output Devices (${processedDeviceData.outputDevices.length})`}>
        {processedDeviceData.outputDevices.map((device) => (
          <List.Item
            key={device.uid}
            title={device.name}
            subtitle={device.isAvailable ? device.transportType : `${device.transportType} (Disconnected)`}
            icon={{
              source: getDeviceIcon(device),
              tintColor: device.isCurrent ? Color.Green : Color.SecondaryText,
            }}
            accessories={getDeviceAccessories(device)}
            actions={renderDeviceActions(device, "output")}
          />
        ))}
      </List.Section>

      <List.Section title={`Input Devices (${processedDeviceData.inputDevices.length})`}>
        {processedDeviceData.inputDevices.map((device) => (
          <List.Item
            key={device.uid}
            title={device.name}
            subtitle={device.isAvailable ? device.transportType : `${device.transportType} (Disconnected)`}
            icon={{
              source: getDeviceIcon(device),
              tintColor: device.isCurrent ? Color.Green : Color.SecondaryText,
            }}
            accessories={getDeviceAccessories(device)}
            actions={renderDeviceActions(device, "input")}
          />
        ))}
      </List.Section>
    </List>
  );
}
