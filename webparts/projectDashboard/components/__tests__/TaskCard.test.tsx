/**
 * @jest-environment jsdom
 */
jest.mock('../NotesLog', () => () => <div data-testid="NotesLog">NotesLog</div>);
jest.mock('../EvidenceLog', () => () => <div data-testid="EvidenceLog">EvidenceLog</div>);
jest.mock('../ApprovalsLog', () => () => <div data-testid="ApprovalsLog">ApprovalsLog</div>);

import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import TaskCard from '../TaskCard';
import { ITaskListItem } from '../../../../models';

describe('TaskCard', () => {
  const clickTaskSave = async (): Promise<void> => {
    let saveButtons = screen.queryAllByRole('button', { name: 'Save' });
    if (saveButtons.length === 0) {
      const expandDetails = screen.queryByRole('button', { name: 'Expand task card details' });
      if (expandDetails) {
        await userEvent.click(expandDetails);
      }
      saveButtons = screen.getAllByRole('button', { name: 'Save' });
    }
    await userEvent.click(saveButtons[0]);
  };

  const openSubprocessWorkspace = async (): Promise<HTMLElement> => {
    const addSubprocess = screen.queryByRole('button', { name: 'Add Subprocess' });
    if (addSubprocess) {
      await userEvent.click(addSubprocess);
    }
    return screen.getByTestId('subprocess-workspace');
  };

  const task: ITaskListItem = {
    Id: 'task-1',
    Title: '1.0',
    Gate: 'Gate A',
    Task: 'Review drawing',
    Complete: 100,
    Start: new Date('2026-04-08'),
    Finish: new Date('2026-04-10'),
    Evidence: [],
    Notes: [],
  };

  it('shows Save and Close as explicit text actions', () => {
    render(
      <TaskCard
        task={task}
        onDelete={jest.fn()}
        onNew={jest.fn()}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();
  });

  it('warns when a completed task has no evidence of completion and saves edited data', async () => {
    const onSave = jest.fn();

    render(
      <TaskCard
        task={task}
        onDelete={jest.fn()}
        onNew={jest.fn()}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText(/No file is marked as Evidence of Completion/i)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Task'));
    await userEvent.type(screen.getByLabelText('Task'), 'Updated task');
    await clickTaskSave();

    expect(onSave).toHaveBeenCalledTimes(1);
    const [, payload] = onSave.mock.calls[0];
    expect(JSON.parse(payload)).toEqual(expect.objectContaining({
      Id: 'task-1',
      Task: 'Updated task',
      Title: '1.0',
      Gate: 'Gate A',
    }));
  });

  it('persists release configuration in jsonTable when the task is marked as release', async () => {
    const onSave = jest.fn();

    render(
      <TaskCard
        task={{ ...task, Complete: 0, jsonTable: undefined }}
        remainingReleaseUnits={12}
        onDelete={jest.fn()}
        onNew={jest.fn()}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /Ship/i }));
    expect(screen.getByLabelText('Release Units')).toHaveValue(12);
    await clickTaskSave();

    const [, payload] = onSave.mock.calls[0];
    const parsed = JSON.parse(payload);
    const jsonTable = JSON.parse(parsed.jsonTable);

    expect(jsonTable.isRelease).toBe(true);
    expect(jsonTable.releaseUnits).toBe(12);
  });

  it('clears release configuration when ship is turned off and saved', async () => {
    const onSave = jest.fn();

    render(
      <TaskCard
        task={{
          ...task,
          Complete: 0,
          isRelease: true,
          releaseUnits: 5,
          jsonTable: JSON.stringify({ isRelease: true, releaseUnits: 5 }),
          Description: JSON.stringify({ isRelease: true, releaseUnits: 5 }),
        }}
        remainingReleaseUnits={12}
        onDelete={jest.fn()}
        onNew={jest.fn()}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /Ship/i }));
    await clickTaskSave();

    const [, payload] = onSave.mock.calls[0];
    const parsed = JSON.parse(payload);
    expect(parsed.isRelease).toBe(false);
    expect(parsed.releaseUnits).toBe(0);
    expect(parsed.jsonTable).toBe('');
    expect(parsed.Description).toBe(JSON.stringify({ isRelease: true, releaseUnits: 5 }));
  });

  it('blocks save when a release task has invalid release units', async () => {
    const onSave = jest.fn();
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(
      <TaskCard
        task={{ ...task, Complete: 0, jsonTable: undefined }}
        remainingReleaseUnits={0}
        onDelete={jest.fn()}
        onNew={jest.fn()}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /Ship/i }));
    await clickTaskSave();

    expect(alertSpy).toHaveBeenCalledWith('Release Units must be greater than 0 for a release task.');
    expect(onSave).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('persists subprocess rows into jsonTable when saving the parent task', async () => {
    const onSave = jest.fn();

    render(
      <TaskCard
        task={{ ...task, Complete: 0, jsonTable: undefined }}
        onDelete={jest.fn()}
        onNew={jest.fn()}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    const workspace = await openSubprocessWorkspace();

    await userEvent.click(within(workspace).getByRole('button', { name: /\+ Add Subtask/i }));
    const quickEditInput = within(workspace).getByPlaceholderText('Subtask title');
    await userEvent.clear(quickEditInput);
    await userEvent.type(quickEditInput, 'Create checklist');
    await userEvent.click(within(workspace).getByRole('button', { name: /Save quick edit/i }));

    await clickTaskSave();

    const [, payload] = onSave.mock.calls[0];
    const parsed = JSON.parse(payload);
    const jsonTable = JSON.parse(parsed.jsonTable);

    expect(jsonTable.subprocess.subTasks).toHaveLength(1);
    expect(jsonTable.subprocess.subTasks[0]).toEqual(expect.objectContaining({
      wbs: '1.0.01',
      sortOrder: 0,
    }));
  });

  it('persists subprocess detail edits into jsonTable when saving the parent task', async () => {
    const onSave = jest.fn();

    render(
      <TaskCard
        task={{
          ...task,
          Complete: 0,
          jsonTable: JSON.stringify({
            subprocess: {
              subTasks: [
                {
                  id: 'sp-1',
                  wbs: '1.0.01',
                  sortOrder: 0,
                  task: 'Legacy subtask',
                  complete: 0,
                  start: '2026-04-08',
                  finish: '2026-04-10',
                },
              ],
            },
          }),
        }}
        onDelete={jest.fn()}
        onNew={jest.fn()}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    const workspace = await openSubprocessWorkspace();
    await userEvent.click(within(workspace).getByText('Legacy subtask'));

    const detailCard = screen.getByTestId('subprocess-detail-card');
    const taskInputs = within(detailCard).getAllByRole('textbox');
    await userEvent.clear(taskInputs[0]);
    await userEvent.type(taskInputs[0], 'Updated subtask detail');
    await userEvent.click(within(detailCard).getByRole('button', { name: 'Save' }));

    await clickTaskSave();

    const [, payload] = onSave.mock.calls[0];
    const parsed = JSON.parse(payload);
    const jsonTable = JSON.parse(parsed.jsonTable);

    expect(jsonTable.subprocess.subTasks[0]).toEqual(expect.objectContaining({
      id: 'sp-1',
      task: 'Updated subtask detail',
      wbs: '1.0.01',
    }));
  });

  it('persists generated Step Task lots immediately when Create Lots is clicked', async () => {
    const onSave = jest.fn();

    render(
      <TaskCard
        task={{
          ...task,
          Complete: 0,
          Start: new Date('2026-04-08'),
          Finish: new Date('2026-04-10'),
          jsonTable: JSON.stringify({
            taskSteps: {
              enabled: true,
              totalUnits: 60,
              unitsPerStep: 30,
              stepCount: 0,
              mode: 'fixed',
              steps: [],
            },
          }),
        }}
        projectUnits={60}
        onDelete={jest.fn()}
        onNew={jest.fn()}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Lots/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [, payload] = onSave.mock.calls[0];
    const parsed = JSON.parse(payload);
    const jsonTable = JSON.parse(parsed.jsonTable);

    expect(jsonTable.taskSteps.enabled).toBe(true);
    expect(jsonTable.taskSteps.steps).toHaveLength(2);
    expect(jsonTable.taskSteps.steps[0]).toEqual(expect.objectContaining({
      title: 'Review drawing - Step 1',
      units: 30,
      wbs: '1.0.01',
    }));
  });

  it('aggregates parent task complete from direct subprocess subtasks', async () => {
    const onSave = jest.fn();

    render(
      <TaskCard
        task={{
          ...task,
          Complete: 0,
          jsonTable: JSON.stringify({
            subprocess: {
              subTasks: [
                {
                  id: 'sp-1',
                  wbs: '1.0.01',
                  sortOrder: 0,
                  task: 'First',
                  duration: 1,
                  complete: 100,
                  start: '2026-04-08',
                  finish: '2026-04-08',
                },
                {
                  id: 'sp-2',
                  wbs: '1.0.02',
                  sortOrder: 1,
                  task: 'Second',
                  duration: 3,
                  complete: 0,
                  start: '2026-04-09',
                  finish: '2026-04-10',
                },
              ],
            },
          }),
        }}
        onDelete={jest.fn()}
        onNew={jest.fn()}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    await clickTaskSave();

    const [, payload] = onSave.mock.calls[0];
    const parsed = JSON.parse(payload);
    expect(parsed.Complete).toBe(25);
  });

  it('aggregates subprocess, Step Tasks, and parent task complete in cascade', async () => {
    const onSave = jest.fn();

    render(
      <TaskCard
        task={{
          ...task,
          Complete: 0,
          jsonTable: JSON.stringify({
            taskSteps: {
              enabled: true,
              totalUnits: 100,
              unitsPerStep: 20,
              stepCount: 2,
              steps: [
                {
                  id: 'step-1',
                  wbs: '1.0.01',
                  sortOrder: 0,
                  title: 'Lot 1',
                  units: 20,
                  complete: 0,
                  start: '2026-04-08',
                  finish: '2026-04-08',
                  subprocess: {
                    subTasks: [
                      {
                        id: 'sp-1',
                        wbs: '1.0.01.01',
                        sortOrder: 0,
                        task: 'Prep',
                        duration: 1,
                        complete: 100,
                        start: '2026-04-08',
                        finish: '2026-04-08',
                      },
                      {
                        id: 'sp-2',
                        wbs: '1.0.01.02',
                        sortOrder: 1,
                        task: 'Ship',
                        duration: 3,
                        complete: 0,
                        start: '2026-04-08',
                        finish: '2026-04-08',
                      },
                    ],
                  },
                },
                {
                  id: 'step-2',
                  wbs: '1.0.02',
                  sortOrder: 1,
                  title: 'Lot 2',
                  units: 80,
                  complete: 50,
                  start: '2026-04-09',
                  finish: '2026-04-10',
                },
              ],
            },
          }),
        }}
        projectUnits={100}
        onDelete={jest.fn()}
        onNew={jest.fn()}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    await clickTaskSave();

    const [, payload] = onSave.mock.calls[0];
    const parsed = JSON.parse(payload);
    const jsonTable = JSON.parse(parsed.jsonTable);

    expect(jsonTable.taskSteps.steps[0].complete).toBe(25);
    expect(jsonTable.taskSteps.steps[1].complete).toBe(50);
    expect(parsed.Complete).toBe(45);
  });

  it('preserves recovered Step Task subprocess rows when parent fields change before save', async () => {
    const onSave = jest.fn();

    render(
      <TaskCard
        task={{
          ...task,
          Complete: 0,
          jsonTable: JSON.stringify({
            taskSteps: {
              enabled: true,
              totalUnits: 160,
              unitsPerStep: 20,
              stepCount: 1,
              mode: 'weekday',
              weekdays: [2, 5],
              steps: [
                {
                  id: 'step-1',
                  wbs: '4.03.01',
                  sortOrder: 0,
                  title: 'LOT 3a - Package 1',
                  units: 20,
                  complete: 0,
                  start: '2026-11-20',
                  finish: '2026-11-20',
                  actualFinish: '',
                  notes: [],
                  evidence: [],
                  approvals: [],
                  subprocess: {
                    subTasks: [
                      {
                        id: 'sp-step-1',
                        wbs: '4.03.01.01',
                        sortOrder: 0,
                        task: 'Upload BOM',
                        duration: 1,
                        complete: 0,
                        start: '2026-07-24',
                        finish: '2026-07-24',
                        actualFinish: '',
                        notes: [],
                        evidence: [],
                        approvals: [],
                      },
                    ],
                  },
                },
              ],
            },
          }),
        }}
        projectUnits={160}
        onDelete={jest.fn()}
        onNew={jest.fn()}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Expand task card details' }));
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-04-09' } });
    await clickTaskSave();

    const [, payload] = onSave.mock.calls[0];
    const parsed = JSON.parse(payload);
    const jsonTable = JSON.parse(parsed.jsonTable);

    expect(jsonTable.taskSteps.steps[0].subprocess.subTasks).toHaveLength(1);
    expect(jsonTable.taskSteps.steps[0].subprocess.subTasks[0]).toEqual(expect.objectContaining({
      id: 'sp-step-1',
      task: 'Upload BOM',
      complete: 0,
    }));
  });
});
