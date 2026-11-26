import * as React from "react";
import { IOpIssue, OpFix } from "../utils/OperationalChecks";
import styles from "./ValidatePanel.module.scss";

export interface IValidatePanelProps {
  /** Derived from the current tasks: it refreshes by itself after every applied fix. */
  issues: IOpIssue[];
  /** Persists the chosen fixes through the normal task save. */
  onApply: (fixes: OpFix[]) => Promise<void>;
  onClose: () => void;
}

/**
 * Project-wide operational validation. Every row is a warning; rows with a fix offer Apply.
 * Nothing changes until the user presses Apply or Apply all; Cancel closes without changes.
 */
const ValidatePanel: React.FC<IValidatePanelProps> = ({ issues, onApply, onClose }) => {
  const [applying, setApplying] = React.useState<string | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const fixable = issues.filter(i => !!i.fix);
  const warnings = issues.filter(i => i.severity === "warning").length;
  const infos = issues.length - warnings;

  const run = (key: string, fixes: OpFix[]): void => {
    if (applying || fixes.length === 0) return;
    setApplying(key);
    setError(undefined);
    onApply(fixes)
      .catch(err => setError(String((err as Error)?.message ?? err)))
      .finally(() => setApplying(undefined));
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          Validation — {issues.length === 0
            ? "no issues found ✓"
            : `${warnings} warning${warnings === 1 ? "" : "s"}${infos ? `, ${infos} info` : ""}`}
        </span>
      </div>

      <div className={styles.list}>
        {issues.length === 0 ? (
          <div className={styles.empty}>✓ All operational checks passed.</div>
        ) : issues.map(issue => (
          <div key={issue.key} className={styles.row}>
            <span className={`${styles.badge} ${issue.severity === "warning" ? styles.badgeWarn : styles.badgeInfo}`}>
              {issue.severity === "warning" ? "WARN" : "INFO"}
            </span>
            <span className={styles.wbs}>{issue.wbs}</span>
            <span className={styles.message}>{issue.message}</span>
            {issue.fix && (
              <button
                type="button"
                className={styles.applyBtn}
                disabled={!!applying}
                onClick={() => run(issue.key, [issue.fix as OpFix])}
                title="Apply this fix and save the task"
              >
                {applying === issue.key ? "Applying…" : "Apply"}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerNote}>
          {error ?? (fixable.length ? `${fixable.length} fixable` : "Warnings without a fix need a decision in the task.")}
        </span>
        {fixable.length > 0 && (
          <button
            type="button"
            className={styles.applyBtn}
            disabled={!!applying}
            onClick={() => run("all", fixable.map(i => i.fix as OpFix))}
          >
            {applying === "all" ? "Applying…" : `Apply all (${fixable.length})`}
          </button>
        )}
        <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={!!applying}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ValidatePanel;
