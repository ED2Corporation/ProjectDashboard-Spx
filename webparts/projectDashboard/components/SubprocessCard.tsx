import * as React from "react";
import { useEffect } from "react";
import { ITaskSubprocessData, ISubprocessSubTask } from "../utils/TaskDescriptionBlob";
import styles from "./SubprocessCard.module.scss";

interface SubprocessCardProps {
  parentWbs: string;
  parentStart: string;
  parentFinish: string;
  value: ITaskSubprocessData;
  onChange: (nextValue: ITaskSubprocessData) => void;
}

const formatSubTaskWbs = (parentWbs: string, index: number): string => {
  const prefix = parentWbs.trim();
  const suffix = String(index + 1).padStart(2, "0");
  return prefix ? `${prefix}.${suffix}` : suffix;
};

const toArizonaDate = (): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
};

const normalizeSubTasks = (parentWbs: string, subTasks: ISubprocessSubTask[]): ISubprocessSubTask[] =>
  subTasks.map((entry, index) => ({
    ...entry,
    wbs: formatSubTaskWbs(parentWbs, index),
  }));

const createEmptySubTask = (parentWbs: string, parentStart: string, parentFinish: string, index: number): ISubprocessSubTask => ({
  id: `sp-${Date.now()}-${index + 1}`,
  wbs: formatSubTaskWbs(parentWbs, index),
  task: "",
  complete: 0,
  start: parentStart,
  finish: parentFinish,
  actualFinish: "",
});

const SubprocessCard: React.FC<SubprocessCardProps> = ({ parentWbs, parentStart, parentFinish, value, onChange }) => {
  useEffect(() => {
    const normalized = normalizeSubTasks(parentWbs, value.subTasks);
    const changed = normalized.some((entry, index) => entry.wbs !== value.subTasks[index]?.wbs);
    if (changed) {
      onChange({ ...value, subTasks: normalized });
    }
  }, [parentWbs, value, onChange]);

  const updateSubTask = (
    index: number,
    patch: Partial<ISubprocessSubTask>
  ): void => {
    const nextSubTasks = normalizeSubTasks(parentWbs, value.subTasks.map((entry, currentIndex) =>
      currentIndex === index ? { ...entry, ...patch } : entry
    ));
    onChange({ ...value, subTasks: nextSubTasks });
  };

  const removeSubTask = (index: number): void => {
    onChange({
      ...value,
      subTasks: normalizeSubTasks(
        parentWbs,
        value.subTasks.filter((_, currentIndex) => currentIndex !== index)
      ),
    });
  };

  const addSubTask = (): void => {
    const nextSubTasks = normalizeSubTasks(parentWbs, [
      ...value.subTasks,
      createEmptySubTask(parentWbs, parentStart, parentFinish, value.subTasks.length),
    ]);
    onChange({
      ...value,
      subTasks: nextSubTasks,
    });
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Subprocess</h3>
          <p className={styles.subtitle}>Define the lot quantity and the sub tasks required to release it.</p>
        </div>
        <label className={styles.itemsField}>
          <span>Items</span>
          <input
            type="number"
            min={0}
            value={value.items}
            onChange={(event) => onChange({
              ...value,
              items: Math.max(0, Number(event.target.value) || 0),
            })}
          />
        </label>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Actions</th>
              <th>WBS</th>
              <th>Task</th>
              <th>Start</th>
              <th>Finish</th>
              <th>Complete</th>
            </tr>
          </thead>
          <tbody>
            {value.subTasks.map((entry, index) => (
              <tr key={entry.id}>
                <td className={styles.actionsCell}>
                  <div className={styles.actionsGroup}>
                    <button
                      type="button"
                      className={styles.acceptBtn}
                      onClick={() => updateSubTask(index, {
                        complete: 100,
                        actualFinish: toArizonaDate(),
                      })}
                      title="Complete sub task"
                    >
                      <span aria-hidden="true">✓</span>
                    </button>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeSubTask(index)}
                      title="Remove sub task"
                    >
                      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2 3.5h8M4.5 3.5V2.5h3v1M3.5 3.5l.5 6h4l.5-6"/>
                      </svg>
                    </button>
                  </div>
                </td>
                <td>
                  <input
                    type="text"
                    value={entry.wbs}
                    readOnly
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={entry.task}
                    onChange={(event) => updateSubTask(index, { task: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={entry.start}
                    onChange={(event) => updateSubTask(index, { start: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={entry.finish}
                    onChange={(event) => updateSubTask(index, { finish: event.target.value })}
                  />
                </td>
                <td>
                  <div className={styles.completeCell}>
                    <span className={styles.completePercent}>{entry.complete}%</span>
                    <span className={styles.completeDate}>{entry.actualFinish || "--"}</span>
                  </div>
                </td>
              </tr>
            ))}
            {value.subTasks.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.emptyState}>
                  No sub tasks defined yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.addBtn} onClick={addSubTask}>
          + Add Subtask
        </button>
      </div>
    </div>
  );
};

export default SubprocessCard;
