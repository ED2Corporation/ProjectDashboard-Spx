/**
 * @jest-environment jsdom
 */
jest.mock('../NotesLog', () => () => <div data-testid="NotesLog">NotesLog</div>);
jest.mock('../EvidenceLog', () => () => <div data-testid="EvidenceLog">EvidenceLog</div>);
jest.mock('../ApprovalsLog', () => () => <div data-testid="ApprovalsLog">ApprovalsLog</div>);

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import TaskCard from '../TaskCard';
import { ITaskListItem } from '../../../../models';

describe('TaskCard', () => {
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
    Deliverable: 'Package',
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
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [, payload] = onSave.mock.calls[0];
    expect(JSON.parse(payload)).toEqual(expect.objectContaining({
      Id: 'task-1',
      Task: 'Updated task',
      Title: '1.0',
      Gate: 'Gate A',
    }));
  });
});
