import * as React from 'react';
import { SPFI } from "@pnp/sp";
import { BaseComponentContext } from "@microsoft/sp-component-base";
import { SPHttpClient } from '@microsoft/sp-http';

import { IProjectDashboardWebPartProps } from '../../../models';
import { ProjectService } from '../services/ProjectService';
import { useProjectState } from '../hooks/useProjectState';
import ProjectDashboard from './ProjectDashboard';
import NewProjectSetup from './NewProjectSetup';
import ProjectsCatalogCard from './ProjectsCatalogCard';
import { buildRepoRelativeUrl } from '../services/UploadService';
import { IProjectCatalogItem } from '../../../models/IProjectService';

// ─── Types ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = BaseComponentContext & { spHttpClient: SPHttpClient; msGraphClientFactory: any };

export interface IProjectDashboardAppProps {
  context: AnyContext;
  sp: SPFI;
  projectService: ProjectService;
  evidenceFolderServerRelative: string;
  properties: IProjectDashboardWebPartProps;
  onPatchProperties: (patch: Partial<IProjectDashboardWebPartProps>) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
const ProjectDashboardApp: React.FC<IProjectDashboardAppProps> = (props) => {
  const { context, sp, projectService, evidenceFolderServerRelative, properties, onPatchProperties } = props;

  const state = useProjectState({
    context,
    sp,
    projectService,
    evidenceFolderServerRelative,
    projectName: properties.projectName,
    sourceName: properties.sourceName,
    isPlanner: properties.isPlanner,
    repositoryName: properties.repositoryName,
    showLog: properties.showLog,
    projectURL: properties.projectURL,
    onPatchProperties,
  });

  const {
    tasks, gates, filteredTasks, selectedTask, sysError, showNewProjectSetup, environmentMessage,
    projectSelected, onReset, onGateFilterChange, onSelectItem, onNewTask, onDeleteTask,
    onUpdateTask, onUploadFile, onPopulateAttachements, onCreateNewProject,
  } = state;

  // ── New Project Setup view ────────────────────────────────────────────────
  if (sysError || showNewProjectSetup) {
    return (
      <NewProjectSetup
        defaultProjectName={properties.projectName}
        onCancel={async () => {
          await onReset();
        }}
        onCreate={async (listName, repoName, projectTitle, firstGate, mode, file) => {
          await onCreateNewProject(listName, repoName, projectTitle, firstGate, mode, file);
        }}
        getLastProjectFromCatalog={async () => {
          return projectService.getLastProjectFromCatalog();
        }}
        addProjectToCatalog={async (data: IProjectCatalogItem) => {
          if (data) await projectService.addProjectToCatalog(data);
        }}
        onProjectCreated={(data) => {
          if (data) {
            onPatchProperties({
              projectName: data.projectId,
              sourceName: data.listName,
              repositoryName: data.repoName
            });
          }
        }}
      />
    );
  }

  // ── Main Dashboard view ───────────────────────────────────────────────────
  const handleSelectProject = (proj: IProjectCatalogItem) => {
    onPatchProperties({
      sourceName:  proj.ProjectId ?? '',
      projectName: proj.ProjectId ?? '',
    });
  };

  return (
    <>
      {/* Master catalog card — overview of all projects */}
      <ProjectsCatalogCard sp={sp} onSelectProject={handleSelectProject} />

      {/* Single-project task dashboard */}
      <ProjectDashboard
        context={context}
        description={properties.description}
        refreshInterval={properties.refreshInterval}
        project={projectSelected}
        repositoryName={properties.repositoryName}
        repositoryURL={buildRepoRelativeUrl(
          context.pageContext.web.serverRelativeUrl,
          "ProjectsEvidence"
        )}
        projectName={properties.projectName}
        showLog={properties.showLog}
        showButtons={properties.showButtons}
        currentGate={state.currentGate}
        onGateFilterChange={onGateFilterChange}
        onCreateNewProject={onCreateNewProject}
        onReset={onReset}
        filterValue={properties.filterValue}
        evidenceFolderServerRelative={evidenceFolderServerRelative}
        projectService={projectService}
        isDashboard={properties.isDashboard}
        isPlanner={properties.isPlanner}
        environmentMessage={environmentMessage}
        hasTeamsContext={!!(context as any).sdks?.microsoftTeams} // eslint-disable-line @typescript-eslint/no-explicit-any
        userDisplayName={context.pageContext.user.displayName}
        spGateListItems={gates}
        spTaskListItems={tasks}
        spFilteredTaskItems={filteredTasks}
        selectedTask={selectedTask}
        onPopulateAttachements={onPopulateAttachements}
        onSelectItem={onSelectItem}
        onUpdateTask={onUpdateTask}
        onDeleteTask={onDeleteTask}
        onNewTask={onNewTask}
        onUploadFile={onUploadFile}
      />
    </>
  );
};

export default ProjectDashboardApp;
