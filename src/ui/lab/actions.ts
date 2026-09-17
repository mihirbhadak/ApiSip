import type { CapturedRequest } from '../../shared/model';
import { newSuite, stepFromCapture } from '../../lab/model';
import { saveSuite } from '../../storage/lab';
import { extensionPath } from '../../shared/extension-path';
export async function openTestLab(record?: CapturedRequest) {
  const suite = record
    ? await saveSuite(newSuite(record.workspaceId, stepFromCapture(record)))
    : undefined;
  await chrome.tabs.create({
    url:
      chrome.runtime.getURL(extensionPath('inspector.html')) +
      '#/lab' +
      (suite ? '/' + suite.id : ''),
  });
}
