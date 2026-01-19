import * as React from "react";
import styles from "./ProjectDashboard.module.scss";
import type { IProjectDashboardProps } from "./IProjectDashboardProps";
import { ITaskListItem } from "../../../models";
import ProgressTasks from "./ProgressTasks";
import TaskCard from "./TaskCard";
import ListTasks from "./ListTasks";
import { MessageLog } from "./MessageLog";
import DoughnutChart from "./Doughnut";
import { GroupByProject } from "./GroupByProject";

interface IProjectDashboardState {
  allTasks: boolean;
  showTasks: boolean;
  showDetails: boolean;
  selectedTask: ITaskListItem | null;
  showBuckets: boolean; // ← NUEVO
}

export default class ProjectDashboard extends React.Component<
  IProjectDashboardProps,
  IProjectDashboardState
> {
  constructor(props) {
    super(props);
    this.state = {
      allTasks: false,
      showTasks: true,
      showDetails: false,
      selectedTask: null,
      showBuckets: false // ← NUEVO
    };
  }

  handleSwitchDetailsChange = (event) => {
    this.setState({ showDetails: event.target.checked });
  };
  handleAllTasksChange = (event) => {
    this.setState({ allTasks: event.target.checked });
  };

  public render(): React.ReactElement<IProjectDashboardProps> {
    const {
      spGateListItems,
      spTaskListItems,
      spFilteredTaskItems,
      hasTeamsContext,
      project,
    } = this.props;

    const { showDetails, allTasks, showTasks, selectedTask, showBuckets } = this.state;

    return (
      <>
        <div id="progress-header" className={styles["rowContainer"]}>
          <button
            type="button"
            className={styles["iconButton"]}
            onClick={() => {
              this.onReset();
            }}
          >
            <img
              alt=""
              src={require("../assets/Restart.jpg")}
              className={styles["iconImage"]}
            />
          </button>

          <div>
            {/* ====== TÍTULO con toggle showBuckets ====== */}
            <a
              href={project.Link.Url}
              onClick={(e) => {
                const isModifier = e.metaKey || e.ctrlKey; // Cmd(mac) / Ctrl(win/linux)
                if (!isModifier) {
                  e.preventDefault(); // no navegues con click normal
                  this.setState((prev) => ({ showBuckets: !prev.showBuckets }));
                }
              }}
              target="_blank"
              rel="noopener noreferrer"
              title={showBuckets ? "Hide buckets ¦ Cmd+Click-> Open Plan" : "Show buckets ¦ Cmd+Click-> Open Plan"}
            >
              <h2 style={{ margin: 0 }}>{project.Title}</h2>
            </a>
          </div>
        </div>

        {this.props.isDashboard && (
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
            {spGateListItems.length === 0 && (
              <h1>Review your plan setup (unable to reach the info)... </h1>
            )}
          </div>
        )}

        {(!this.props.isDashboard ||
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
                      console.log("ProgressTasks found task:", task);
                      if (task) {
                        this.setState({ selectedTask: task });
                      }
                      this.props.onSelectItem(item, group);
                    }}
                  />
                )}
              </div>
            </div>

            {selectedTask && (
              <TaskCard
                task={selectedTask}
                showDetails={true}
                onClose={() => this.setState({ selectedTask: null })}
                onSave={(taskId, payloadJson) => {
                  this.props.onUpdateTask?.(taskId, "full-update", payloadJson);
                  console.log("Update DB TaskCard:", taskId);
                }}
              />
            )}

            {showTasks && spTaskListItems.length > 0 && (
              <ListTasks
                items={allTasks ? spTaskListItems : spFilteredTaskItems}
                heading={
                  allTasks
                    ? "All Tasks"
                    : spFilteredTaskItems.length > 0
                    ? spFilteredTaskItems[0].Title
                    : "No tasks defined..."
                }
                showDetails={showDetails}
                onSelectItem={(item, group, mode, payload) => {
                  console.log("ListTasks onSelectItem -> item, group, mode:", item, group, mode);
                  const task = spTaskListItems.find(t => t.Task === item);
                  if (task && mode === "details") {
                    this.setState({ selectedTask: task });
                    return;
                  }
                  if (mode === "quick-complete" && payload) {
                    this.props.onUpdateTask?.(item, "quick-complete", payload);
                    return;
                  }
                  this.props.onSelectItem(item, group);
                }}
              />
            )}

            {this.props.showLog && this.props.environmentMessage.length > 0 && (
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

  private onReset(): void {
    if (this.props.onReset) this.props.onReset();
    this.setState({ allTasks: false });
    this.setState({ showTasks: true });
    MessageLog("ProjectDashboar/onReset...");
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
