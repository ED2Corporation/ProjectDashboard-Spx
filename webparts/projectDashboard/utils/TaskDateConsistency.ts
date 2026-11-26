// Parent span must equal its children span: start = min(children.start), finish = max(children.finish).
// Date math works on yyyy-mm-dd strings in UTC, so results do not depend on the browser time zone.

export interface IDateSpan {
  start: string;
  finish: string;
}

export interface IDateSpanChild extends IDateSpan {
  id: string;
}

export interface IParentSpanCheck {
  expected: IDateSpan;
  inSync: boolean;
  /** Children whose dates fall outside the current parent span */
  childrenOutside: string[];
}

const DAY_MS = 86400000;
const ymd = (v?: string): string => (v ?? '').slice(0, 10);
const toUtc = (v: string): number => {
  const [y, m, d] = v.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const isWeekday = (ms: number): boolean => {
  const dow = new Date(ms).getUTCDay();
  return dow !== 0 && dow !== 6;
};

/** Moves a date by n working days (Mon–Fri); negative n moves backwards. */
export function addWorkingDays(date: string, n: number): string {
  const d = ymd(date);
  if (!d || n === 0) return date;
  const step = n > 0 ? DAY_MS : -DAY_MS;
  let ms = toUtc(d);
  for (let left = Math.abs(n); left > 0;) {
    ms += step;
    if (isWeekday(ms)) left--;
  }
  return fromUtc(ms);
}

/** Signed count of working days (Mon–Fri) stepped from `from` to `to`. */
export function workingDaysBetween(from: string, to: string): number {
  const a = ymd(from);
  const b = ymd(to);
  if (!a || !b || a === b) return 0;
  const sign = b > a ? 1 : -1;
  const end = toUtc(b);
  let ms = toUtc(a);
  let count = 0;
  while (ms !== end) {
    ms += sign * DAY_MS;
    if (isWeekday(ms)) count++;
  }
  return sign * count;
}

export function shiftSpan<T extends IDateSpan>(item: T, workingDays: number): T {
  if (workingDays === 0) return item;
  return { ...item, start: addWorkingDays(item.start, workingDays), finish: addWorkingDays(item.finish, workingDays) };
}

export function checkParentSpan(parent: IDateSpan, children: IDateSpanChild[]): IParentSpanCheck | undefined {
  const dated = children.filter(c => ymd(c.start) && ymd(c.finish));
  if (dated.length === 0) return undefined;

  const expected = dated.reduce<IDateSpan>((acc, c) => ({
    start:  !acc.start  || ymd(c.start)  < acc.start  ? ymd(c.start)  : acc.start,
    finish: !acc.finish || ymd(c.finish) > acc.finish ? ymd(c.finish) : acc.finish,
  }), { start: '', finish: '' });

  const pStart = ymd(parent.start);
  const pFinish = ymd(parent.finish);
  const childrenOutside = pStart && pFinish
    ? dated.filter(c => ymd(c.start) < pStart || ymd(c.finish) > pFinish).map(c => c.id)
    : [];

  return {
    expected,
    inSync: pStart === expected.start && pFinish === expected.finish,
    childrenOutside,
  };
}

/**
 * Moves children along with their parent, keeping each child's duration:
 * 1. every child shifts by the working days the parent Start moved;
 * 2. a child that still ends after the parent Finish is pulled back until it ends on it.
 * `onShift` receives each moved child and its offset so callers can cascade to grandchildren.
 */
export function shiftChildrenWithParent<T extends IDateSpan>(
  savedParent: IDateSpan,
  parent: IDateSpan,
  children: T[],
  onShift?: (child: T, offset: number) => T,
): T[] {
  const startDelta = workingDaysBetween(savedParent.start, parent.start);
  return children.map(child => {
    let offset = startDelta;
    const shiftedFinish = addWorkingDays(child.finish, offset);
    if (ymd(parent.finish) && ymd(shiftedFinish) > ymd(parent.finish)) {
      offset -= workingDaysBetween(parent.finish, shiftedFinish);
    }
    if (offset === 0) return child;
    const moved = shiftSpan(child, offset);
    return onShift ? onShift(moved, offset) : moved;
  });
}
