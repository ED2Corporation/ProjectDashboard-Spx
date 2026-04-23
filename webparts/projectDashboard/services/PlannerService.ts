/* eslint-disable require-atomic-updates */
/* eslint-disable guard-for-in */
import { MSGraphClientV3 } from "@microsoft/sp-http";
import { IPlannerListItem, ITaskListItem } from "../../../models";
import { GetDelay } from "../utils/GetDelay";
import { toUtcIso } from "../utils/DateUtils";

export interface IPlanItem {
  id: string;
  title: string;
  owner: string;
}

export interface IBucketItem {
  id: string;
  name: string;
}

export interface IAttachements {
  EvidenceOfCompletion: {
    Url: string,
    Description: string
  },
  checklist: {
    isChecked: boolean,
    title: string,
    orderHint: string
  },

}

export class PlannerService {
  private graphClient: MSGraphClientV3;

  constructor(graphClient: MSGraphClientV3) {
    this.graphClient = graphClient;
  }

  // Fetch the details of a Planner plan
  public async getPlanDetails(planId: string): Promise<ITaskListItem[]> {
    try {
      if (!planId) throw new Error("Plan not defined");

      const bucketsResponse = await this.graphClient
        .api(`/planner/plans/${planId}/buckets`)
        .get();
      const buckets: IBucketItem[] = bucketsResponse.value;

      const tasksResponse = await this.graphClient
        .api(`/planner/plans/${planId}/tasks`)
        .get();
      const tasks: IPlannerListItem[] = tasksResponse.value;

      // Fetch /details for each task in parallel (be mindful of throttling for very large plans)
      const list: ITaskListItem[] = await Promise.all(
        tasks.map(async (t) => {
          let details: any = undefined;
          try {
            details = await this.graphClient.api(`/planner/tasks/${t.id}/details`).get();
          } catch (err) {
            console.warn(`[getPlanDetails] Could not fetch details for ${t.id}`, err);
          }
          return this.mapPlannerToTaskItem(t, buckets, details);
        })
      );

      return list.sort((a, b) => a.Task.localeCompare(b.Task));
    } catch (error) {
      console.error("Error fetching plan details:", error);
      throw error;
    }
  }

  public async populateAttachements(tasks: ITaskListItem[]): Promise<ITaskListItem[]> {
    if (tasks.length > 0) {
      await Promise.all(
        tasks.map(async (task) => {
          const taskDetails = await this.graphClient
            .api(`/planner/tasks/${task.Id}/details`)
            .get();

          // Check whether the task has attachments
          if (taskDetails.references && Object.keys(taskDetails.references).length > 0) {
            const attachments = this.getAttachements(task.Id);
            if ((await attachments).EvidenceOfCompletion?.Description) {
              task.EvidenceOfCompletion = (await attachments).EvidenceOfCompletion;
              task.Checklist = (await attachments).checklist;
            }
          }
          return null;
        })
      );


    }

    return tasks;
  }

  public async updateTaskQuickCompleteBkp(payload: {
    taskId: string;
    percentComplete?: number;
    evidenceUrl?: string;
    evidenceDesc?: string;
  }): Promise<void> {
    const { taskId, percentComplete = 100, evidenceUrl, evidenceDesc } = payload;

    const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();

    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .header("If-Match", task["@odata.etag"])
      .patch({ percentComplete });

    if (!evidenceUrl) return;

    try {
      const details = await this.graphClient
        .api(`/planner/tasks/${taskId}/details`)
        .get();

      const currentRefs = details.references || {};
      const encodedKey = this.encodePlannerReferenceKey(evidenceUrl);

      if (currentRefs[encodedKey]) {
        return;
      }

      const newReferences: any = { ...currentRefs };
      newReferences[encodedKey] = {
        "@odata.type": "#microsoft.graph.plannerExternalReference",
        alias: evidenceDesc || "Evidence of completion",
        previewPriority: " !",
        type: "Other"
      };

      await this.graphClient
        .api(`/planner/tasks/${taskId}/details`)
        .header("If-Match", details["@odata.etag"])
        .patch({ references: newReferences });

    } catch (error) {
      console.error(`Error updating reference for task ${taskId}:`, error);
      throw error;
    }
  }

