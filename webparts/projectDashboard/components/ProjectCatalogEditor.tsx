import * as React from "react";
import { useState } from "react";
import { IProjectCatalogItem } from "../../../models/IProjectService";
import { ProjectService } from "../services/ProjectService";
import styles from "./ProjectCatalogEditor.module.scss";

// ─── Status options ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "Active",  variantCard: "statusCardActive",  dot: "statusActive"  },
  { value: "Delayed", variantCard: "statusCardDelayed", dot: "statusDelayed" },
  { value: "Archived", variantCard: "statusCardArchived", dot: "statusArchived" },
  { value: "Hidden",  variantCard: "statusCardHidden",  dot: "statusHidden"  },
] as const;

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
  const [form, setForm] = useState<IProjectCatalogItem>({ ...project });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);

  const set = (field: keyof IProjectCatalogItem, value: string | number): void =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async (): Promise<void> => {
    if (!project.ProjectId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const patch: Partial<IProjectCatalogItem> = {
        Title:         form.Title,
        ProjectNumber: form.ProjectNumber,
        Year:          form.Year   ? Number(form.Year)   : undefined,
        Team:          form.Team,
        Status:        form.Status,
        Customer:      form.Customer,
      };
      await projectService.updateCatalogItem(project.ProjectId, patch);
      setSaved(true);
      onSaved?.({ ...form });
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
          <label className={styles.label}>Project name</label>
          <input
            className={styles.input}
            type="text"
            value={form.Title}
            onChange={e => set("Title", e.target.value)}
          />
        </div>

        {/* Project number */}
        <div className={styles.field}>
          <label className={styles.label}>Project number</label>
          <input
            className={styles.input}
            type="text"
            value={form.ProjectNumber ?? ""}
            onChange={e => set("ProjectNumber", e.target.value)}
          />
        </div>

        {/* Year */}
        <div className={styles.field}>
          <label className={styles.label}>Year</label>
          <input
            className={styles.input}
            type="number"
            value={form.Year ?? ""}
            onChange={e => set("Year", e.target.value)}
          />
        </div>

        {/* Customer — full width */}
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label className={styles.label}>Customer</label>
          <input
            className={styles.input}
            type="text"
            value={form.Customer ?? ""}
            onChange={e => set("Customer", e.target.value)}
          />
        </div>

        {/* Team */}
        <div className={styles.field}>
          <label className={styles.label}>Team</label>
          <input
            className={styles.input}
            type="text"
            value={form.Team ?? ""}
            onChange={e => set("Team", e.target.value)}
          />
        </div>

        {/* Status */}
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label className={styles.label}>Status</label>
          <div className={styles.statusPicker}>
            {STATUS_OPTIONS.map(opt => {
              const isSelected = (form.Status ?? "Active") === opt.value;
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
