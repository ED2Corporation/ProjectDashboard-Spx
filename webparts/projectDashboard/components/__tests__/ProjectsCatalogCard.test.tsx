/**
 * @jest-environment jsdom
 */
const mockUseProjectsCatalog = jest.fn();

jest.mock('../../hooks/useProjectsCatalog', () => ({
  useProjectsCatalog: (...args: unknown[]) => mockUseProjectsCatalog(...args),
}));

jest.mock('../ProjectRowArchived', () => (props: { project: IProjectCatalogItem }) => (
  <div data-testid="archived-row">{props.project.Title}</div>
));

jest.mock('../ProjectRowDashboard', () => (props: {
  project: IProjectCatalogItem;
  onStatusReady?: (projectId: string, key: 'ontime' | 'stalled' | 'delayed' | 'archived') => void;
}) => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');

  ReactActual.useEffect(() => {
    props.onStatusReady?.(props.project.Title, props.project.Title.includes('DELAY') ? 'delayed' : 'ontime');
  }, [props]);

  return ReactActual.createElement('div', { 'data-testid': 'project-row' }, props.project.Title);
});

import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ProjectsCatalogCard from '../ProjectsCatalogCard';
import { IProjectCatalogItem } from '../../../../models/IProjectService';
import { SPFI } from '@pnp/sp';
import { BaseComponentContext } from '@microsoft/sp-component-base';

describe('ProjectsCatalogCard', () => {
  const context = {} as BaseComponentContext;
  const sp = {} as SPFI;

  const projects: IProjectCatalogItem[] = [
    {
      Title: '1003012-ED2-0026-04-H_Rev-A',
      PartNumber: 'ED2-0026-04-H_Rev-A',
      ProjectNumber: '1003012',
      ProjectId: 'Report A',
      Customer: 'Acme',
      Status: 'Open',
    },
    {
      Title: '1003999-DELAY-PROJECT',
      PartNumber: 'Delay Part',
      ProjectNumber: '1003999',
      ProjectId: 'Report Delay',
      Customer: 'Beta',
      Status: 'Open',
    },
    {
      Title: '1003000-ARCHIVED',
      PartNumber: 'Archived Part',
      ProjectNumber: '1003000',
      ProjectId: 'Archived Report',
      Customer: 'Gamma',
      Status: 'Archived',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProjectsCatalog.mockReturnValue({
      projects,
      isLoading: false,
      error: '',
      reload: jest.fn(),
    });
  });

  it('tracks open-project status by Title and updates delayed counts', async () => {
    render(<ProjectsCatalogCard sp={sp} context={context} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Delayed/i })).toBeInTheDocument();
    });

    expect(screen.getByText('Work Orders')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Delayed/i })).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /On Time/i })).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('1003999-DELAY-PROJECT')).toBeInTheDocument();
  });

  it('filters archived projects and renders the archived row component', async () => {
    render(<ProjectsCatalogCard sp={sp} context={context} />);

    await userEvent.click(screen.getByRole('button', { name: /Archived/i }));

    expect(screen.getByTestId('archived-row')).toHaveTextContent('1003000-ARCHIVED');
    expect(screen.queryByText('1003012-ED2-0026-04-H_Rev-A')).not.toBeInTheDocument();
  });

  it('supports search over report fields without affecting Title identity', async () => {
    render(<ProjectsCatalogCard sp={sp} context={context} />);

    await userEvent.type(screen.getByPlaceholderText(/Search part number, job ID, customer/i), 'report delay');

    expect(screen.getByText('1003999-DELAY-PROJECT')).toBeInTheDocument();
    expect(screen.queryByText('1003012-ED2-0026-04-H_Rev-A')).not.toBeInTheDocument();
  });
});
