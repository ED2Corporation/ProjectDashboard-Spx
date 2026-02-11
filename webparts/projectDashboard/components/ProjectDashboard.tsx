import * as React from "react";
import styles from "./ProjectDashboard.module.scss";
import type { IProjectDashboardProps } from "./IProjectDashboardProps";
import {  ITaskListItem } from "../../../models";
import ProgressTasks from "./ProgressTasks";
import TaskCard from "./TaskCard";
import ListTasks from "./ListTasks";
import { MessageLog } from "./MessageLog";
import DoughnutChart from "./Doughnut";
import NewProjectSetup from "./NewProjectSetup";
import { GroupByProject } from "./GroupByProject";
import {ProjectService} from "./ProjectService";

interface IProjectDashboardState {
  allTasks: boolean;
  showTasks: boolean;
  showCard: boolean;
  showDetails: boolean;
  showBuckets: boolean; 
  showDashboard: boolean; 
  showNewProject: boolean;
  showProjectActions: boolean;
  importFile: File | null;
  selectedTask: ITaskListItem | null;
}

export default class ProjectDashboard extends React.Component<
  IProjectDashboardProps,
  IProjectDashboardState
> {
  private _projectService: ProjectService;
  constructor(props)  {
    super(props);

    this._projectService = new ProjectService(this.props.context, "Projects");

    this.state = {
      allTasks: false,
      showCard: false,
      showTasks: true,
      showDetails: false,
      showBuckets: false,
      showDashboard: true,
      showNewProject: false,
      showProjectActions: false,
      importFile: null,
      selectedTask: this.props.selectedTask || null 
    };
  }

  public render(): React.ReactElement<IProjectDashboardProps> {
    const {
      spGateListItems,
      spTaskListItems,
      spFilteredTaskItems,
      hasTeamsContext,
      project,
    } = this.props;
    
    const { showDetails, allTasks, showCard, showTasks, selectedTask, showBuckets, showProjectActions, showNewProject, showDashboard   } = this.state;
   
    return (
      <>
        <div id="progress-header" className={styles["rowContainer"]}>
          <input className={styles["checkbox"]}
            type="checkbox"
            checked={showDashboard}
            onChange={e => this.setState({ showDashboard: e.target.checked }, () => {
              if (e.target.checked) {
                this.props.onReset();
              }
            })}
          />
          
          {/* ====== toggle showBuckets ====== */}
          <div>
            <a
              href={project.Link.Url}
              data-interception="off"
              onClick={(e) => {
                const isModifier = e.metaKey || e.ctrlKey; // Cmd(mac) / Ctrl(win/linux)
                console.log("showBuckets:",showBuckets);
                if (!isModifier) {
                  e.preventDefault();
                  this.setState((prev) => ({ showBuckets: !prev.showBuckets }));
                }
              }}
              target="_blank"
              rel="noopener noreferrer"
              title={
                showBuckets
                  ? "Hide buckets ¦ Cmd+Click-> To open the link"
                  : "Show buckets ¦ Cmd+Click-> To open the link"
              }
            >
              <h2 style={{ margin: 0 }}>{project.Title}</h2>
            </a>

          </div>
          { showBuckets && (
            <div style={{ marginLeft: "30px" }}>
              <input className={styles["checkbox"]}
                type="checkbox"
                checked={showProjectActions}
                onChange={e => this.setState({ showProjectActions: e.target.checked }, () => {
                  if (e.target.checked) {
                    this.onReset();
                  }
                })}
              /> Project Actions
            </div>
          )
          }
        </div>

        {this.state.showDashboard && this.props.isDashboard && (
          <div className="task-card">
            {spGateListItems.length > 0 && (
              <div>
                <DoughnutChart
                  gates={spGateListItems}
                  tasks={spTaskListItems}
                  complete={GroupByProject(spGateListItems).Complete}
                  showLegend={showBuckets}
                  onSelectItem={(item, group) => {
                    this.props.onSelectItem(item, group);
                    this.props.onGateFilterChange?.(item);
                    if (item === "all") {
                      // Click en el CENTRO: toggle allTasks
                      console.log("[DoughnutChart] Show all tasks");
                      this.setState({
                        allTasks: true,
                        showTasks: true,
                        showDetails: !showDetails
                      });
                    } else {
                      // Click en SECCIÓN: mostrar filtradas
                      console.log("[DoughnutChart] Filter by section:", item);
                      this.setState({
                        allTasks: false,
                        showTasks: true,
                        showDetails: true
                      });
                    }
                  }}
                />              
              </div>
            )}
            {showProjectActions && showBuckets && (
              <div>
                <h1>Project actions</h1>
                  <div className={styles.actionsBar}>
                  <button
                    type="button"
                    className={styles.actionItem}
                    onClick={() => this.setState({ showNewProject: !this.state.showNewProject })}
                  >
                    Create new
                  </button>

                  <button
                    type="button"
                    className={styles.actionItem}
                    onClick={async () => {
                      if (!this.props.project.Id) return;
                      await this._projectService.archiveProject(this.props.project.Id, this.props.evidenceFolderServerRelative);
                      this.props.onReset();
                    }}
                  >
                    Archive
                  </button>

                  <button
                    type="button"
                    className={styles.actionItem}
                    onClick={async () => {
                      const listTitle = this.props.project.Id;
                      if (!listTitle) return;

                      if (!confirm("Are you sure you want to delete this project and its evidence repository?")) {
                        return;
                      }

                      await this._projectService.deleteProject(listTitle, this.props.evidenceFolderServerRelative);
                      this.props.onReset();
                    }}
                  >
                    Delete
                  </button>


                  <button
                    type="button"
                    className={styles.actionItem}
                    onClick={async () => {
                      if (!this.props.project.Id) return;
                      try{
                        const listTitle = this.props.project.Id; 
                        console.log("Export: "+listTitle);
                        if (!listTitle) return;

                        const blob = await this._projectService.exportProject(listTitle);
                        const url = window.URL.createObjectURL(blob);
                        console.log("url: "+url);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${listTitle}-export.csv`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);

                      } catch{
                        console.log("Error downloading file...");

                      }
                    }}
                  >
                    Export
                  </button>
                  <div style={{ fontSize: 11, color: "#605e5c", marginTop: 4 }}>
                    <button
                      type="button"
                      className={styles.actionItem}
                      onClick={async () => {
                        const file = this.state.importFile;
                        const listTitle = this.props.project.Id;
                        if (!listTitle || !file) {
                          alert("Please select an Excel file first.");
                          return;
                        }
                        await this._projectService.importProject(listTitle, file);
                        this.setState({ importFile: null });
                        this.props.onReset();
                      }}
                    >
                      Import
                    </button>

                     <a
                      href={project.Link.Url}
                      data-interception="off"
                      onClick={(e) => {
                        const isModifier = e.metaKey || e.ctrlKey; // Cmd(mac) / Ctrl(win/linux)
                        console.log("showBuckets:",showBuckets);
                        if (!isModifier) {
                          e.preventDefault();
                          this.setState((prev) => ({ showBuckets: !prev.showBuckets }));
                        }
                      }}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={
                        showBuckets
                          ? "Hide buckets ¦ Cmd+Click-> To open the link"
                          : "Show buckets ¦ Cmd+Click-> To open the link"
                      }
                    >
                      <p style={{ margin: 0 }}>Download template</p>
                    </a>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          this.setState({ importFile: file });
                      }}
                      className={styles["input-small"]}
                    />
                    
                  </div>
                  {/* Import y Replicate se conectan igual */}
                </div>
              </div>
            )}
            {spGateListItems.length === 0 && (
              <div>
                <h1>Review your plan setup (unable to reach the info)...</h1>
                  <button
                    type="button"
                    className={styles["primaryCtaButton"]}
                    onClick={() => this.setState({ showNewProject: !this.state.showNewProject })}
                    >                    
                    Start new project
                  </button>

              </div>
            )}
            {showNewProject && (
              <NewProjectSetup
                defaultProjectName={this.props.project.Title}
                defaultSourceName={this.props.project.ListName}
                defaultRepositoryName={this.props.project.RepositoryName}
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
                      projectTitle,
                      listName,
                      repositoryName,
                      firstGate,
                      mode,
                      file
                    );
                  }
                  this.setState({ showNewProject: false });
                }}
              />

            )}
          </div>
        )}

        {this.state.showDashboard && (!this.props.isDashboard ||
          (this.props.isDashboard && showDetails)) && (
          <section
            className={`${styles.projectDashboard} ${
              hasTeamsContext ? styles.teams : ""
            }`}
          >
            <div className={styles["columnContainer"]}>
              <div id="progress-body">
                {spTaskListItems.length > 0 && (
                  <ProgressTasks
                    tasks={allTasks ? spTaskListItems : spFilteredTaskItems}
                    showDetails={false}
                    onSelectItem={(item, group) => {
                      console.log("ProgressTasks onSelectItem -> item, group:", item, group);
                      const task = spTaskListItems.find(t => t.Task === item);
                      //console.log("ProgressTasks found task:", task);
                      if (task) {
                        this.setState({ selectedTask: task , showCard: true });                        
                      }
                      this.props.onSelectItem(item, group);
                    }}
                  />
                )}
              </div>
            </div>

            {showCard && selectedTask &&(
              <TaskCard
                task={selectedTask}
                isPlanner={project.isPlanner || false}
                onClose={() => this.setState({ showCard: false })}
                onNew={(task) => {
                  console.log("TaskCard onNew:", task);
                  this.props.onNewTask?.(task.Gate);
                }}
                onDelete={(taskId) => {
                  console.log("TaskCard onDelete:", taskId);
                  this.props.onDeleteTask?.(taskId);
                  //this.onReset();
                }}
                onSave={(taskId, payloadJson) => {
                  this.props.onUpdateTask?.(taskId, "full-update", payloadJson);
                  console.log("Update DB TaskCard:"+ taskId +", selected task:" + this.state.selectedTask?.Task);
                  //this.onReset();
                  this.setState({ showCard: true });
                  //this.props.onSelectItem(selectedGateItem, "gate");
                }}
                onUploadEvidenceFile={async (file, taskTitle) => {
                  if (!this.props.onUploadFile) {
                    throw new Error("onUploadFile not provided");
                  }
                  return this.props.onUploadFile(file, taskTitle);
                }}
              />
            )}

            {showTasks && spTaskListItems.length > 0 && (              
              
              <ListTasks
                tasks={allTasks ? spTaskListItems : spFilteredTaskItems}
                isPlanner={project.isPlanner || false}
                heading={allTasks ? "All Tasks" : spFilteredTaskItems[0]?.Gate || "No tasks defined..."}
                showDetails={showDetails}
                onSave={(taskId, payloadJson) => {
                  console.log("Update DB ListTasks:", taskId,"allTasks:", allTasks,"showTasks:", showTasks, payloadJson);
                  this.props.onUpdateTask?.(taskId, "quick-complete", payloadJson);
                  
                }}onSelectItem={(item, group, mode) => {
                  console.log("ListTasks:", item, group, mode);                  
                  
                  if (!item || !item.Task) return;

                  switch (mode) {
                    case "list-edit":
                      // abrir TaskCard para esta tarea (mismo patrón que ProgressTasks)
                      this.setState({ selectedTask: item, showCard: true });
                      this.props.onSelectItem(item.Task, "task");
                      break;

                    case "list-create":
                      // equivalente a TaskCard.onNew -> WebPart._onNewTask(gate)
                      this.props.onNewTask?.(item.Gate);
                      break;

                    case "list-delete":
                      // equivalente a TaskCard.onDelete -> WebPart._onDeleteTask(id)
                      this.props.onDeleteTask?.(item.Id);
                      break;

                    default:
                      // fallback: solo selecciona
                      this.setState({ selectedTask: item, showCard: true });
                      this.props.onSelectItem(item.Task, "task");
                      break;
                  }
                }}
                onUploadEvidenceFile={async (file, taskTitle) => {
                  if (!this.props.onUploadFile) {
                    throw new Error("onUploadFile not provided");
                  }                  
                  return this.props.onUploadFile(file, taskTitle);
                }}
              />

            )}

            {false &&this.props.showLog && this.props.environmentMessage.length > 0 && (
              <>
                <p>
                  <strong>System Log: </strong> {this.props.environmentMessage}
                </p>
              </>
            )}
          </section>
        )}
      </>
    );
  }

  private async onReset(): Promise<void> {
    //if (this.props.onReset) this.props.onReset();
    this.setState({ allTasks: false });
    this.setState({ showTasks: true });
    //this.setState({ selectedTask: null });
    MessageLog("ProjectDashboar/onReset...");
  }

  componentDidUpdate(prevProps: IProjectDashboardProps): void {
    if (prevProps.selectedTask !== this.props.selectedTask) {
      this.setState({ selectedTask: this.props.selectedTask || null });
    }
  }

  componentDidMount(): void {
    if (this.props.onGetGateListItems) this.props.onGetGateListItems();
  }

  componentWillUnmount(): void {
    if ((this.context as any).refreshInterval) {
      clearInterval((this.context as any).refreshInterval);
    }
  }
}
