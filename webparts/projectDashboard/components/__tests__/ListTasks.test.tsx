/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

    await userEvent.click(screen.getAllByTitle('Add / New row')[0]);
    await userEvent.click(screen.getAllByTitle('Delete task')[0]);

    expect(onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ Id: '1' }), 'task', 'list-create');
    expect(onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ Id: '1' }), 'task', 'list-delete');
  });
});
