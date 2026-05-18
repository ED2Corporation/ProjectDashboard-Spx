import * as React from "react";
import { useState } from "react";
import { IProjectCatalogItem, IReleaseRecord } from "../../../models/IProjectService";
import { ProjectService } from "../services/ProjectService";
import styles from "./ProjectCatalogEditor.module.scss";

// ─── Status options ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "Open", variantCard: "statusCardOpen", dot: "statusOpen" },
  { value: "Archived", variantCard: "statusCardArchived", dot: "statusArchived" },
  { value: "Waiting Approval", variantCard: "statusCardWaitingApproval", dot: "statusWaitingApproval" },
  { value: "Hidden", variantCard: "statusCardHidden", dot: "statusHidden" },
] as const;

const normalizeEditorStatus = (status?: string): "Open" | "Archived" | "Waiting Approval" | "Hidden" => {
  const normalized = (status || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");

  if (normalized === "archived" || normalized === "closed") return "Archived";
  if (normalized === "waiting approval") return "Waiting Approval";
  if (normalized === "hidden") return "Hidden";
  return "Open";
};

type ProjectDetailsFieldKind = "string" | "number" | "boolean" | "json" | "null";

interface IProjectDetailsField {
  key: string;
  value: string;
  kind: ProjectDetailsFieldKind;
}

const parseProjectDetailsFields = (raw?: string): IProjectDetailsField[] => {
  if (!raw || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return [];

    return Object.keys(parsed).map((key) => {
      const value = (parsed as Record<string, unknown>)[key];

      if (value === null) {
        return { key, value: "", kind: "null" };
      }

      if (typeof value === "string") {
        return { key, value, kind: "string" };
      }

      if (typeof value === "number") {
        return { key, value: String(value), kind: "number" };
      }

      if (typeof value === "boolean") {
        return { key, value: value ? "true" : "false", kind: "boolean" };
      }

      return { key, value: JSON.stringify(value, null, 2), kind: "json" };
    });
  } catch {
    return [];
  }
};

const serializeProjectDetailsFields = (fields: IProjectDetailsField[]): string | undefined => {
  if (!fields.length) return undefined;

  const serialized = fields.reduce<Record<string, unknown>>((acc, field) => {
    const trimmedValue = field.value.trim();

    if (field.kind === "number") {
      acc[field.key] = trimmedValue === "" ? null : Number(trimmedValue);
      return acc;
    }

    if (field.kind === "boolean") {
      acc[field.key] = trimmedValue.toLowerCase() === "true";
      return acc;
    }

    if (field.kind === "json") {
      acc[field.key] = trimmedValue ? JSON.parse(trimmedValue) : null;
      return acc;
    }

    if (field.kind === "null") {
      acc[field.key] = trimmedValue === "" ? null : trimmedValue;
      return acc;
    }

    acc[field.key] = field.value;
    return acc;
  }, {});

  return JSON.stringify(serialized);
};

const toDateInputValue = (value?: string): string => {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};
 
// ─── Props ────────────────────────────────────────────────────────────────────
 
export interface ProjectCatalogEditorProps {
  project: IProjectCatalogItem;
  projectService: ProjectService;
  onSaved?: (updated: IProjectCatalogItem) => void;
  onCancel?: () => void;
} 

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectCatalogEditor: React.FC<ProjectCatalogEditorProps> = ({
  project, projectService, onSaved, onCancel,
}) => {
  const [form, setForm] = useState<IProjectCatalogItem>({
    ...project,
    Status: normalizeEditorStatus(project.Status),
    ProjectDetails: project.ProjectDetails,
  });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);
  const [allowTitleEdit, setAllowTitleEdit] = useState(false);
  const [projectDetailsFields, setProjectDetailsFields] = useState<IProjectDetailsField[]>(
    () => parseProjectDetailsFields(project.ProjectDetails)
  );
  const [editableReleases, setEditableReleases] = useState<IReleaseRecord[]>(
    () => (project.releases ?? []).map(release => ({ ...release }))
  );

  // Releases — read from project prop (resolved at catalog load time)
  const totalReleased = editableReleases.reduce((sum, r) => sum + (r.units ?? 0), 0);
  const expectedUnits = form.Units ?? 0;
  const remaining = expectedUnits - totalReleased;

  const set = (field: keyof IProjectCatalogItem, value: string | number): void =>
    setForm(prev => ({ ...prev, [field]: value }));

  const setProjectDetailsValue = (key: string, value: string): void => {
    setProjectDetailsFields(prev =>
      prev.map(field => (field.key === key ? { ...field, value } : field))
    );
  };

  const setReleaseValue = (id: string, field: "date" | "units" | "taskTitle" | "notes", value: string): void => {
    setEditableReleases(prev =>
      prev.map(release => {
        if (release.id !== id) return release;

        if (field === "date") {
          return {
            ...release,
            date: value ? new Date(`${value}T00:00:00.000Z`).toISOString() : release.date,
          };
        }

        if (field === "units") {
          return {
            ...release,
            units: value === "" ? 0 : Number(value),
          };
        }

        if (field === "taskTitle") {
          return {
            ...release,
            taskTitle: value,
          };
        }

        return {
          ...release,
          notes: value,
        };
      })
    );
  };

  const removeRelease = (id: string): void => {
    setEditableReleases(prev => prev.filter(release => release.id !== id));
  };

  const handleSave = async (): Promise<void> => {
    if (!project.Title) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      let normalizedProjectDetails: string | undefined;
      try {
        normalizedProjectDetails = serializeProjectDetailsFields(projectDetailsFields);
        const detailsObject = normalizedProjectDetails
          ? JSON.parse(normalizedProjectDetails) as Record<string, unknown>
          : {};
        detailsObject.releases = editableReleases.map(release => ({
          ...release,
          units: Number(release.units) || 0,
          notes: release.notes ?? "",
        }));
        normalizedProjectDetails = JSON.stringify(detailsObject);
      } catch {
        throw new Error("ProjectDetails contains an invalid JSON value.");
      }

      const patch: Partial<IProjectCatalogItem> = {
        Title:         form.Title,
        ProjectNumber: form.ProjectNumber,
        ProjectId:     form.ProjectId,
        Status:        form.Status,
        Customer:      form.Customer,
        Units:         form.Units,
        ProjectDetails: normalizedProjectDetails,
      };
      await projectService.updateCatalogItem(project.Title, patch);
      const updated: IProjectCatalogItem = {
        ...form,
        ProjectDetails: normalizedProjectDetails ?? "",
        releases: editableReleases.map(release => ({ ...release })),
      };
      setForm(updated);
      setSaved(true);
      onSaved?.(updated);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Error saving changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.title}>Project settings</div>

      <div className={styles.grid}>

        {/* Title — full width */}
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor="project-catalog-title">Project name (Title)</label>
            <label className={styles.sensitiveToggle}>
              <input
                type="checkbox"
                checked={allowTitleEdit}
                onChange={e => setAllowTitleEdit(e.target.checked)}
              />
              Sensitive field
            </label>
          </div>
          <input
            id="project-catalog-title"
            className={`${styles.input} ${!allowTitleEdit ? styles.inputLocked : ""}`}
            type="text"
            value={form.Title}
            onChange={e => set("Title", e.target.value)}
            disabled={!allowTitleEdit || saving}
          />
          <span className={styles.fieldHint}>
            Title is the stable key used to resolve SharePoint List and Repo names. Edit only for manual correction.
          </span>
        </div>

        {/* Project number */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="project-catalog-number">Project number</label>
          <input
            id="project-catalog-number"
            className={styles.input}
            type="text"
            value={form.ProjectNumber ?? ""}
            onChange={e => set("ProjectNumber", e.target.value)}
          />
        </div> 

        {/* Part name / ProjectId */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="project-catalog-project-id">Part name / report label (ProjectId)</label>
          <input
            id="project-catalog-project-id"
            className={styles.input}
            type="text"
            value={form.ProjectId ?? ""}
            onChange={e => set("ProjectId", e.target.value)}
          />
        </div>

        {/* Customer */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="project-catalog-customer">Customer</label>
          <input
            id="project-catalog-customer"
            className={styles.input}
            type="text"
            value={form.Customer ?? ""}
            onChange={e => set("Customer", e.target.value)}
          />
        </div>

        {/* Units */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="project-catalog-units">Units</label>
          <input
            id="project-catalog-units"
            className={styles.input}
            type="number"
            value={form.Units ?? ""}
            onChange={e => set("Units", e.target.value === "" ? 0 : Number(e.target.value))}
          />
        </div>

        {/* Status */}
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label className={styles.label}>Status</label>
          <div className={styles.statusPicker}>
            {STATUS_OPTIONS.map(opt => {
              const isSelected = normalizeEditorStatus(form.Status) === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={[
                    styles.statusCard,
                    styles[opt.variantCard],
                    isSelected ? styles.statusCardSelected : "",
                  ].join(" ")}
                  onClick={() => set("Status", opt.value)}
                >
                  <span className={`${styles.statusDot} ${styles[opt.dot]}`} />
                  {opt.value}
                </button>
              );
            })}
          </div>
        </div>

        {/* Project details */}
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label className={styles.label}>ProjectDetails</label>
          {projectDetailsFields.filter(field => field.key !== 'WorkOrder' && field.key !== 'releases').length > 0 ? (
            <div className={styles.detailsGrid}>
              {projectDetailsFields
                .filter(field => field.key !== 'WorkOrder' && field.key !== 'releases')
                .map(field => (
                <div key={field.key} className={styles.detailsField}>
                  <label
                    className={styles.label}
                    htmlFor={`project-detail-${field.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
                  >
                    {field.key}
                  </label>
                  <input
                    id={`project-detail-${field.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
                    className={styles.input}
                    type="text"
                    value={field.value}
                    onChange={e => setProjectDetailsValue(field.key, e.target.value)}
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>
          ) : (
            <span className={styles.fieldHint}>
              No ProjectDetails fields were found for this project.
            </span>
          )}
        </div>

        {/* ── Release Balance ─────────────────────────────────────────── */}
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label className={styles.label}>Release Balance</label>
          <div className={styles.releaseBalance}>
            <div className={styles.releaseBalanceStat}>
              <span className={styles.releaseBalanceValue}>{expectedUnits}</span>
              <span className={styles.releaseBalanceCaption}>Expected</span>
            </div>
            <span className={styles.releaseBalanceSep}>−</span>
            <div className={styles.releaseBalanceStat}>
              <span className={styles.releaseBalanceValue}>{totalReleased}</span>
              <span className={styles.releaseBalanceCaption}>Released</span>
            </div>
            <span className={styles.releaseBalanceSep}>=</span>
            <div className={`${styles.releaseBalanceStat} ${remaining < 0 ? styles.releaseBalanceOver : remaining === 0 ? styles.releaseBalanceDone : ''}`}>
              <span className={styles.releaseBalanceValue}>{remaining}</span>
              <span className={styles.releaseBalanceCaption}>Remaining</span>
            </div>
          </div>

          {editableReleases.length > 0 ? (
            <table className={styles.releaseTable}>
              <thead>
                <tr>
                  <th className={`${styles.releaseTableDateHeader} ${styles.releaseTableCompactHeader}`}>Date</th>
                  <th className={`${styles.releaseTableUnitsHeader} ${styles.releaseTableCompactHeader}`}>Units</th>
                  <th className={styles.releaseTableTaskHeader}>Task</th>
                  <th className={styles.releaseTableNotesHeader}>Notes</th>
                  <th className={styles.releaseTableApprovedHeader}>Approved by</th>
                  <th className={`${styles.releaseTableActionHeader} ${styles.releaseTableCompactHeader}`}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {editableReleases.map(r => (
                  <tr key={r.id}>
                    <td className={`${styles.releaseTableDateCell} ${styles.releaseTableCompactCell}`}>
                      <input
                        className={`${styles.input} ${styles.releaseTableInput} ${styles.releaseTableDateInput}`}
                        type="date"
                        value={toDateInputValue(r.date)}
                        onChange={e => setReleaseValue(r.id, "date", e.target.value)}
                        disabled={saving}
                      />
                    </td>
                    <td className={`${styles.releaseTableUnits} ${styles.releaseTableCompactCell}`}>
                      <input
                        className={`${styles.input} ${styles.releaseTableInput} ${styles.releaseTableUnitsInput}`}
                        type="number"
                        value={r.units}
                        onChange={e => setReleaseValue(r.id, "units", e.target.value)}
                        disabled={saving}
                      />
                    </td>
                    <td className={styles.releaseTableTaskCell}>
                      <input
                        className={`${styles.input} ${styles.releaseTableInput}`}
                        type="text"
                        value={r.taskTitle ?? ""}
                        onChange={e => setReleaseValue(r.id, "taskTitle", e.target.value)}
                        disabled={saving}
                      />
                    </td>
                    <td className={styles.releaseTableNotes}>
                      <input
                        className={`${styles.input} ${styles.releaseTableInput} ${styles.releaseTableNotesInput}`}
                        type="text"
                        value={r.notes ?? ""}
                        onChange={e => setReleaseValue(r.id, "notes", e.target.value)}
                        disabled={saving}
                      />
                    </td>
                    <td className={styles.releaseTableApprovedCell}>{r.approvedBy}</td>
                    <td className={`${styles.releaseTableActionCell} ${styles.releaseTableCompactCell}`}>
                      <button
                        type="button"
                        className={styles.releaseTableRemoveButton}
                        onClick={() => removeRelease(r.id)}
                        disabled={saving}
                        aria-label={`Remove release ${r.taskTitle}`}
                        title="Remove release row"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.releaseTableEmpty}>— No releases recorded —</p>
          )}
        </div>

      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span className={`${styles.statusMsg} ${error ? styles.statusError : ""}`}>
          {error  ? `Error: ${error}`  :
           saved  ? "Changes saved."   :
           saving ? "Saving..."        : ""}
        </span>
        {onCancel && (
          <button type="button" className={styles.btnCancel} onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
};

export default ProjectCatalogEditor;
