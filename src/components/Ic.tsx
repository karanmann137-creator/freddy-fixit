import React from "react";

export type IconName =
  | "wrench" | "droplet" | "zap" | "thermometer" | "hammer"
  | "paint-roller" | "layers" | "car" | "circle-dashed" | "battery"
  | "toolbox" | "tree" | "snowflake" | "cloud-rain" | "door"
  | "home" | "building" | "wind" | "sparkles" | "package"
  | "sun" | "cloud-sun" | "moon" | "calendar" | "refresh"
  | "clock" | "check-circle" | "link" | "x-circle" | "clipboard-list"
  | "phone" | "map-pin" | "timer" | "dollar" | "message-square"
  | "pencil" | "trash" | "mail" | "camera" | "smartphone"
  | "settings" | "bell" | "search" | "alert-triangle" | "briefcase"
  | "user" | "user-check" | "radio-on" | "radio-off" | "wave"
  | "building2" | "garage-door" | "pipe"
  | "key" | "refrigerator" | "trowel";

type IcProps = {
  name: IconName;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
};

const ICONS: Record<IconName, React.ReactNode> = {
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  droplet: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  zap: <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  thermometer: <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />,
  hammer: <><path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9" /><path d="M17.64 15 22 10.64" /><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" /></>,
  "paint-roller": <><rect x="3" y="3" width="14" height="8" rx="2" /><path d="M7 11v4" /><rect x="4" y="15" width="2" height="6" rx="1" /></>,
  layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
  car: <><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-2" /><circle cx="7.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>,
  "circle-dashed": <><circle cx="12" cy="12" r="9" strokeDasharray="3 3" /><circle cx="12" cy="12" r="3" /></>,
  battery: <><rect x="1" y="6" width="18" height="12" rx="2" ry="2" /><line x1="23" y1="13" x2="23" y2="11" /><line x1="6" y1="12" x2="12" y2="12" /><line x1="9" y1="9" x2="9" y2="15" /></>,
  toolbox: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></>,
  tree: <><path d="M12 22V16" /><path d="M5 10l7-8 7 8" /><path d="M3 14l9-4 9 4" /><path d="M5 18l7-2 7 2" /></>,
  snowflake: <><line x1="12" y1="2" x2="12" y2="22" /><line x1="19.8" y1="7" x2="4.2" y2="17" /><line x1="4.2" y1="7" x2="19.8" y2="17" /><path d="M10 5l2 2 2-2M10 19l2-2 2 2" /><path d="M18 9.5l-3 .5.5-3M6 14.5l3-.5-.5 3" /><path d="M18 14.5l.5-3-3-.5M6 9.5l-.5 3 3 .5" /></>,
  "cloud-rain": <><line x1="16" y1="13" x2="16" y2="21" /><line x1="8" y1="13" x2="8" y2="21" /><line x1="12" y1="15" x2="12" y2="23" /><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" /></>,
  door: <><path d="M13 4H3v16h10V4z" /><circle cx="10.5" cy="12" r=".5" fill="currentColor" /><line x1="3" y1="20" x2="21" y2="20" /><path d="M13 4l5 4v12" /></>,
  home: <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 22v-4h6v4" /><line x1="9" y1="7" x2="9.01" y2="7" /><line x1="15" y1="7" x2="15.01" y2="7" /><line x1="9" y1="11" x2="9.01" y2="11" /><line x1="15" y1="11" x2="15.01" y2="11" /><line x1="9" y1="15" x2="9.01" y2="15" /><line x1="15" y1="15" x2="15.01" y2="15" /></>,
  wind: <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />,
  sparkles: <><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /><path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z" /><path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75z" /></>,
  package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
  sun: <><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>,
  "cloud-sun": <><path d="M12 2v2" /><path d="M4.93 4.93l1.41 1.41" /><path d="M20 12h2" /><path d="M19.07 4.93l-1.41 1.41" /><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" /><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6z" /></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  refresh: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  "check-circle": <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  "x-circle": <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>,
  "clipboard-list": <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.72 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  "map-pin": <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M9.17 2h5.66" /><path d="M12 2v3" /></>,
  dollar: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  "message-square": <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  pencil: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>,
  mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>,
  camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
  smartphone: <><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  "alert-triangle": <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  "user-check": <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></>,
  "radio-on": <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /></>,
  "radio-off": <circle cx="12" cy="12" r="10" />,
  wave: <path d="M2 12c1.5-3 3.5-4.5 6-4.5s4.5 2 6 2 4-2 6-3" />,
  building2: <><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></>,
  "garage-door": <><rect x="2" y="4" width="20" height="16" rx="1" /><line x1="2" y1="8" x2="22" y2="8" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="16" x2="22" y2="16" /><line x1="10" y1="18" x2="14" y2="18" /></>,
  pipe: <><line x1="2" y1="8" x2="14" y2="8" /><path d="M14 8 Q20 8 20 14" /><line x1="20" y1="14" x2="20" y2="22" /><path d="M2 14 L14 14 L14 22" /></>,
  trowel: <><path d="M3 21l10-10" /><path d="M12.5 9.5l4-4 3 3-4 4z" /><path d="M9 6l3-3 7 7-3 3" /></>,
  key: <><circle cx="7.5" cy="15.5" r="5.5" /><path d="M21 2l-9.6 9.6" /><path d="M15.5 7.5l3 3L22 7l-3-3" /></>,
  refrigerator: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M4 10h16" /><line x1="9" y1="6" x2="9" y2="9" /><line x1="9" y1="14" x2="9" y2="18" /></>,
};

export function Ic({ name, size = 18, color = "currentColor", style }: IcProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
    >
      {ICONS[name]}
    </svg>
  );
}
