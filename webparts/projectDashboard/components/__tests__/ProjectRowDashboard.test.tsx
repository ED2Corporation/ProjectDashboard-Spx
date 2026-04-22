/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ProjectRowDashboard from '../ProjectRowDashboard';
import { IProjectCatalogItem } from '../../../../models/IProjectService';

const mockUseProjectState = jest.fn();
const mockGetBucketStatus = jest.fn();

jest.mock('../../hooks/useProjectState', () => ({
  useProjectState: (...args: unknown[]) => mockUseProjectState(...args),
}));

jest.mock('../../utils/GetGateStatus', () => ({
  GetBucketStatus: (...args: unknown[]) => mockGetBucketStatus(...args),
}));

jest.mock('../../services/ProjectService', () => ({
  ProjectService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../GateProgressBar', () => (props: { onSettingsClick?: () => void }) => (
  <button type="button" onClick={props.onSettingsClick}>Open settings</button>
));

jest.mock('../ProjectActionsBar', () => () => <div data-testid="ProjectActionsBar">ProjectActionsBar</div>);
jest.mock('../ProjectCatalogEditor', () => () => <div data-testid="ProjectCatalogEditor">ProjectCatalogEditor</div>);
jest.mock('../ListTasks', () => () => <div data-testid="ListTasks">ListTasks</div>);
jest.mock('../TaskCard', () => () => <div data-testid="TaskCard">TaskCard</div>);

describe('ProjectRowDashboard', () => {
  const project: IProjectCatalogItem = {
    Title: '1003012-ED2-0026-04-H_Rev-A',
    ProjectNumber: '1003012',
    PartNumber: 'ED2-0026-04-H_Rev-A',
    Customer: 'Acme',
    Status: 'Open',
    WorkOrder: '10010001',
    resolvedStorageVersion: 'v1',
  };

  const context = {
    pageContext: {
      web: {
        absoluteUrl: 'https://ed2corp.sharepoint.com/sites/ED2-Team',
        serverRelativeUrl: '/sites/ED2-Team',
      },
      user: {
        email: 'test@ed2corp.com',
        displayName: 'Test User',
      },
    },
  };

  const createSp = (shouldResolve = true): unknown => ({
    web: {
      lists: {
        getByTitle: jest.fn().mockImplementation(() => {
          const execute = shouldResolve
            ? jest.fn().mockResolvedValue({
                DefaultViewUrl: '/sites/ED2-Team/Lists/1003012-ED2-0026-04-H_Rev-A-List/AllItems.aspx',
                RootFolder: { ServerRelativeUrl: '/sites/ED2-Team/Lists/1003012-ED2-0026-04-H_Rev-A-List' },
              })
            : jest.fn().mockRejectedValue(new Error('missing list'));

          return {
            select: jest.fn().mockReturnValue({
              expand: jest.fn().mockReturnValue(execute),
            }),
          };
        }),
      },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBucketStatus.mockReturnValue('green');
  });

  it('keeps ProjectCatalogEditor reachable when the task list is missing', async () => {
    mockUseProjectState.mockReturnValue({
      tasks: [],
      gates: [],
      filteredTasks: [],
      onReset: jest.fn(),
      onGateFilterChange: jest.fn(),
      onSelectItem: jest.fn(),
      onNewTask: jest.fn(),
      onDeleteTask: jest.fn(),
      onUpdateTask: jest.fn(),
      onUploadFile: jest.fn(),
      onSaveLogField: jest.fn(),
      onSendEmail: jest.fn(),
      onSearchUsers: jest.fn(),
    });

    render(
      <ProjectRowDashboard
        project={project}
        context={context as any}
        sp={createSp(false) as any}
      />
    );

    expect(screen.getByText(/No task list found/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Options/i }));

    expect(screen.getByTestId('ProjectActionsBar')).toBeInTheDocument();
    expect(screen.getByTestId('ProjectCatalogEditor')).toBeInTheDocument();
  });

  it('reports project status using Title as the stable key', async () => {
    const onStatusReady = jest.fn();

    mockUseProjectState.mockReturnValue({
      tasks: [{ Id: '1', Task: 'T1', Gate: 'Gate 1', Title: '001' }],
      gates: [{ Gate: 'Gate 1', Complete: 50 }],
      filteredTasks: [{ Id: '1', Task: 'T1', Gate: 'Gate 1', Title: '001' }],
      onReset: jest.fn(),
      onGateFilterChange: jest.fn(),
      onSelectItem: jest.fn(),
      onNewTask: jest.fn(),
      onDeleteTask: jest.fn(),
      onUpdateTask: jest.fn(),
      onUploadFile: jest.fn(),
      onSaveLogField: jest.fn(),
      onSendEmail: jest.fn(),
      onSearchUsers: jest.fn(),
    });

    render(
      <ProjectRowDashboard
        project={project}
        context={context as any}
        sp={createSp(true) as any}
        onStatusReady={onStatusReady}
      />
    );

    await waitFor(() => {
      expect(onStatusReady).toHaveBeenCalledWith(project.Title, 'ontime');
    });
  });
});
