const RIYADH_TIMEZONE = 'Asia/Riyadh';
const BUSINESS_WEEKDAYS = new Set(['Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
const HALF_HOUR_MS = 30 * 60 * 1000;

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: RIYADH_TIMEZONE,
});

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: RIYADH_TIMEZONE,
});

const displayFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: RIYADH_TIMEZONE,
});

const displayFormatterAr = new Intl.DateTimeFormat('ar-SA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: RIYADH_TIMEZONE,
});

interface SlotOptions {
  startTime?: number;
  count?: number;
  durationMinutes?: number;
  bookedSlots?: number[];
}

function roundUpToNextHalfHour(timestamp: number): number {
  return Math.ceil(timestamp / HALF_HOUR_MS) * HALF_HOUR_MS;
}

function getTimeParts(timestamp: number) {
  const values = partsFormatter.formatToParts(new Date(timestamp));
  const map = Object.fromEntries(values.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function isBusinessSlot(timestamp: number) {
  const weekday = dayFormatter.format(new Date(timestamp));
  const { hour, minute } = getTimeParts(timestamp);
  return BUSINESS_WEEKDAYS.has(weekday)
    && hour >= 9
    && hour < 18
    && (minute === 0 || minute === 30);
}

function hasConflict(timestamp: number, bookedSlots: number[], durationMinutes: number) {
  const durationMs = durationMinutes * 60 * 1000;
  return bookedSlots.some((bookedSlot) => Math.abs(bookedSlot - timestamp) < durationMs);
}

export function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

export function listUpcomingAppointmentSlots({
  startTime = Date.now(),
  count = 3,
  durationMinutes = 30,
  bookedSlots = [],
}: SlotOptions = {}) {
  const slots = [];
  let cursor = roundUpToNextHalfHour(startTime + HALF_HOUR_MS);

  for (let attempts = 0; attempts < 24 * 21 * 2 && slots.length < count; attempts += 1) {
    if (isBusinessSlot(cursor) && !hasConflict(cursor, bookedSlots, durationMinutes)) {
      slots.push({
        timestamp: cursor,
        iso: new Date(cursor).toISOString(),
        timezone: RIYADH_TIMEZONE,
        display: displayFormatter.format(new Date(cursor)),
        displayAr: displayFormatterAr.format(new Date(cursor)),
      });
    }
    cursor += HALF_HOUR_MS;
  }

  return slots;
}

export { RIYADH_TIMEZONE };
