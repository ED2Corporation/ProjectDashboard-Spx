/**
 * Viewer keys determine which plan tasks an indicator or report considers.
 *  operations — every task (default, current behaviour unchanged)
 *  executive  — only tasks flagged executiveTrack: true in jsonTable
 */
export type ViewerKey = 'operations' | 'executive';

export const parseExecutiveTrack = (jsonTable?: string): boolean => {
  try {
    const parsed = JSON.parse(jsonTable ?? '{}') as Record<string, unknown> | null;
    return parsed?.executiveTrack === true;
  } catch {
    return false;
  }
};

export const filterTasksForViewer = <T extends { jsonTable?: string }>(tasks: T[], viewer: ViewerKey): T[] =>
  viewer === 'operations' ? tasks : tasks.filter(t => parseExecutiveTrack(t.jsonTable));
