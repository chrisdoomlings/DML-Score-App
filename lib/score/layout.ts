export const DEVICE_LAYOUTS = ["inline", "modal", "fullscreen"] as const;
export type DeviceLayout = (typeof DEVICE_LAYOUTS)[number];
export type LayoutMode = DeviceLayout | "fullscreen-mobile" | `${DeviceLayout}:${DeviceLayout}`;

function isDeviceLayout(value: unknown): value is DeviceLayout {
  return DEVICE_LAYOUTS.includes(value as DeviceLayout);
}

export function isLayoutMode(value: unknown): value is LayoutMode {
  if (isDeviceLayout(value) || value === "fullscreen-mobile") return true;
  if (typeof value !== "string") return false;
  const parts = value.split(":");
  return parts.length === 2 && parts.every(isDeviceLayout);
}

export function deviceLayouts(mode: LayoutMode): { desktop: DeviceLayout; mobile: DeviceLayout } {
  if (mode === "fullscreen-mobile") return { desktop: "inline", mobile: "fullscreen" };
  if (isDeviceLayout(mode)) return { desktop: mode, mobile: mode };
  const [desktop, mobile] = mode.split(":") as [DeviceLayout, DeviceLayout];
  return { desktop, mobile };
}

export function combineLayouts(desktop: DeviceLayout, mobile: DeviceLayout): LayoutMode {
  return desktop === mobile ? desktop : `${desktop}:${mobile}`;
}
