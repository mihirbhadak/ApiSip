import type { CapturedRequest, Diagnostic, Settings } from '../shared/model';
export interface CaptureContext {
  settings(): Promise<Settings>;
  accepts(tabId: number): Promise<boolean>;
  update(
    key: string,
    change: (record?: CapturedRequest) => CapturedRequest | undefined,
  ): Promise<CapturedRequest | undefined>;
  report(message: string, level?: Diagnostic['level']): void;
  epoch: Promise<string>;
}
export interface CaptureProvider {
  readonly name: 'webRequest' | 'debugger';
  register(): void;
  reconcile(settings: Settings): Promise<void>;
}
export function serialQueue(report: (message: string) => void) {
  const tasks = new Map<string, Promise<void>>();
  return (key: string, task: () => Promise<void>) => {
    const next = (tasks.get(key) ?? Promise.resolve())
      .then(task)
      .catch(() =>
        report(
          'Capture event could not be stored. Check available local storage and reload the extension if the problem continues.',
        ),
      );
    tasks.set(key, next);
    void next.finally(() => {
      if (tasks.get(key) === next) tasks.delete(key);
    });
  };
}
