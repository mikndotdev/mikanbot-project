interface CustomEmoji {
  name: string;
  id: string;
  animated: boolean;
}

const CUSTOM = {
  loading: { name: "loading", id: "1272805571585642506", animated: true },
  camera: { name: "camera", id: "1316791863172268132", animated: false },
  shinkansen: { name: "shinkansen_icon", id: "1548009167980204062", animated: false },
  stopped: { name: "stopped", id: "1548528795059757086", animated: true },
  progressArrows: { name: "progress_arrows", id: "1548527738279690295", animated: true },
} as const satisfies Record<string, CustomEmoji>;

export type CustomEmojiKey = keyof typeof CUSTOM;

export function customEmoji(key: CustomEmojiKey): string {
  const entry = CUSTOM[key];
  return `<${entry.animated ? "a" : ""}:${entry.name}:${entry.id}>`;
}

export const EMOJI = {
  loading: customEmoji("loading"),
  camera: customEmoji("camera"),

  trainShinkansen: customEmoji("shinkansen"),
  trainConventional: "🚃",
  atStation: customEmoji("stopped"),
  approaching: customEmoji("progressArrows"),

  statusSuspended: "🔴",
  statusDelayedMajor: "🟠",
  statusDelayedMinor: "🟡",
  statusNormal: "🔵",
  statusLive: "🟢",
  statusNotRunning: "⚫",
  statusBeforeDeparture: "🕐",
  statusFinished: "🏁",
  statusWarning: "⚠️",

  buttonPrev: "◀️",
  buttonNext: "▶️",
  buttonRefresh: "🔄",
  buttonCollapse: "🔼",
  buttonExpand: "🔽",
  buttonAssign: "🚆",
  buttonMap: "🗺️",
  buttonZoomTrain: "🔍",
  buttonClose: "❌",
  buttonUnsubscribe: "🔕",
  buttonShuffle: "🔀",
  buttonZoomOut: "➖",
  buttonZoomIn: "➕",

  success: "✅",
  error: "❌",
  owner: "👤",

  headingTrain: "🚆",
  headingMap: "🗺️",
  headingFlight: "✈️",
} as const;
