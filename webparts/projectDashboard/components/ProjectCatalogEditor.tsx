import * as React from "react";
import { useState } from "react";
import { IProjectCatalogItem } from "../../../models/IProjectService";
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

const formatProjectDetails = (raw?: string): string => {
  if (!raw || !raw.trim()) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
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
    ProjectDetails: formatProjectDetails(project.ProjectDetails),
  });
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
      let normalizedProjectDetails: string | undefined;
      const rawProjectDetails = (form.ProjectDetails || "").trim();
      if (rawProjectDetails) {
        try {
          normalizedProjectDetails = JSON.stringify(JSON.parse(rawProjectDetails));
        } catch {
          throw new Error("ProjectDetails must contain valid JSON.");
        }
      }

      const patch: Partial<IProjectCatalogItem> = {
        Title:         form.Title,
        ProjectNumber: form.ProjectNumber,
        ProjectId:     form.ProjectId,
        Status:        form.Status,
        Customer:      form.Customer,
        ProjectDetails: normalizedProjectDetails,
      };
      await projectService.updateCatalogItem(project.ProjectId, patch);
      const updated: IProjectCatalogItem = {
        ...form,
        ProjectDetails: normalizedProjectDetails ? JSON.stringify(JSON.parse(normalizedProjectDetails), null, 2) : "",
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

        {/* Part name / ProjectId */}
        <div className={styles.field}>
          <label className={styles.label}>Part name (ProjectId)</label>
          <input
            className={styles.input}
            type="text"
            value={form.ProjectId ?? ""}
            onChange={e => set("ProjectId", e.target.value)}
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

        {/* Project details JSON */}
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label className={styles.label}>ProjectDetails (JSON)</label>
          <textarea
            className={styles.textarea}
            value={form.ProjectDetails ?? ""}
            onChange={e => set("ProjectDetails", e.target.value)}
            spellCheck={false}
          />
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
