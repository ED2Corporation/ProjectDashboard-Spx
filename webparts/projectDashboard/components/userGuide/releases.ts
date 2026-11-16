/**
 * releases.ts
 * Release notes shown in the Releases tab of the User Manual.
 * The newest release is shown in full; older ones are grouped by year / month
 * inside a collapsed card.
 *
 * To publish a release: add an entry at the TOP of RELEASES with the version
 * from config/package-solution.json and the release date.
 */

export interface IReleaseItem {
  area: string;
  text: string;
}

export interface IRelease {
  version: string;
  /** yyyy-mm-dd */
  date: string;
  items: IReleaseItem[];
}

export const RELEASES: IRelease[] = [
  {
    version: '1.0.6.7',
    date: '2026-11-16',
    items: [
      { area: 'Task List', text: 'Add Task now works correctly: the new task card opens immediately after creation for editing.' },
      { area: 'Task List', text: 'Opening the Actions toolbar while in Executive View automatically switches to Operations View, ensuring newly created tasks are visible.' },
      { area: 'WO Report', text: 'LOT Schedule: Shipment column now shows units actually delivered (sum of completed batches); Total Units shows the planned quantity per LOT.' },
      { area: 'WO Report', text: 'LOT Schedule drill-down: LOTs with Step Task batches show an expand button (▸ N) in the LOT # column to reveal individual batch rows — WBS, units, status, target date, and batch vs. LOT totals.' },
      { area: 'Subprocess', text: 'Save button in Subprocess Workspace now shows inline status (Saving… / Saved / Save failed) instead of a separate badge, keeping the toolbar compact.' },
    ],
  },
  {
    version: '1.0.6.6',
    date: '2026-11-11',
    items: [
      { area: 'WO Report', text: 'Report header now shows the full work week range (e.g. "Nov 9–13, 2026") instead of a single date; picking any day snaps automatically to the Monday of that week.' },
      { area: 'WO Report', text: 'Timezone fix: dates no longer shift by one day for users in UTC-offset time zones (Tucson/MST).' },
      { area: 'WO Report', text: 'Viewing a past week shows all notes recorded for that week (active + archived), not just the current week\'s active notes.' },
      { area: 'WO Report', text: 'Archive Week button (🗂) archives all active notes for the current reporting week in one click.' },
      { area: 'WO Report', text: 'History panel: browse past week notes by date range or free-text search; copy any past note into the current report with one click.' },
    ],
  },
  {
    version: '1.0.6.5',
    date: '2026-11-10',
    items: [
      { area: 'WO Report',      text: 'New status report panel: add, edit, and archive notes per production gate or as a General Update, all with inline editing — no page reload required.' },
      { area: 'WO Report',      text: 'Gate badge selector in the report header lets you pick the target gate before adding a note; gates already at 100% are hidden.' },
      { area: 'WO Report',      text: 'PDF export from the task-list header (Report mode only). Editing controls are automatically hidden from the printed version.' },
      { area: 'Report Header',  text: '"Report [date]" label is visible in the PDF; click the date to pick the reporting week directly from the report header.' },
      { area: 'Lot Schedule',   text: 'Shipment column widened; LOT# and Total Units columns narrowed to show more shipment detail per row.' },
      { area: 'Data Integrity', text: 'Concurrent saves no longer overwrite each other: ETag-based conflict detection automatically retries writes against the latest server state.' },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const fmtReleaseDate = (ymd: string): string => {
  const [year, month, day] = ymd.split('-').map(Number);
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${day}, ${year}`;
};

export interface IMonthGroup  { month: number; monthName: string; releases: IRelease[]; }
export interface IYearGroup   { year: number; months: IMonthGroup[]; }

export const groupReleasesByMonth = (releases: IRelease[]): IYearGroup[] => {
  const years = new Map<number, Map<number, IRelease[]>>();
  for (const r of releases) {
    const [y, m] = r.date.split('-').map(Number);
    const months = years.get(y) ?? new Map<number, IRelease[]>();
    months.set(m, [...(months.get(m) ?? []), r]);
    years.set(y, months);
  }
  return [...years.keys()].sort((a, b) => b - a).map(year => ({
    year,
    months: [...years.get(year)!.keys()].sort((a, b) => b - a).map(month => ({
      month,
      monthName: MONTH_NAMES[month - 1],
      releases:  years.get(year)!.get(month)!,
    })),
  }));
};
