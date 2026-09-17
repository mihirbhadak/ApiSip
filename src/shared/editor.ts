import type { RequestData, Settings, ReplayCookies } from './model';

export type EditorDraft = {
  id: string;
  sourceId: string;
  request: RequestData;
  context: Settings['replayContext'];
  cookies?: ReplayCookies;
  revision: number;
  updatedAt: number;
};

export function editorUrl(inspectorUrl: string, draftId?: string) {
  const url = new URL(inspectorUrl);
  url.search = '';
  url.hash = draftId ? '/editor/' + encodeURIComponent(draftId) : '';
  return url.href;
}

export function editorRoute(hash: string): string | undefined {
  if (!hash.startsWith('#/editor/')) return undefined;
  try {
    return decodeURIComponent(hash.slice('#/editor/'.length));
  } catch {
    return '';
  }
}
