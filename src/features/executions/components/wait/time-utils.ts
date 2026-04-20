export const waitModes = [
  "seconds",
  "minutes",
  "hours",
  "until_time",
  "until_datetime",
] as const;

export type WaitMode = (typeof waitModes)[number];

export function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function parseTimeParts(value: string) {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function getTimeZoneDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: partValue("year"),
    month: partValue("month"),
    day: partValue("day"),
    hour: partValue("hour"),
    minute: partValue("minute"),
    second: partValue("second"),
  };
}

function getOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeZoneDateParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

function buildYyyyMmDd(parts: { year: number; month: number; day: number }) {
  const yyyy = String(parts.year).padStart(4, "0");
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function zonedDateTimeToUtc(localDateTime: string, timeZone: string) {
  const [datePart, timePartRaw] = localDateTime.trim().split("T");
  if (!datePart || !timePartRaw) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = datePart.split("-");
  const timePart = timePartRaw.slice(0, 5);
  const [hourRaw, minuteRaw] = timePart.split(":");

  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset1 = getOffsetMs(utcGuess, timeZone);
  const utcMs1 = utcGuess.getTime() - offset1;
  const offset2 = getOffsetMs(new Date(utcMs1), timeZone);
  const utcMs2 = utcGuess.getTime() - offset2;
  return new Date(utcMs2);
}

export function nextZonedTimeOccurrence(params: {
  time: string;
  timezone: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const parsedTime = parseTimeParts(params.time);
  if (!parsedTime) {
    return null;
  }

  const zonedNow = getTimeZoneDateParts(now, params.timezone);
  const baseDate = buildYyyyMmDd(zonedNow);
  const targetTime = `${String(parsedTime.hour).padStart(2, "0")}:${String(parsedTime.minute).padStart(2, "0")}`;
  const todayCandidate = zonedDateTimeToUtc(
    `${baseDate}T${targetTime}`,
    params.timezone,
  );

  if (!todayCandidate) {
    return null;
  }

  if (todayCandidate > now) {
    return todayCandidate;
  }

  const tomorrowUtcDate = new Date(
    Date.UTC(zonedNow.year, zonedNow.month - 1, zonedNow.day + 1),
  );
  const tomorrowDate = buildYyyyMmDd({
    year: tomorrowUtcDate.getUTCFullYear(),
    month: tomorrowUtcDate.getUTCMonth() + 1,
    day: tomorrowUtcDate.getUTCDate(),
  });

  return zonedDateTimeToUtc(`${tomorrowDate}T${targetTime}`, params.timezone);
}

export function formatDuration(ms: number) {
  const safeMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
