import { useCallback, useRef } from "react";

export const useQueuedTaskSave = (
  taskId: string,
  onSave: (item: string, payload?: string) => void | Promise<void>
): ((data: object) => Promise<void>) => {
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  return useCallback((data: object): Promise<void> => {
    const payload = JSON.stringify(data);
    const nextSave = saveQueueRef.current
      .catch(() => undefined)
      .then(() => Promise.resolve(onSave(taskId, payload)));
    saveQueueRef.current = nextSave;
    return nextSave;
  }, [onSave, taskId]);
};