  public async updateTaskQuickCompleteBkpOk(payload: {
    taskId: string;
    percentComplete?: number;
    evidenceUrl?: string;
    evidenceDesc?: string;
  }): Promise<void> {
    const { taskId, percentComplete = 100, evidenceUrl, evidenceDesc } = payload;

    const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();

    // 1) Update with the percentComplete from the dropdown
    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .header("If-Match", task["@odata.etag"])
      .patch({ percentComplete }); // ← usa el valor del payload

    if (!evidenceUrl) return;

    try {
      const details = await this.graphClient
        .api(`/planner/tasks/${taskId}/details`)
        .get();

      const currentRefs = details.references || {};
      const encodedKey = this.encodePlannerReferenceKey(evidenceUrl);

      if (currentRefs[encodedKey]) {
        return;
      }

      const newReferences: any = { ...currentRefs };
      newReferences[encodedKey] = {
        "@odata.type": "#microsoft.graph.plannerExternalReference",
        alias: evidenceDesc || "Evidence of completion",
        previewPriority: " !",
        type: "Other"
      };

      await this.graphClient
        .api(`/planner/tasks/${taskId}/details`)
        .header("If-Match", details["@odata.etag"])
        .patch({ references: newReferences });

    } catch (error) {
      console.error(`Error updating reference for task ${taskId}:`, error);
    }
  }

