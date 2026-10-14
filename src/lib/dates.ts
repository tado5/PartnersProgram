export function zonedDayRange(now: Date, timeZone: string) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const year = Number(dateParts.find((part) => part.type === "year")?.value);
  const month = Number(dateParts.find((part) => part.type === "month")?.value);
  const day = Number(dateParts.find((part) => part.type === "day")?.value);
  const start = zonedMidnightUtc(year, month, day, timeZone);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start,
    end: zonedMidnightUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), timeZone),
  };
}

export function zonedMonthRange(now: Date, timeZone: string) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const year = Number(dateParts.find((part) => part.type === "year")?.value);
  const month = Number(dateParts.find((part) => part.type === "month")?.value);
  return zonedCalendarMonthRange(year, month, timeZone);
}

export function zonedCalendarMonthRange(year: number, month: number, timeZone: string) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Invalid calendar month.");
  }
  const nextMonth = new Date(Date.UTC(year, month, 1));
  return {
    periodStart: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-01`,
    start: zonedMidnightUtc(year, month, 1, timeZone),
    end: zonedMidnightUtc(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 1, timeZone),
  };
}

export function parseCalendarMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || year > 9999 || month < 1 || month > 12) return null;
  return { year, month };
}

export function zonedCalendarDayRange(year: number, month: number, day: number, timeZone: string) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 ||
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError("Invalid calendar day.");
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new RangeError("Invalid calendar day.");
  }
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: zonedMidnightUtc(year, month, day, timeZone),
    end: zonedMidnightUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), timeZone),
  };
}

export function dateTimeInputInZoneToIso(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const values = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const [year, month, day, hour, minute] = values;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const formatted = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(
      formatted.year, formatted.month - 1, formatted.day, formatted.hour, formatted.minute,
    );
    const difference = target - represented;
    if (difference === 0) return new Date(candidate).toISOString();
    candidate += difference;
  }
  return null;
}

function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    candidate += target - represented;
  }
  return new Date(candidate);
}
