/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ListTasks from '../ListTasks';
import { ITaskListItem } from '../../../../models';

describe('ListTasks', () => {
  const tasks: ITaskListItem[] = [
    {
      Id: '2',
      Title: '2.0',
      Gate: 'Gate A',
      Task: 'Zulu task',
      Complete: 50,
      Start: new Date('2026-04-10'),
      Finish: new Date('2026-04-12'),
      Evidence: [],
    },
    {
      Id: '1',
      Title: '1.0',
      Gate: 'Gate A',
      Task: 'Alpha task',
      Complete: 0,
      Start: new Date('2026-04-08'),
      Finish: new Date('2026-04-09'),
      Evidence: [],
    },
  ] as unknown as ITaskListItem[];

  it('reports sorted tasks to the parent and supports task filtering', async () => {
    const onSortedTasksChange = jest.fn();

    render(
      <ListTasks
        tasks={tasks}
        heading="Gate A"
        showDetails={true}
        onSave={jest.fn()}
        onSelectItem={jest.fn()}
        onSortedTasksChange={onSortedTasksChange}
      />
    );

    await waitFor(() => expect(onSortedTasksChange).toHaveBeenCalled());
    const latestCall = onSortedTasksChange.mock.calls[onSortedTasksChange.mock.calls.length - 1];
    expect(latestCall?.[0].map((task: ITaskListItem) => task.Id)).toEqual(['1', '2']);

    await userEvent.type(screen.getByPlaceholderText(/Filter/i), 'zulu');

    expect(screen.getByText('Zulu task')).toBeInTheDocument();
    expect(screen.queryByText('Alpha task')).not.toBeInTheDocument();
  });

  it('triggers create and delete actions from the row controls', async () => {
    const onSelectItem = jest.fn();
    // eslint-disable-next-line no-alert
    window.confirm = jest.fn().mockReturnValue(true);

    render(
      <ListTasks
        tasks={tasks}
        heading="Gate A"
        showDetails={true}
        onSave={jest.fn()}
        onSelectItem={onSelectItem}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Show action toolbar/i }));
    const firstTaskRow = screen.getByText('Alpha task').closest('tr') as HTMLTableRowElement;

    await userEvent.click(within(firstTaskRow).getByRole('button', { name: /Add task/i }));
    await userEvent.click(within(firstTaskRow).getByRole('button', { name: /Remove/i }));

    expect(onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ Id: '1' }), 'task', 'list-create');
    expect(onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ Id: '1' }), 'task', 'list-delete');
  });

  it('marks incomplete tasks as complete and opens quick update for completed tasks', async () => {
    const onSave = jest.fn();
    const mixedTasks = [
      tasks[1],
      { ...tasks[0], Complete: 100 },
    ] as ITaskListItem[];

    render(
      <ListTasks
        tasks={mixedTasks}
        heading="Gate A"
        showDetails={true}
        onSave={onSave}
        onSelectItem={jest.fn()}
      />
    );

    const incompleteRow = screen.getByText('Alpha task').closest('tr') as HTMLTableRowElement;
    await userEvent.click(within(incompleteRow).getByRole('button', { name: /Mark complete/i }));

    expect(onSave).toHaveBeenCalledWith('1', expect.any(String));
    const payload = JSON.parse(onSave.mock.calls[0][1]);
    expect(payload.Complete).toBe(100);
    expect(payload.ActualFinish).toBeTruthy();

    const completeRow = screen.getByText('Zulu task').closest('tr') as HTMLTableRowElement;
    await userEvent.click(within(completeRow).getByRole('button', { name: /Open quick update/i }));

    expect(within(completeRow).getByPlaceholderText('Task title')).toHaveValue('Zulu task');
  });

  it('expands the actions toolbar from the header toggle', async () => {
    const onSelectItem = jest.fn();

    render(
      <ListTasks
        tasks={tasks}
        heading="Gate A"
        showDetails={true}
        onSave={jest.fn()}
        onSelectItem={onSelectItem}
      />
    );

    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Filter/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Show action toolbar/i }));

    expect(screen.queryByPlaceholderText(/Filter/i)).not.toBeInTheDocument();
    const firstTaskRow = screen.getByText('Alpha task').closest('tr') as HTMLTableRowElement;
    expect(within(firstTaskRow).getByRole('button', { name: /Move last/i })).toBeInTheDocument();
    expect(within(firstTaskRow).getByRole('button', { name: /Upload Evidence of Completion/i })).toBeInTheDocument();
    expect(within(firstTaskRow).getByRole('button', { name: /Mark complete/i })).toBeInTheDocument();
  });

  it('shows gate step separators when all gates are displayed', () => {
    render(
      <ListTasks
        tasks={[
          ...tasks,
          {
            Id: '3',
            Title: '1.0',
            Gate: 'Gate B',
            Task: 'Beta task',
            Complete: 0,
            Start: new Date('2026-04-13'),
            Finish: new Date('2026-04-14'),
            Evidence: [],
          },
        ] as ITaskListItem[]}
        heading="All Tasks"
        showDetails={true}
        showGateSeparators={true}
        onSave={jest.fn()}
        onSelectItem={jest.fn()}
      />
    );

    const betaRow = screen.getByText('Beta task').closest('tr') as HTMLTableRowElement;
    expect(betaRow).toHaveClass('gateStepRow');
  });
});
