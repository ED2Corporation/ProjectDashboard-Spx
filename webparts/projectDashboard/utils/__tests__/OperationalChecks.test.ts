import { ITaskListItem } from '../../../../models';
import { checkTaskSave, lotIssues, OpFix, sizingIssues, validateProject } from '../OperationalChecks';
import { buildFixPayloads } from '../OperationalFixes';

const task = (id: string, wbs: string, complete: number, start: string, finish: string, json: Record<string, unknown> = {}): ITaskListItem => ({
  Id: id, Title: wbs, Gate: 'G', Task: `Task ${wbs}`, Complete: complete,
  Start: start as unknown as Date, Finish: finish as unknown as Date,
  jsonTable: JSON.stringify(json),
});

const messages = (tasks: ITaskListItem[]): string[] => validateProject(tasks, {}).map(i => i.message);

describe('OperationalChecks — dependencies in execution (progress)', () => {
  it('warns on every pending predecessor in one message, per link type', () => {
    const tasks = [
      task('1', '1.01', 50, '2026-11-02', '2026-11-06'),
      task('2', '1.02', 0, '2026-11-02', '2026-11-06'),
      task('3', '1.03', 10, '2026-11-09', '2026-11-13', { deps: ['1', '2'], depTypes: { '2': 'SS' } }),
    ];
    const progress = validateProject(tasks, {}).find(i => i.key === 'dep-progress|3');
    expect(progress?.message).toBe(
      'FS dependency with task 1.01: it is not complete yet. SS dependency with task 1.02: it has not started yet.'
    );
  });

  it('checks FF and SF when the successor reaches 100', () => {
    const tasks = [
      task('1', '1.01', 50, '2026-11-02', '2026-11-06'),
      task('2', '1.02', 0, '2026-11-02', '2026-11-06'),
      task('3', '1.03', 100, '2026-11-02', '2026-11-06', { deps: ['1', '2'], depTypes: { '1': 'FF', '2': 'SF' } }),
    ];
    const progress = validateProject(tasks, {}).find(i => i.key === 'dep-progress|3');
    expect(progress?.message).toBe(
      'FF dependency with task 1.01: it is not complete yet. SF dependency with task 1.02: it has not started yet.'
    );
  });

  it('resolves sibling and cross-task subtask tokens; unknown types are FS', () => {
    const tasks = [
      task('7', '2.01', 0, '2026-11-02', '2026-11-06', { subprocess: { subTasks: [
        { id: 'sp-a', wbs: '2.01.01', complete: 0, start: '2026-11-02', finish: '2026-11-03' },
        { id: 'sp-b', wbs: '2.01.02', complete: 20, start: '2026-11-04', finish: '2026-11-06', deps: ['sp-a'], depTypes: { 'sp-a': 'XX' } },
      ] } }),
      task('8', '2.02', 5, '2026-11-09', '2026-11-13', { deps: ['7:sp-a'] }),
    ];
    const all = messages(tasks);
    expect(all).toContain('FS dependency with task 2.01.01: it is not complete yet.');
    expect(validateProject(tasks, {}).find(i => i.key === 'dep-progress|8')?.message)
      .toBe('FS dependency with task 2.01.01: it is not complete yet.');
  });
});

describe('OperationalChecks — date rules', () => {
  it('flags each link type and offers a leaf fix that keeps the working-day duration', () => {
    const tasks = [
      task('1', '1.01', 0, '2026-11-02', '2026-11-06'),                                   // Mon–Fri
      task('2', '1.02', 0, '2026-11-05', '2026-11-09', { deps: ['1'] }),                  // FS broken
      task('3', '1.03', 0, '2026-11-03', '2026-11-04', { deps: ['1'], depTypes: { '1': 'SS' } }),
      task('4', '1.04', 0, '2026-11-02', '2026-11-05', { deps: ['1'], depTypes: { '1': 'FF' } }),
      task('5', '1.05', 0, '2026-10-26', '2026-10-30', { deps: ['1'], depTypes: { '1': 'SF' } }),
    ];
    const issues = validateProject(tasks, {});
    const fs = issues.find(i => i.key === 'dep-date|2|1');
    expect(fs?.message).toBe('FS dependency with task 1.01: 1.02 starts 11/5/26, not after 1.01 finishes 11/6/26.');
    expect(fs?.fix).toEqual({ kind: 'task-dates', taskId: '2', start: '2026-11-09', finish: '2026-11-11' });
    expect(issues.find(i => i.key === 'dep-date|3|1')?.fix).toEqual({ kind: 'task-dates', taskId: '3', start: '2026-11-02', finish: '2026-11-03' });
    expect(issues.find(i => i.key === 'dep-date|4|1')?.fix).toEqual({ kind: 'task-dates', taskId: '4', start: '2026-11-03', finish: '2026-11-06' });
    expect(issues.find(i => i.key === 'dep-date|5|1')?.message).toContain('SF dependency with task 1.01');
  });

  it('reports baseline slip in working days and a lot finishing after its ETA', () => {
    const tasks = [task('1', '1.01', 0, '2026-11-02', '2026-11-13', {
      taskSchedule: { baseline: { finish: '2026-11-09' } },
      lot: { lotNo: 2, position: 2, eta: '2026-11-10', units: 20 },
    })];
    const all = messages(tasks);
    expect(all).toContain('Finishes 11/13/26, 4 working days after its baseline 11/9/26.');
    expect(all).toContain('LOT 2 finishes 11/13/26, after its delivery date 11/10/26.');
  });
});

