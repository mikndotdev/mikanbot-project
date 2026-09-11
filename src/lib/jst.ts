const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_START_HOUR = 4;

export interface OperationalDay {
  selectDate: string;
  currentTime: string;
  hour: number;
  minute: number;
  second: number;
  minutes: number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function getOperationalDay(now: Date = new Date()): OperationalDay {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);

  let year = jst.getUTCFullYear();
  let month = jst.getUTCMonth();
  let day = jst.getUTCDate();
  let hour = jst.getUTCHours();
  const minute = jst.getUTCMinutes();
  const second = jst.getUTCSeconds();

  if (hour < DAY_START_HOUR) {
    hour += 24;
    const previous = new Date(Date.UTC(year, month, day));
    previous.setUTCDate(previous.getUTCDate() - 1);
    year = previous.getUTCFullYear();
    month = previous.getUTCMonth();
    day = previous.getUTCDate();
  }

  return {
    selectDate: `${year}-${pad(month + 1)}-${pad(day)}`,
    currentTime: `${pad(hour)}:${pad(minute)}`,
    hour,
    minute,
    second,
    minutes: hour * 60 + minute,
  };
}

export function secondsUntilOperationalDayEnd(now: Date = new Date()): number {
  const jstMs = now.getTime() + JST_OFFSET_MS;
  const jst = new Date(jstMs);
  const todayBoundary = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
    DAY_START_HOUR,
  );
  const boundary = jst.getUTCHours() < DAY_START_HOUR ? todayBoundary : todayBoundary + 86400000;
  return Math.max(60, Math.floor((boundary - jstMs) / 1000));
}

export function formatHhmm(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--:--";
  return `${pad(Math.floor(value / 100))}:${pad(value % 100)}`;
}

export function formatHhmmss(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--:--";
  return formatHhmm(Math.floor(value / 100));
}

export function parseClockToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}
