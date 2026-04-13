
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
export function computeUnshiftedWbs(sourceWbs: string, taskWbs: string): string | null {
    const sourceParts = sourceWbs.split(".");
    const taskParts   = taskWbs.split(".");
    const depth      = sourceParts.length;
    const shiftIdx   = depth - 1;

    if (taskParts.length < depth) return null;

    for (let i = 0; i < shiftIdx; i++) {
        if (taskParts[i] !== sourceParts[i]) return null;
    }

    const sourceSegNum = Number(sourceParts[shiftIdx]) || 0;
    const taskSegNum   = Number(taskParts[shiftIdx])   || 0;

    if (taskSegNum <= sourceSegNum) return null;

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
export function computeShiftedWbs(sourceWbs: string, taskWbs: string): string | null {
    const sourceParts = sourceWbs.split(".");
    const taskParts   = taskWbs.split(".");
    const depth      = sourceParts.length;      // e.g. 2 for "3.05"
    const shiftIdx   = depth - 1;               // index of segment to increment

    // Task must have at least as many segments as the source
    if (taskParts.length < depth) return null;

    // Prefix before the shift point must match exactly
    for (let i = 0; i < shiftIdx; i++) {
        if (taskParts[i] !== sourceParts[i]) return null;
    }

    const sourceSegNum = Number(sourceParts[shiftIdx]) || 0;
    const taskSegNum   = Number(taskParts[shiftIdx])   || 0;

    // Only tasks strictly after the source segment are shifted
    if (taskSegNum <= sourceSegNum) return null;

    const newParts = [...taskParts];
    const origStr  = taskParts[shiftIdx];
    const newNum   = taskSegNum + 1;
    newParts[shiftIdx] = String(newNum).padStart(origStr.length, "0");
    return newParts.join(".");
}
