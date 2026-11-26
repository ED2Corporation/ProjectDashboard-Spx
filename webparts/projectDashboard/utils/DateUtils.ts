
// dateUtils.ts

/**
 * Checks if a string is in strict "YYYY-MM-DD" format.
 */
export const isDateOnly = (value?: string): value is string => {
    if (!value) return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
};

// ── Business calendar: the system operates on Arizona time (UTC−7, no DST) ──
export const APP_TIME_ZONE = "America/Phoenix";

const appDateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

const formatAppDate = (d: Date): string => {
    const parts = appDateFormatter.formatToParts(d);
    const get = (type: string): string => parts.find(p => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
};

/**
 * Calendar date (YYYY-MM-DD) of a value, as seen in Arizona.
 * Legacy values saved as exact UTC midnight were date-only picks, so their UTC date is kept.
 */
export const toAppDate = (value?: string | Date): string => {
    if (!value) return "";
    if (typeof value === "string" && isDateOnly(value)) return value;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
    return isUtcMidnight ? d.toISOString().slice(0, 10) : formatAppDate(d);
};

/** Today's date (YYYY-MM-DD) in Arizona. */
export const appToday = (): string => formatAppDate(new Date());

/** Date-only pick → instant at noon Arizona (19:00Z), which stays on the same calendar day in every US time zone. */
export const appDateToSp = (dateOnly: string): Date | undefined => {
    if (!isDateOnly(dateOnly)) return undefined;
    const [y, m, d] = dateOnly.split("-").map(n => parseInt(n, 10));
    return new Date(Date.UTC(y, m - 1, d, 19, 0, 0, 0));
};

/**
 * Creates an ISO 8601 string at 00:00:00.000Z from a date-only "YYYY-MM-DD".
 * This does NOT use local timezone; it builds UTC explicitly.
 * Returns null if input is invalid.
 */
export const dateOnlyToUtcIso = (dateOnly?: string): string | undefined => {
    if (!isDateOnly(dateOnly)) return undefined;
    const [y, m, d] = dateOnly!.split("-").map(n => parseInt(n, 10));
    // Basic sanity checks
    if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;

    const ms = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
    return new Date(ms).toISOString(); // → "YYYY-MM-DDT00:00:00.000Z"
};

/**
 * Creates a Date object set at UTC midnight from a date-only "YYYY-MM-DD".
 * Returns null if input is invalid.
 */
export const dateOnlyToUtcDate = (dateOnly?: string): Date | undefined => {
    if (!isDateOnly(dateOnly)) return undefined;
    const [y, m, d] = dateOnly!.split("-").map(n => parseInt(n, 10));
    if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
};

/**
 * Normalizes any supported input (date-only, ISO datetime, Date)
 * into an ISO 8601 string in UTC.
 *
 * Rules:
 * - "YYYY-MM-DD" → returns "YYYY-MM-DDT00:00:00.000Z" (UTC midnight)
 * - ISO datetime string (e.g., "2025-02-10T15:30:00+01:00" or "2025-02-10T14:30:00Z") → normalized to UTC with .toISOString()
 * - Date object → .toISOString()
 * - null/undefined/empty → null
 *
 * Returns null if the input cannot be parsed.
 */
export const toUtcIso = (input?: string | Date): string | undefined => {
    if (!input) return undefined;

    // If it's a date-only string
    if (typeof input === "string" && isDateOnly(input)) {
        return dateOnlyToUtcIso(input);
    }

    // If it's a Date object or datetime string, try direct parsing
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return undefined;

    return d.toISOString(); // normalized to UTC
};

/**
 * Converts various inputs to a date-only string "YYYY-MM-DD" for <input type="date">.
 * - For ISO or Date → returns the calendar date based on the local components of the Date object.
 * - For date-only input → returns as-is.
 * - For invalid/null → returns "".
 */
export const toDateOnlyString = (input?: string | Date): string => {
    if (!input) return "";
    if (typeof input === "string" && isDateOnly(input)) return input;

    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return "";

    const yyyy = d.getFullYear();
    const mm = `${d.getMonth() + 1}`.padStart(2, "0");
    const dd = `${d.getDate()}`.padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
};

/**
 * Parses any supported input and returns a Date object in local time.
 * - For date-only: creates a Date at local midnight (NOT UTC).
 * - For ISO datetime: relies on JS Date parsing; result is that moment in local tz.
 *
 * Prefer `dateOnlyToUtcDate` when you need a UTC Date from date-only input.
 */
export const parseToLocalDate = (input?: string | Date): Date | undefined => {
    if (!input) return undefined;
    if (typeof input === "string" && isDateOnly(input)) {
        const [y, m, d] = input.split("-").map(n => parseInt(n, 10));
        return new Date(y, m - 1, d, 0, 0, 0, 0); // local midnight
    }
    const d = input instanceof Date ? input : new Date(input);
    return isNaN(d.getTime()) ? undefined : d;
};
