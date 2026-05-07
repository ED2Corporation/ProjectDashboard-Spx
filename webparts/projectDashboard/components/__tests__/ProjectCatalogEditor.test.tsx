/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ProjectCatalogEditor from '../ProjectCatalogEditor';
import { IProjectCatalogItem } from '../../../../models/IProjectService';
import { ProjectService } from '../../services/ProjectService';

describe('ProjectCatalogEditor', () => {
  const project: IProjectCatalogItem = {
    Title: '1003012-ED2-0026-04-H_Rev-A',
    ProjectNumber: '1003012',
    ProjectId: 'ED2-0026-04-H Rev A',
    Customer: 'Acme',
    Units: 5,
    Status: 'Open',
    ProjectDetails: JSON.stringify({
      CreationDate: '2026-04-07',
      NeedDate: '2026-05-29',
      storageVersion: 'v2',
      WorkOrder: '10010001',
      RequiresAudit: true,
      Quantity: 12,
      Meta: { owner: 'ED2' },
    }),
  };

  it('keeps Title protected until the sensitive toggle is enabled', async () => {
    const projectService = {
      updateCatalogItem: jest.fn().mockResolvedValue(undefined),
    };

    render(
      <ProjectCatalogEditor
        project={project}
        projectService={projectService as unknown as ProjectService}
      />
    );

    const titleInput = screen.getByDisplayValue(project.Title);
    expect(titleInput).toBeDisabled();

    await userEvent.click(screen.getByLabelText(/Sensitive field/i));
    expect(titleInput).toBeEnabled();
  });

  it('renders ProjectDetails dynamically and rebuilds JSON with edited values', async () => {
    const projectService = {
      updateCatalogItem: jest.fn().mockResolvedValue(undefined),
    };
    const onSaved = jest.fn();

    render(
      <ProjectCatalogEditor
        project={project}
        projectService={projectService as unknown as ProjectService}
        onSaved={onSaved}
      />
    );

    expect(screen.getByLabelText('CreationDate')).toHaveValue('2026-04-07');
    expect(screen.getByLabelText('NeedDate')).toHaveValue('2026-05-29');
    expect(screen.getByLabelText('storageVersion')).toHaveValue('v2');
    expect(screen.getByLabelText('RequiresAudit')).toHaveValue('true');
    expect(screen.getByLabelText('Quantity')).toHaveValue('12');
    expect((screen.getByLabelText('Meta') as HTMLInputElement).value).toContain('"owner"');
    expect((screen.getByLabelText('Meta') as HTMLInputElement).value).toContain('"ED2"');

    await userEvent.clear(screen.getByLabelText('Quantity'));
    await userEvent.type(screen.getByLabelText('Quantity'), '44');
    await userEvent.clear(screen.getByLabelText('RequiresAudit'));
    await userEvent.type(screen.getByLabelText('RequiresAudit'), 'false');
    fireEvent.change(screen.getByLabelText('Meta'), {
      target: { value: '{"owner":"QA","region":"EU"}' },
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /Save changes/i }));
    });

    await waitFor(() => expect(projectService.updateCatalogItem).toHaveBeenCalledTimes(1));

    const [, patch] = projectService.updateCatalogItem.mock.calls[0];
    expect(projectService.updateCatalogItem).toHaveBeenCalledWith(project.Title, expect.any(Object));
    expect(patch.ProjectDetails).toBe(
      JSON.stringify({
        CreationDate: '2026-04-07',
        NeedDate: '2026-05-29',
        storageVersion: 'v2',
        WorkOrder: '10010001',
        RequiresAudit: false,
        Quantity: 44,
        Meta: { owner: 'QA', region: 'EU' },
      })
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Changes saved.')).toBeInTheDocument());
    expect(onSaved.mock.calls[0][0].ProjectDetails).toBe(patch.ProjectDetails);
  });
});
