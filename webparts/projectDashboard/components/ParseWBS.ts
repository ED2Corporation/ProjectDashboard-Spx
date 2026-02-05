

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
