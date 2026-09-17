import { editorUrl } from '../shared/editor';
import type { CapturedRequest, RequestData, Settings, ReplayCookies } from '../shared/model';
import { createDraft, deleteDraft } from '../storage/drafts';
import { sendCommand } from '../shared/messages';

export async function openEditorTab(
  record: CapturedRequest,
  request: RequestData,
  context: Settings['replayContext'],
  cookies?: ReplayCookies,
) {
  if (!globalThis.chrome?.runtime?.id)
    throw new Error('Open the installed extension to use editor tabs.');
  const draft = await createDraft(record.id, request, context, cookies);
  try {
    await chrome.tabs.create({ url: editorUrl(location.href, draft.id) });
  } catch {
    await deleteDraft(draft.id);
    throw new Error('Chrome could not open the editor tab. Please try again.');
  }
}
export async function focusInspector() {
  await sendCommand({ type: 'open-inspector' });
}
