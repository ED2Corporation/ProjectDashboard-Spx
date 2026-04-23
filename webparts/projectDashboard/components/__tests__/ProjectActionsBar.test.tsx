/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ProjectActionsBar from '../ProjectActionsBar';
import { IProjectListItem } from '../../../../models';
import { IProjectCatalogItem } from '../../../../models/IProjectService';
import { ProjectService } from '../../services/ProjectService';

describe('ProjectActionsBar', () => {
  const projectService = {
    archiveProject: jest.fn().mockResolvedValue(undefined),
    exportProject: jest.fn(),
    importProject: jest.fn(),
  } as unknown as ProjectService;

  const project: IProjectListItem = {
    Id: '1003012-ED2-0026-04-H_Rev-A',
    Title: '1003012-ED2-0026-04-H_Rev-A',
    ListName: '1003012-ED2-0026-04-H_Rev-A-List',
    RepositoryName: '1003012-ED2-0026-04-H_Rev-A-Evidence',
    isPlanner: false,
    Link: {
      Url: 'https://ed2corp.sharepoint.com/WO-Plans/Lists/1003012ED2002604H_RevAList/AllItems.aspx',
      Description: '1003012-ED2-0026-04-H_Rev-A',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line no-alert
    window.confirm = jest.fn().mockReturnValue(true);
  });

  it('renders List and Repo quick links with the provided URLs', () => {
    render(
      <ProjectActionsBar
        project={project}
        projectService={projectService}
        evidenceFolderServerRelative="/WO-Plans/WODocs"
        repoUrl="https://ed2corp.sharepoint.com/WO-Plans/WODocs/1003012-ED2-0026-04-H_Rev-A-Evidence"
        repositoryName={project.RepositoryName}
        onReset={jest.fn()}
      />
    );

    expect(screen.getByRole('link', { name: /List/i })).toHaveAttribute('href', project.Link.Url);
    expect(screen.getByRole('link', { name: /Repo/i })).toHaveAttribute(
      'href',
      'https://ed2corp.sharepoint.com/WO-Plans/WODocs/1003012-ED2-0026-04-H_Rev-A-Evidence'
    );
  });

  it('archives using project Title as the stable identity', async () => {
    const onReset = jest.fn();
    const onCatalogRefresh = jest.fn();

    render(
      <ProjectActionsBar
        project={project}
        projectService={projectService}
        evidenceFolderServerRelative="/WO-Plans/WODocs"
        repoUrl="https://ed2corp.sharepoint.com/WO-Plans/WODocs/1003012-ED2-0026-04-H_Rev-A-Evidence"
        repositoryName={project.RepositoryName}
        projectMetadata={{ Title: project.Title } as IProjectCatalogItem}
        onReset={onReset}
        onCatalogRefresh={onCatalogRefresh}
      />
    );

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /Archive/i }));
    });

    await waitFor(() => {
      expect((projectService.archiveProject as jest.Mock)).toHaveBeenCalledWith(
        project.ListName,
        '/WO-Plans/WODocs/1003012-ED2-0026-04-H_Rev-A-Evidence',
        project.Title,
        { Title: project.Title }
      );
    });

    expect(onReset).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Archive completed')).toBeInTheDocument());
  });
});
