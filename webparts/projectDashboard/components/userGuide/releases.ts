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
    version: '1.0.6.11',
    date: '2026-11-18',
    items: [
      { area: 'Task Card', text: 'Batch Detail card now has a Ship toggle and Ship Units field — enabling Ship on a batch marks it as a delivery record and pre-fills Ship Units from the batch planned units.' },
      { area: 'WO Report', text: 'LOT Schedule Shipped column now counts only batches with Ship enabled and completed (complete = 100%), using the actual Ship Units value instead of the planned units.' },
      { area: 'WO Report', text: 'Batch rows in the LOT Schedule drill-down show a Ship indicator (▲) and display "N shipped" for completed Ship batches vs "N units" for planned ones.' },
      { area: 'Data', text: 'Batch-level Ship saves a release record per batch (id: release-task-{taskId}-step-{stepId}), enabling per-batch traceability in invoicing. The LOT-level release is suppressed when any batch has Ship enabled to avoid double-counting.' },
    ],
  },
  {
    version: '1.0.6.10',
    date: '2026-11-18',
    items: [
      { area: 'Task Card', text: 'Disabling Ship on a LOT task with units set now shows a confirmation prompt instead of blocking with an error — user confirms to save with Ship off, or cancels to review the configuration first.' },
      { area: 'Task Card', text: 'Release Units no longer resets to the lot\'s committed quantity after saving with Ship disabled — the saved value (0) is now respected on reload, eliminating the restore loop.' },
      { area: 'Task Card', text: 'LOT task auto-fill from lot.units now only applies to tasks that have never been saved by WO-Dashboard (truly pristine). Enabling Ship always auto-fills units from the lot commitment when units is not set.' },
    ],
  },
  {
    version: '1.0.6.9',
    date: '2026-11-17',
    items: [
      { area: 'Task Card', text: 'LOT tasks created by PO-Inbounds now auto-initialize on open: the Ship toggle turns on and Release Units pre-fills with the lot\'s committed quantity (lot.units) — no manual setup required.' },
      { area: 'Task Card', text: 'Enabling the Ship toggle on a LOT task now correctly fills Release Units with the lot\'s committed units (e.g. 80), not the WO total (e.g. 160).' },
      { area: 'Task Card', text: 'Batch Configuration Release reference now uses the correct lot units as the ceiling — remaining units and default piece count reflect the lot commitment, not the full WO quantity.' },
      { area: 'Task Card', text: 'LOT tasks pre-fill Release Units from the PO lot\'s committed quantity when first opened and Release Units is not yet set — the Ship toggle remains under user control and must be enabled manually to activate release tracking.' },
      { area: 'Task Card', text: 'Batch Configuration button (Create Batches) works correctly again after a dependency loop fix; the batch panel no longer closes immediately upon opening.' },
    ],
  },
  {
    version: '1.0.6.8',
    date: '2026-11-17',
    items: [
      { area: 'WO Report', text: 'LOT Schedule now shows LOT tasks created by PO-Inbounds (identified by jsonTable.lot) even before the isRelease toggle is set, connecting the plan directly to the PO delivery commitment.' },
      { area: 'WO Report', text: 'LOT # column now shows the PO lot reference (L1, L2…) matching the PO-Inbounds lot number, instead of a sequential index.' },
      { area: 'WO Report', text: 'ETA column now shows the contract delivery date from the PO lot (lot.eta), replacing the plan Finish date as the primary target.' },
      { area: 'WO Report', text: 'Contract column replaces Total Units: shows the PO-committed units for this lot (lot.units) alongside the WO total — e.g. "650 of 1,290".' },
      { area: 'WO Report', text: 'When recorded releases (from invoicing records) differ from delivered units, a small note shows the reconciliation delta next to the Shipped count.' },
      { area: 'Task Card', text: 'Collapsed Task Details header now shows the Units field for any task linked to a PO lot (jsonTable.lot present), not only when the isRelease toggle is on; falls back to lot.units when releaseUnits is not set.' },
    ],
  },
  {
    version: '1.0.6.7',
    date: '2026-11-16',
    items: [
      { area: 'Task List', text: 'Add Task now works correctly: the new task card opens immediately after creation for editing.' },
      { area: 'Task List', text: 'Opening the Actions toolbar while in Executive View automatically switches to Operations View, ensuring newly created tasks are visible.' },
      { area: 'Task Card', text: 'Batch Configuration: when all planned units are already scheduled (Total Units = 0), # Batches defaults to 0 to prevent accidental over-scheduling.' },
      { area: 'Task Card', text: 'Collapsed Task Details now shows the Units field between WBS and Gate/Task for shipment tasks (Ship toggle on or Release Units > 0).' },
      { area: 'WO Report', text: 'LOT Schedule: Shipment column now shows units actually delivered (sum of completed batches); Total Units shows the planned quantity per LOT.' },
      { area: 'WO Report', text: 'LOT Schedule drill-down: LOTs with Step Task batches show an expand button (▸ N) in the LOT # column to reveal individual batch rows — WBS, units, status, target date, and batch vs. LOT totals.' },
      { area: 'Subprocess', text: 'Save button in Subprocess Workspace now shows inline status (Saving… / Saved / Save failed) instead of a separate badge, keeping the toolbar compact.' },
      { area: 'Data', text: 'Release records now include WBS and LOT number (lotNo), enabling accurate traceability between shipments and PO delivery lots for invoicing.' },
      { area: 'Task Card', text: 'Ship detection no longer overrides a manually-set Release Units value; the auto-fill from the subtask name only applies when Release Units is not yet set.' },
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
