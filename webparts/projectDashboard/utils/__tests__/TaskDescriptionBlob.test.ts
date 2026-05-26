import { buildTaskJsonTable, getTaskReleaseUnits, getTaskSubprocess } from '../TaskDescriptionBlob';

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
});
