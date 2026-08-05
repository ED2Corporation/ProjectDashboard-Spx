
export const parseWbs = (wbs: string): number[] =>
    wbs.split(".").map(s => Number(s) || 0);

export const compareWbs = (a: string, b: string): number => {
    const aa = parseWbs(a);
    const bb = parseWbs(b);
    const len = Math.max(aa.length, bb.length);

    for (let i = 0; i < len; i++) {
        const av = aa[i] ?? 0;
        const bv = bb[i] ?? 0;
        if (av < bv) return -1;
        if (av > bv) return 1;
    }
    return 0;
};

export type WbsMoveDirection = "first" | "up" | "down" | "last";

export interface IWbsReorderEntry {
    id: string;
    wbs: string;
    sortOrder?: number;
}

export interface IWbsReorderResult<T extends IWbsReorderEntry> {
    item: T;
    wbs: string;
    sortOrder: number;
}

const getParentWbs = (wbs: string): string => {
    const parts = wbs.split(".");
    parts.pop();
    return parts.join(".");
};

const isDescendantOrSelf = (candidateWbs: string, rootWbs: string): boolean =>
    candidateWbs === rootWbs || candidateWbs.startsWith(`${rootWbs}.`);

const formatWbsSibling = (parentWbs: string, index: number, width: number): string => {
    const suffix = String(index + 1).padStart(width, "0");
    return parentWbs ? `${parentWbs}.${suffix}` : suffix;
};

export function reorderWbsEntriesForMove<T extends IWbsReorderEntry>(
    entries: T[],
    targetId: string,
    direction: WbsMoveDirection
): IWbsReorderResult<T>[] {
    const orderedEntries = entries
        .slice()
        .sort((a, b) =>
            (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) ||
            compareWbs(a.wbs || "", b.wbs || "")
        );

    const target = orderedEntries.find(entry => entry.id === targetId);
    if (!target?.wbs) {
        return orderedEntries.map((item, index) => ({
            item,
            wbs: item.wbs,
            sortOrder: index + 1,
        }));
    }

    const targetParts = target.wbs.split(".");
    const targetDepth = targetParts.length;
    const parentWbs = getParentWbs(target.wbs);
    const siblingRoots = orderedEntries.filter(entry =>
        entry.wbs &&
        entry.wbs.split(".").length === targetDepth &&
        getParentWbs(entry.wbs) === parentWbs
    );
    const currentIndex = siblingRoots.findIndex(entry => entry.id === targetId);

    if (currentIndex < 0) {
        return orderedEntries.map((item, index) => ({
            item,
            wbs: item.wbs,
            sortOrder: index + 1,
        }));
    }

    if ((direction === "first" || direction === "up") && currentIndex === 0) {
        return orderedEntries.map((item, index) => ({
            item,
            wbs: item.wbs,
            sortOrder: index + 1,
        }));
    }

    if ((direction === "last" || direction === "down") && currentIndex === siblingRoots.length - 1) {
        return orderedEntries.map((item, index) => ({
            item,
            wbs: item.wbs,
            sortOrder: index + 1,
        }));
    }

    const reorderedRoots = siblingRoots.slice();
    const [movedRoot] = reorderedRoots.splice(currentIndex, 1);

    if (direction === "first") {
        reorderedRoots.unshift(movedRoot);
    } else if (direction === "last") {
        reorderedRoots.push(movedRoot);
    } else if (direction === "up") {
        reorderedRoots.splice(currentIndex - 1, 0, movedRoot);
    } else {
        reorderedRoots.splice(currentIndex + 1, 0, movedRoot);
    }

    const segmentWidth = Math.max(
        ...siblingRoots.map(entry => entry.wbs.split(".")[targetDepth - 1]?.length ?? 1)
    );
    const rootMap = new Map<string, string>();
    reorderedRoots.forEach((entry, index) => {
        rootMap.set(entry.wbs, formatWbsSibling(parentWbs, index, segmentWidth));
    });

    const withUpdatedWbs = orderedEntries.map(item => {
        const owningRoot = siblingRoots.find(root => isDescendantOrSelf(item.wbs, root.wbs));
        if (!owningRoot) return { item, wbs: item.wbs };

        const nextRootWbs = rootMap.get(owningRoot.wbs) ?? owningRoot.wbs;
        const suffix = item.wbs.slice(owningRoot.wbs.length);
        return { item, wbs: `${nextRootWbs}${suffix}` };
    });

    return withUpdatedWbs
        .sort((a, b) => compareWbs(a.wbs, b.wbs))
        .map((entry, index) => ({
            ...entry,
            sortOrder: index + 1,
        }));
}

