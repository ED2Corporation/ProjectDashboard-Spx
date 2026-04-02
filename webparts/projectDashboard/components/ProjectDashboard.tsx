import * as React from "react";
import styles from "./ProjectDashboard.module.scss";
import type { IProjectDashboardProps } from "./IProjectDashboardProps";
import { ITaskListItem } from "../../../models";
import ProgressTasks from "./ProgressTasks";
import TaskCard from "./TaskCard";
import ListTasks from "./ListTasks";
import NewProjectSetup from "./NewProjectSetup";
import ProjectActionsBar from "./ProjectActionsBar";
import GateProgressBar from "./GateProgressBar";
import { IProjectCatalogItem } from "../../../models/IProjectService";

// ─── State ────────────────────────────────────────────────────────────────────

interface IProjectDashboardState {
  activeGate: string | null;       // null = tasks hidden; gate name = tasks visible filtered
  showCard: boolean;
  showProjectActions: boolean;
  showDashboard: boolean;
  showNewProject: boolean;
  selectedTask: ITaskListItem | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default class ProjectDashboard extends React.Component<
  IProjectDashboardProps,
  IProjectDashboardState
> {
  constructor(props: IProjectDashboardProps) {
    super(props);
    this.state = {
      activeGate:          null,
      showCard:            false,
      showProjectActions:  false,
      showDashboard:       true,
      showNewProject:      false,
      selectedTask:        this.props.selectedTask || null,
    };
  }

  // ── Gate segment click: toggle filtered view for that gate ─────────────────
  private handleGateClick = (gate: string): void => {
    const next = this.state.activeGate === gate ? null : gate;
    this.setState({ activeGate: next, showCard: false });

    if (next === null) {
      this.props.onGateFilterChange?.("all");
      this.props.onSelectItem("all", "gate");
    } else {
      this.props.onSelectItem(next, "gate");
      this.props.onGateFilterChange?.(next);
    }
  };

  // ── Overall badge click: toggle all-tasks view ───────────────────────────
  private handleOverallClick = (): void => {
    const next = this.state.activeGate === "all" ? null : "all";
    this.setState({ activeGate: next, showCard: false });

    // Reset parent filter so spFilteredTaskItems = all tasks
    this.props.onGateFilterChange?.("all");
    this.props.onSelectItem("all", "gate");
  };

  public render(): React.ReactElement<IProjectDashboardProps> {
    const {
      spGateListItems,
      spTaskListItems,
      spFilteredTaskItems,
      hasTeamsContext,
      project,
    } = this.props;

    const {
      activeGate, showCard, selectedTask,
      showProjectActions, showNewProject, showDashboard,
    } = this.state;

    const tasksVisible  = activeGate !== null;
    const showAllTasks  = activeGate === "all";
    const visibleTasks  = showAllTasks ? spTaskListItems : spFilteredTaskItems;
    const tasksHeading  = showAllTasks ? "All Tasks" : (spFilteredTaskItems[0]?.Gate || "No tasks defined...");

    return (
      <>
        {/* ── Row 1: checkbox + project title ─────────────────────────── */}
        <div id="progress-header" className={styles["rowContainer"]}>
          <input
            className={styles["checkbox"]}
            type="checkbox"
            checked={showDashboard}
            onChange={e =>
              this.setState({ showDashboard: e.target.checked }, () => {
                if (e.target.checked) this.props.onReset();
              })
            }
          />
          <div>
            <a
              href={project.Link.Url}
              data-interception="off"
              onClick={e => {
                if (!(e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                }
              }}
              target="_blank"
              rel="noopener noreferrer"
              title="Cmd+Click / Ctrl+Click to open link"
            >
              <h2 style={{ margin: 0 }}>{project.Title}</h2>
            </a>
          </div>
        </div>

        {showDashboard && this.props.isDashboard && (
          <div className="task-card">

            {/* ── Row 2: Gate progress bar (replaces doughnut) ─────────── */}
            {spGateListItems.length > 0 && (
              <div style={{ display: "flex", alignItems: "flex-start", padding: "4px 0 8px 0" }}>
                <GateProgressBar
                  gates={spGateListItems}
                  tasks={spTaskListItems}
                  activeGate={activeGate}
                  onGateClick={this.handleGateClick}
                  onOverallClick={this.handleOverallClick}
                  onSettingsClick={() => this.setState(prev => ({ showProjectActions: !prev.showProjectActions }))}
                  settingsActive={showProjectActions}
                />
              </div>
            )}

            {showProjectActions && (
              <ProjectActionsBar
                project={project}
                projectService={this.props.projectService}
                evidenceFolderServerRelative={this.props.evidenceFolderServerRelative}
                repositoryName={this.props.repositoryName}
                onReset={this.props.onReset}
              />
            )}

            {/* ── Empty state ──────────────────────────────────────────── */}
            {spGateListItems.length === 0 && (
              <div>
                <h1>Review your plan setup (unable to reach the info)...</h1>
                <button
                  type="button"
                  className={styles["primaryCtaButton"]}
                  onClick={() => this.setState({ showNewProject: !showNewProject })}
                >
                  Start new project
                </button>
              </div>
            )}

            {showNewProject && (
              <NewProjectSetup
                defaultProjectName={this.props.project.Title}
                onCancel={() => this.setState({ showNewProject: false })}
                onCreate={async (
                  listName: string,
                  repositoryName: string,
                  projectTitle: string,
                  firstGate: string,
                  mode: "empty" | "from-excel",
                  file?: File
                ): Promise<void> => {
                  if (this.props.onCreateNewProject) {
                    await this.props.onCreateNewProject(
                      listName, repositoryName, projectTitle, firstGate, mode, file
                    );
                  }
                  this.setState({ showNewProject: false });
                }}
                getLastProjectFromCatalog={async () =>
                  this.props.projectService.getLastProjectFromCatalog()
                }
                addProjectToCatalog={async (data: IProjectCatalogItem) => {
                  if (data) {
                    await this.props.projectService.addProjectToCatalog(data);
                  }
                }}
                onProjectCreated={(data) => {
                  if (data) {
                    this.props.project.Title        = data.projectId;
                    this.props.project.ListName     = data.listName;
                    this.props.project.RepositoryName = data.repoName;
                  }
                }}
              />
            )} 
          </div>
        )}

        {/* ── Task section — visible only when a gate is active ────────── */}
        {showDashboard && tasksVisible && (
          <section
            className={`${styles.projectDashboard} ${hasTeamsContext ? styles.teams : ""}`}
          >
            <div className={styles["columnContainer"]}>
              <div id="progress-body">
                {spTaskListItems.length > 0 && (
                  <ProgressTasks
                    tasks={visibleTasks}
                    showDetails={false}
                    onSelectItem={(item, group) => {
                      const task = spTaskListItems.find(t => t.Task === item);
                      if (task) this.setState({ selectedTask: task, showCard: true });
                      this.props.onSelectItem(item, group);
                    }}
                  />
                )}
              </div>
            </div>

            {showCard && selectedTask && (
              <TaskCard
                task={selectedTask}
                isPlanner={project.isPlanner || false}
                onClose={() => this.setState({ showCard: false })}
                onNew={(task) => {
                  this.props.onNewTask?.(task.Gate);
                }}
                onDelete={(taskId) => {
                  this.props.onDeleteTask?.(taskId);
                }}
                onSave={(taskId, payloadJson) => {
                  this.props.onUpdateTask?.(taskId, "full-update", payloadJson);
                  this.setState({ showCard: true });
                }}
              />
            )}

            {spTaskListItems.length > 0 && (
              <ListTasks
                tasks={visibleTasks}
                isPlanner={project.isPlanner || false}
                heading={tasksHeading}
                showDetails={true}
                onSave={(taskId, payloadJson) => {
                  this.props.onUpdateTask?.(taskId, "quick-complete", payloadJson);
                }}
                onSelectItem={(item, _group, mode) => {
                  if (!item || !item.Task) return;
                  switch (mode) {
                    case "list-edit":
                      this.setState({ selectedTask: item, showCard: true });
                      this.props.onSelectItem(item.Task, "task");
                      break;
                    case "list-create":
                      this.props.onNewTask?.(item.Gate);
                      break;
                    case "list-delete":
                      this.props.onDeleteTask?.(item.Id);
                      break;
                    default:
                      this.setState({ selectedTask: item, showCard: true });
                      this.props.onSelectItem(item.Task, "task");
                      break;
                  }
                }}
              />
            )}
          </section>
        )}
      </>
    );
  }

  componentDidUpdate(prevProps: IProjectDashboardProps): void {
    if (prevProps.selectedTask !== this.props.selectedTask) {
      this.setState({ selectedTask: this.props.selectedTask || null });
    }
  }

  componentWillUnmount(): void {
    if ((this.context as any).refreshInterval) { // eslint-disable-line @typescript-eslint/no-explicit-any
      clearInterval((this.context as any).refreshInterval);
    }
  }
}
