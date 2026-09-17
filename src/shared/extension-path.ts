/** Both the standalone ZIP and repository-root installation share this resolver. */
export function extensionPath(name: string): string {
  const background = chrome.runtime.getManifest().background;
  const worker = background && 'service_worker' in background ? background.service_worker : '';
  return worker.replace(/[^/]+$/, '') + name;
}