/**
 * Returns the WBS that should be assigned to a new task inserted immediately
 * after `sourceWbs`. Increments the last numeric segment preserving zero-padding.
 * e.g. "3.05" → "3.06",  "3.9" → "3.10",  "5" → "6"
 */
export function nextWbsAfterInsert(sourceWbs: string): string {
    const parts = sourceWbs.split(".");
    const lastIdx = parts.length - 1;
    const lastStr = parts[lastIdx];
    const newNum = (Number(lastStr) || 0) + 1;
    parts[lastIdx] = String(newNum).padStart(lastStr.length, "0");
    return parts.join(".");
}

/**
 * Given the WBS of a deleted task (`sourceWbs`, e.g. "3.05"), computes the new WBS
 * for `taskWbs` if that task needs to shift DOWN by one (to fill the gap), or
 * returns null if the task is unaffected.
 *
 * Mirror of computeShiftedWbs — same prefix/depth rules, but decrements the segment.
 * Children cascade: "3.06.01" shifts to "3.05.01" when "3.05" is deleted.
 */
export function computeUnshiftedWbs(sourceWbs: string, taskWbs: string): string | undefined {
    const sourceParts = sourceWbs.split(".");
    const taskParts   = taskWbs.split(".");
    const depth      = sourceParts.length;
    const shiftIdx   = depth - 1;

    if (taskParts.length < depth) return undefined;

    for (let i = 0; i < shiftIdx; i++) {
        if (taskParts[i] !== sourceParts[i]) return undefined;
    }

    const sourceSegNum = Number(sourceParts[shiftIdx]) || 0;
    const taskSegNum   = Number(taskParts[shiftIdx])   || 0;

    if (taskSegNum <= sourceSegNum) return undefined;

    const newParts = [...taskParts];
    const origStr  = taskParts[shiftIdx];
    const newNum   = taskSegNum - 1;
    newParts[shiftIdx] = String(newNum).padStart(origStr.length, "0");
    return newParts.join(".");
}

/**
 * Given the WBS of the task after which we are inserting (`sourceWbs`, e.g. "3.05"),
 * computes the new WBS for `taskWbs` if that task needs to shift up by one, or
 * returns null if the task is unaffected.
 *
 * Rules:
 *  - The task must share the same parent prefix as sourceWbs.
 *  - The segment at the source depth must be strictly greater than the source segment.
 *  - Children cascade: "3.06.01" shifts to "3.07.01" when source is "3.05".
 */
export function computeShiftedWbs(sourceWbs: string, taskWbs: string): string | undefined {
    const sourceParts = sourceWbs.split(".");
    const taskParts   = taskWbs.split(".");
    const depth      = sourceParts.length;      // e.g. 2 for "3.05"
    const shiftIdx   = depth - 1;               // index of segment to increment

    // Task must have at least as many segments as the source
    if (taskParts.length < depth) return undefined;

    // Prefix before the shift point must match exactly
    for (let i = 0; i < shiftIdx; i++) {
        if (taskParts[i] !== sourceParts[i]) return undefined;
    }

    const sourceSegNum = Number(sourceParts[shiftIdx]) || 0;
    const taskSegNum   = Number(taskParts[shiftIdx])   || 0;

    // Only tasks strictly after the source segment are shifted
    if (taskSegNum <= sourceSegNum) return undefined;

    const newParts = [...taskParts];
    const origStr  = taskParts[shiftIdx];
    const newNum   = taskSegNum + 1;
    newParts[shiftIdx] = String(newNum).padStart(origStr.length, "0");
    return newParts.join(".");
}