describe('OperationalChecks — sizing', () => {
  it('warns when batches differ from the planned units and when totalUnits is 0', () => {
    const t = task('1', '1.01', 0, '', '', {
      subprocess: { units: 40, subTasks: [] },
      taskSteps: { totalUnits: 0, steps: [{ id: 's1', units: 10 }, { id: 's2', units: 20 }] },
    });
    const issues = sizingIssues(t);
    expect(issues.map(i => i.message)).toEqual([
      'Batches total 30 units; the task is planned for 40.',
      'Batch total units is 0 while 2 batches exist (sum 30).',
    ]);
    expect(issues[1].fix).toEqual({ kind: 'steps-total-units', taskId: '1', totalUnits: 30 });
  });
});

describe('OperationalChecks — lots and releases', () => {
  const projectDetails = JSON.stringify({ lots: [
    { lotNo: 1, units: 50, builtUnits: 60 },
    { lotNo: 2, units: 50 },
  ] });

  it('compares planned against the WO Units and releases against each lot', () => {
    const issues = lotIssues({
      units: 100, projectDetails,
      releases: [
        { id: 'r1', date: '', units: 40, approvedBy: '', taskId: '1', taskTitle: '', lotNo: 2 },
        { id: 'r2', date: '', units: 20, approvedBy: '', taskId: '1', taskTitle: '', lotNo: 2 },
        { id: 'r3', date: '', units: 50, approvedBy: '', taskId: '1', taskTitle: '' },
      ],
    });
    expect(issues.map(i => i.message)).toEqual([
      'Planned 110 - PO 100',
      'LOT 1 planned 60, PO row 50.',
      'LOT 2 released 60 of 50.',
      'WO released 110 of 100 units.',
    ]);
  });
});

describe('OperationalChecks — save guard', () => {
  const tasks = [
    task('1', '1.01', 50, '2026-11-02', '2026-11-06'),
    task('2', '1.02', 0, '2026-11-09', '2026-11-13', { deps: ['1'] }),
  ];

  it('warns on the transition only', () => {
    expect(checkTaskSave(tasks, tasks[1], { Complete: 10 })).toEqual(['1.02: FS dependency with task 1.01: it is not complete yet.']);
    const started = { ...tasks[1], Complete: 10 };
    expect(checkTaskSave([tasks[0], started], started, { Complete: 20 })).toEqual([]);
  });

  it('checks the links of an item whose dates change, from both sides', () => {
    expect(checkTaskSave(tasks, tasks[0], { Finish: '2026-11-10' })).toEqual([
      '1.01: FS dependency with task 1.02: 1.02 starts 11/9/26, not after 1.01 finishes 11/10/26.',
    ]);
  });
});

describe('OperationalFixes', () => {
  it('builds one payload per task, the latest start controls, and plan keys survive', () => {
    const t = task('9', '3.01', 0, '2026-11-02', '2026-11-13', { deps: ['4'], subprocess: { units: 10, subTasks: [
      { id: 'sp-1', wbs: '3.01.01', complete: 0, start: '2026-11-02', finish: '2026-11-03', effortPerUnit: 2, deps: ['5:sp-2'] },
    ] } });
    const fixes: OpFix[] = [
      { kind: 'subtask-dates', taskId: '9', subtaskId: 'sp-1', start: '2026-11-04', finish: '2026-11-05' },
      { kind: 'subtask-dates', taskId: '9', subtaskId: 'sp-1', start: '2026-11-06', finish: '2026-11-09' },
    ];
    const payloads = buildFixPayloads([t], fixes);
    expect(payloads).toHaveLength(1);
    const json = JSON.parse(payloads[0].jsonTable);
    expect(json.deps).toEqual(['4']);
    expect(json.subprocess.units).toBe(10);
    expect(json.subprocess.subTasks[0]).toMatchObject({ start: '2026-11-06', finish: '2026-11-09', effortPerUnit: 2, deps: ['5:sp-2'] });
  });
});