  public stripReadOnlyPlannerRefProps(references: Record<string, any>) {
    const allowed = new Set(["@odata.type", "alias", "previewPriority", "type"]);
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(references || {})) {
      const src = references[key] || {};
      cleaned[key] = {};
      for (const prop of Object.keys(src)) {
        if (allowed.has(prop)) cleaned[key][prop] = src[prop];
      }
      // Ensure correct type
      if (!cleaned[key]["@odata.type"]) {
        cleaned[key]["@odata.type"] = "#microsoft.graph.plannerExternalReference";
      }
    }
    return cleaned;
  }

  public async updateTaskQuickCompleteOld(payload: {
    taskId: string;
    percentComplete?: number;
    evidenceUrl?: string;
    evidenceDesc?: string;
  }): Promise<void> {
    const { taskId, percentComplete = 100, evidenceUrl, evidenceDesc } = payload;

    // 1) Update percent complete
    const task = await this.graphClient.api(`/planner/tasks/${taskId}`).get();
    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .header("If-Match", task["@odata.etag"])
      .patch({ percentComplete });

    // 2) Add reference (if applicable)
    if (!evidenceUrl) return;

    const details = await this.graphClient
      .api(`/planner/tasks/${taskId}/details`)
      .get();

    const encodedKey = this.encodePlannerReferenceKey(evidenceUrl);

    // If already exists, bail out
    const exists =
      details.references && Object.prototype.hasOwnProperty.call(details.references, encodedKey);
    if (exists) {
      console.log(`Reference already exists: ${encodedKey}`);
      return;
    }

    // PATCH parcial: solo la nueva clave
    const patchBody = {
      references: {
        [encodedKey]: {
          "@odata.type": "#microsoft.graph.plannerExternalReference",
          alias: evidenceDesc || "Evidence of completion",
          previewPriority: " !",
          type: "Other"
        }
      }
    };

    await this.graphClient
      .api(`/planner/tasks/${taskId}/details`)
      .header("If-Match", details["@odata.etag"])
      .patch(patchBody);

  }

  /******** */
  private encodePlannerReferenceKey(url: string): string {
    return url
      .replace(/%/g, "%25")
      .replace(/\./g, "%2E")
      .replace(/:/g, "%3A")
      .replace(/@/g, "%40")
      .replace(/#/g, "%23");
  }

  private isValidHttpUrl(url?: string): boolean {
    if (!url) return false;
    const u = url.trim();
    return /^https?:\/\//i.test(u);
  }

  public async updateTaskStatus(payload: {
    taskId: string;
    percentComplete?: number;
    finish?: string;
    evidenceUrl?: string;
    evidenceDesc?: string;
    setPreviewAsReference?: boolean;
  }): Promise<void> {
    const {
      taskId,
      percentComplete,
      finish,
      evidenceUrl,
      evidenceDesc,
      setPreviewAsReference = true,
    } = payload;

    await this.updateFromTaskItem(
      {
        Id: taskId,
        Complete: percentComplete,
        Finish: finish,
        EvidenceOfCompletion: (evidenceUrl || evidenceDesc)
          ? { Url: evidenceUrl || "", Description: evidenceDesc || "" }
          : undefined,
      },
      {
        evidenceMode: evidenceUrl ? "replace" : "ignore",
        setPreviewAsReference,
      }
    );
  }

  public async updateTaskFull(
    payload: Partial<ITaskListItem> & {
      Id: string;
      Deliverable?: string;
      Description?: string;
      Complete?: number;
      Start?: string | Date;
      Finish?: string | Date;
      ActualFinish?: string | Date;
      EvidenceOfCompletion?: { Url?: string; Description?: string };
      setPreviewAsReference?: boolean;
    }
  ): Promise<void> {
    const {
      Id,
      Deliverable,
      Complete,
      Start,
      Finish,
      ActualFinish,
      EvidenceOfCompletion,
      setPreviewAsReference = true,
      Description,
    } = payload;

    await this.updateFromTaskItem(
      {
        Id,
        Deliverable,
        Complete,
        Start,
        Finish,
        ActualFinish,
        EvidenceOfCompletion,
        Description,
      },
      {
        evidenceMode: EvidenceOfCompletion?.Url ? "replace" : "ignore",
        setPreviewAsReference,
      }
    );
  }

  public async createEmptyTask(planId: string, bucketId: string): Promise<string> {
    const body = {
      planId,
      bucketId,
      title: "New task"
    };

    const task = await this.graphClient
      .api("/planner/tasks")
      .version("v1.0")
      .post(body);

    return task.id as string;
  }

  public async deleteTask(taskId: string): Promise<void> {
    if (!taskId) {
      throw new Error("deleteTask requires taskId");
    }

    // 1) Read the task to get its ETag
    const task = await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .version("v1.0")
      .get();

    const etag = task["@odata.etag"];
    if (!etag) {
      throw new Error(`No ETag found for planner task ${taskId}`);
    }

    // 2) Delete using If-Match
    await this.graphClient
      .api(`/planner/tasks/${taskId}`)
      .version("v1.0")
      .header("If-Match", etag)
      .delete();
  }

  // Local type-safe helper
  private hasKeys = (o: any): boolean => !!o && typeof o === "object" && Object.keys(o).length > 0;

  public async updateFromTaskItem(
    item: {
      Id: string;
      Deliverable?: string;
      Complete?: number;
      Start?: string | Date;
      Finish?: string | Date;
      ActualFinish?: string | Date;
      Description?: string;
      EvidenceOfCompletion?: { Url?: string; Description?: string };
    },
    options?: {
      evidenceMode?: "ignore" | "merge" | "replace" | "clear";
      setPreviewAsReference?: boolean;
    }
  ): Promise<void> {
    const evidenceMode = options?.evidenceMode ?? "merge";
    const setPreviewAsReference = options?.setPreviewAsReference ?? true;

    // 1) Read current task & details (ETags)
    const task = await this.graphClient.api(`/planner/tasks/${item.Id}`).get();
    let details = await this.graphClient.api(`/planner/tasks/${item.Id}/details`).get();

    // 2) Build task patch
    const taskPatch: any = {};

    if (typeof item.Complete === "number") {
      taskPatch.percentComplete = Math.max(0, Math.min(100, item.Complete));
    }
    if (item.Deliverable) {
      taskPatch.title = item.Deliverable;
    }

    // Dates → normalize using toUtcIso (timezone-safe)
    const normalize = (v?: string | Date) =>
      v ? toUtcIso(v instanceof Date ? v.toISOString() : v) : null;

    const startIso = normalize(item.Start);
    const dueIso = normalize(item.Finish);
    const completedIso = normalize(item.ActualFinish);

    if (startIso) taskPatch.startDateTime = startIso;
    if (dueIso) taskPatch.dueDateTime = dueIso;
    if (completedIso) taskPatch.completedDateTime = completedIso;

    if (this.hasKeys(taskPatch)) {
      await this.graphClient
        .api(`/planner/tasks/${item.Id}`)
        .header("If-Match", task["@odata.etag"])
        .patch(taskPatch);
    } else {
    }

    // 3) Build details patch (description + references)
    const detailsPatch: any = {};

    if (typeof item.Description === "string") {
      detailsPatch.description = item.Description;
    }

    // references (Evidence of completion)
    const currentRefs: Record<string, any> = details.references || {};
    const currentKeys = Object.keys(currentRefs);

    const urlRaw = item.EvidenceOfCompletion?.Url ?? "";
    const url = (urlRaw || "").trim();
    const hasGui = this.isValidHttpUrl(url);

    if (evidenceMode === "ignore") {
      // do nothing
    } else if (evidenceMode === "clear") {
      if (currentKeys.length > 0) {
        const refs: Record<string, any> = {};
        for (const k of currentKeys) refs[k] = null;
        detailsPatch.references = refs;
        detailsPatch.previewType = "noPreview";
      }
    } else if (evidenceMode === "merge") {
      if (hasGui) {
        const encoded = this.encodePlannerReferenceKey(url);
        const clean = this.stripReadOnlyPlannerRefProps(currentRefs);
        if (!clean[encoded]) {
          clean[encoded] = {
            "@odata.type": "#microsoft.graph.plannerExternalReference",
            alias: (item.EvidenceOfCompletion?.Description || "Evidence of completion").trim(),
            previewPriority: " !",
            type: "Other"
          };
          detailsPatch.references = clean;
          if (setPreviewAsReference) detailsPatch.previewType = "reference";
        }
      }
    } else if (evidenceMode === "replace") {
      const refs: Record<string, any> = {};
      for (const k of currentKeys) refs[k] = null;

      if (hasGui) {
        const encoded = this.encodePlannerReferenceKey(url);
        refs[encoded] = {
          "@odata.type": "#microsoft.graph.plannerExternalReference",
          alias: (item.EvidenceOfCompletion?.Description || "Evidence of completion").trim(),
          previewPriority: " !",
          type: "Other"
        };
        detailsPatch.references = refs;
        detailsPatch.previewType = setPreviewAsReference ? "reference" : "automatic";
      } else {
        detailsPatch.references = refs;
        detailsPatch.previewType = "noPreview";
      }
    }

    if (this.hasKeys(detailsPatch)) {
      try {
        await this.graphClient
          .api(`/planner/tasks/${item.Id}/details`)
          .header("If-Match", details["@odata.etag"])
          .header("Prefer", "return=representation")
          .patch(detailsPatch);
      } catch (err: any) {
        if (err?.statusCode === 412 || err?.status === 412) {
          console.warn("[updateFromTaskItem] 412 on /details. Retrying with fresh ETag…");
          details = await this.graphClient.api(`/planner/tasks/${item.Id}/details`).get();
          await this.graphClient
            .api(`/planner/tasks/${item.Id}/details`)
            .header("If-Match", details["@odata.etag"])
            .header("Prefer", "return=representation")
            .patch(detailsPatch);
        } else {
          throw err;
        }
      }
    } else {
    }
  }

  private async getAttachements(taskId: string): Promise<IAttachements> {
    const attachement: IAttachements = {
      EvidenceOfCompletion: { Url: "", Description: "" },
      checklist: { isChecked: false, title: "", orderHint: "" },
    };
    const taskDetails = await this.graphClient
      .api(`/planner/tasks/${taskId}/details`)
      .get();

    if (taskDetails.references) {
      const references = taskDetails.references;
      for (const reference in references) {
        attachement.EvidenceOfCompletion.Url = decodeURI(decodeURIComponent(reference)) || "";
        attachement.EvidenceOfCompletion.Description = references[reference].alias || "";
      }
    }
    return attachement || {
      EvidenceOfCompletion: { Url: "", Description: "" },
      checklist: { isChecked: false, title: "", orderHint: "" },
    };
  }

  private getBucketNameById(bucketId: string, buckets: IBucketItem[]): string {
    const bucket = buckets.find(b => b.id === bucketId);
    return bucket ? bucket.name : "";
  }

  // Get the plan ID by its display name
  public async getPlanId(groupId: string, planName: string): Promise<string> {
    try {
      const plansResponse = await this.graphClient
        .api(`/groups/${groupId}/planner/plans`)
        .get();

      const plans: IPlanItem[] = plansResponse.value;

      if (plans.length > 0) {
        const plan = plans.find((p: any) => p.title === planName);
        return plan ? plan.id : "";
      } else {
        console.error("[getPlanId] Error fetching plan details.");
        return "";
      }

    } catch (error) {
      console.error("[getPlanId] Error fetching plan details:", error);
      throw error;
    }
    return "";
  }

  private mapPlannerToTaskItem(
    task: IPlannerListItem,
    buckets: IBucketItem[],
    details?: any
  ): ITaskListItem {
    // Evidence (first reference, if any)
    let evidenceUrl = "";
    let evidenceDesc = "";
    const refs = details?.references || task.references || {};
    const refKeys = Object.keys(refs);
    if (refKeys.length > 0) {
      const firstKey = refKeys[0];
      evidenceUrl = decodeURI(decodeURIComponent(firstKey));
      evidenceDesc = refs[firstKey]?.alias || "";
    }

    return {
      Id: task.id,
      Gate: this.getBucketNameById(task.bucketId, buckets),
      Task: task.title || "",
      Deliverable: task.title || "",
      Complete: task.percentComplete || 0,
      Description: details?.description || task.description || "",
      Start: task.startDateTime ? new Date(task.startDateTime) : undefined,
      Finish: task.dueDateTime ? new Date(task.dueDateTime) : undefined,
      ActualFinish: task.completedDateTime ? new Date(task.completedDateTime) : undefined,
      EvidenceOfCompletion: {
        Url: evidenceUrl,
        Description: evidenceDesc
      },
      Effort: GetDelay(
        task.dueDateTime ? new Date(task.dueDateTime) : new Date(),
        task.completedDateTime ? new Date(task.completedDateTime) : new Date()
      ),
      Title: "",
      WBS: "",
    };
  }
}
