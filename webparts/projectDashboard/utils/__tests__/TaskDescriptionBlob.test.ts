import { buildTaskJsonTable, getTaskReleaseUnits, getTaskSteps, getTaskSubprocess } from '../TaskDescriptionBlob';

describe('TaskDescriptionBlob subprocess support', () => {
  it('normalizes legacy subprocess entries and preserves embedded logs', () => {
    const raw = JSON.stringify({
      sortOrder: 7,
      subprocess: {
        subTasks: [
          {
            id: 'b',
            wbs: '1.02',
            sortOrder: 4,
            task: 'Second',
            complete: '100',
            start: '2026-05-01',
            finish: '2026-05-02',
            actualFinish: '2026-05-03',
            notes: [{ date: '2026-05-03', user: 'Saul', note: 'Done' }],
            evidence: [{ date: '2026-05-03', user: 'Saul', fileName: 'proof.pdf', fileUrl: '/proof.pdf', isEvidenceOfCompletion: true }],
            approvals: [{ date: '2026-05-03', user: 'QA', status: 'approved', comment: 'ok' }],
          },
          {
            id: 'a',
            wbs: '1.01',
            sortOrder: 1,
            task: 'First',
            complete: 0,
            start: '2026-05-01',
            finish: '2026-05-01',
            notes: 'invalid',
          },
        ],
      },
    });

    const parsed = getTaskSubprocess(raw);

    expect(parsed.subTasks).toHaveLength(2);
    expect(parsed.subTasks[0]).toMatchObject({
      id: 'a',
      task: 'First',
      sortOrder: 0,
      notes: [],
      evidence: [],
      approvals: [],
    });
    expect(parsed.subTasks[1]).toMatchObject({
      id: 'b',
      task: 'Second',
      sortOrder: 1,
      complete: 100,
    });
    expect(parsed.subTasks[1].notes?.[0].note).toBe('Done');
    expect(parsed.subTasks[1].evidence?.[0].isEvidenceOfCompletion).toBe(true);
    expect(parsed.subTasks[1].approvals?.[0].status).toBe('approved');
  });

  it('serializes subprocess entries in sort order', () => {
    const next = buildTaskJsonTable(undefined, {
      subprocess: {
        subTasks: [
          {
            id: 'second',
            wbs: '1.02',
            sortOrder: 2,
            task: 'Second',
            complete: 10,
            start: '2026-05-02',
            finish: '2026-05-03',
          },
          {
            id: 'first',
            wbs: '1.01',
            sortOrder: 0,
            task: 'First',
            complete: 20,
            start: '2026-05-01',
            finish: '2026-05-02',
          },
        ],
      },
    });

    const parsed = JSON.parse(next || '{}');
    expect(parsed.subprocess.subTasks[0].id).toBe('first');
    expect(parsed.subprocess.subTasks[0].sortOrder).toBe(0);
    expect(parsed.subprocess.subTasks[1].id).toBe('second');
    expect(parsed.subprocess.subTasks[1].sortOrder).toBe(1);
  });

  it('persists and resolves release metadata in jsonTable', () => {
    const next = buildTaskJsonTable(undefined, {
      isRelease: true,
      releaseUnits: 7,
    });

    const parsed = JSON.parse(next || '{}');
    expect(parsed.isRelease).toBe(true);
    expect(parsed.releaseUnits).toBe(7);
    expect(getTaskReleaseUnits(next)).toBe(7);
  });

  it('persists and resolves task steps with nested subprocess data', () => {
    const next = buildTaskJsonTable(undefined, {
      taskSteps: {
        enabled: true,
        totalUnits: 100,
        unitsPerStep: 20,
        stepCount: 2,
        steps: [
          {
            id: 'step-2',
            wbs: '1.0.02',
            sortOrder: 3,
            title: 'Lot 2',
            units: 80,
            complete: 50,
            start: '2026-04-09',
            finish: '2026-04-10',
          },
          {
            id: 'step-1',
            wbs: '1.0.01',
            sortOrder: 1,
            title: 'Lot 1',
            units: 20,
            complete: 25,
            start: '2026-04-08',
            finish: '2026-04-08',
            subprocess: {
              subTasks: [
                {
                  id: 'sp-2',
                  wbs: '1.0.01.02',
                  sortOrder: 5,
                  task: 'Ship',
                  complete: 0,
                  start: '2026-04-08',
                  finish: '2026-04-08',
                },
                {
                  id: 'sp-1',
                  wbs: '1.0.01.01',
                  sortOrder: 1,
                  task: 'Prep',
                  complete: 100,
                  start: '2026-04-08',
                  finish: '2026-04-08',
                  notes: [{ date: '2026-04-08', user: 'Ops', note: 'Prepared' }],
                  evidence: [{ date: '2026-04-08', user: 'Ops', fileName: 'prep.pdf', fileUrl: '/prep.pdf', isEvidenceOfCompletion: true }],
                  approvals: [{ date: '2026-04-08', user: 'QA', email: 'qa@example.com', status: 'approved', comment: 'ready' }],
                },
              ],
            },
          },
        ],
      },
    });

    const parsed = getTaskSteps(next);

    expect(parsed.enabled).toBe(true);
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.steps[0]).toMatchObject({
      id: 'step-1',
      sortOrder: 0,
      units: 20,
    });
    expect(parsed.steps[0].subprocess?.subTasks).toHaveLength(2);
    expect(parsed.steps[0].subprocess?.subTasks[0]).toMatchObject({
      id: 'sp-1',
      sortOrder: 0,
      complete: 100,
    });
    expect(parsed.steps[0].subprocess?.subTasks[0].notes?.[0].note).toBe('Prepared');
    expect(parsed.steps[0].subprocess?.subTasks[0].evidence?.[0].isEvidenceOfCompletion).toBe(true);
    expect(parsed.steps[0].subprocess?.subTasks[0].approvals?.[0].status).toBe('approved');
    expect(parsed.steps[0].subprocess?.subTasks[1]).toMatchObject({
      id: 'sp-2',
      sortOrder: 1,
      complete: 0,
    });
    expect(parsed.steps[1]).toMatchObject({
      id: 'step-2',
      sortOrder: 1,
      units: 80,
      complete: 50,
    });
  });

  it('preserves sibling persistence branches when updating subprocess or task steps', () => {
    const raw = buildTaskJsonTable(undefined, {
      subprocess: {
        subTasks: [{
          id: 'parent-sp-1',
          wbs: '1.0.01',
          sortOrder: 0,
          task: 'Parent subprocess',
          complete: 10,
          start: '2026-04-08',
          finish: '2026-04-08',
          notes: [{ date: '2026-04-08', user: 'Ops', note: 'Parent note' }],
        }],
      },
      taskSteps: {
        enabled: true,
        totalUnits: 20,
        unitsPerStep: 10,
        stepCount: 2,
        steps: [{
          id: 'step-1',
          wbs: '1.0.01',
          sortOrder: 0,
          title: 'Lot 1',
          units: 10,
          complete: 50,
          start: '2026-04-08',
          finish: '2026-04-08',
          subprocess: {
            subTasks: [{
              id: 'step-sp-1',
              wbs: '1.0.01.01',
              sortOrder: 0,
              task: 'Step subprocess',
              complete: 25,
              start: '2026-04-08',
              finish: '2026-04-08',
              evidence: [{ date: '2026-04-08', user: 'Ops', fileName: 'step.pdf', fileUrl: '/step.pdf' }],
            }],
          },
        }],
      },
    });

    const subprocessOnlyUpdate = buildTaskJsonTable(raw, {
      subprocess: {
        subTasks: [{
          id: 'parent-sp-1',
          wbs: '1.0.01',
          sortOrder: 0,
          task: 'Parent subprocess updated',
          complete: 100,
          start: '2026-04-08',
          finish: '2026-04-08',
        }],
      },
    });
    const preservedSteps = getTaskSteps(subprocessOnlyUpdate);
    expect(getTaskSubprocess(subprocessOnlyUpdate).subTasks[0].task).toBe('Parent subprocess updated');
    expect(preservedSteps.steps[0].subprocess?.subTasks[0].evidence?.[0].fileName).toBe('step.pdf');

    const taskStepsOnlyUpdate = buildTaskJsonTable(subprocessOnlyUpdate, {
      taskSteps: {
        ...preservedSteps,
        steps: preservedSteps.steps.map(step => ({
          ...step,
          complete: 75,
        })),
      },
    });

    expect(getTaskSubprocess(taskStepsOnlyUpdate).subTasks[0].complete).toBe(100);
    expect(getTaskSteps(taskStepsOnlyUpdate).steps[0].complete).toBe(75);
  });
});
