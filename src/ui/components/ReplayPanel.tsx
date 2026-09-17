import type { CapturedRequest, RequestData, Settings } from '../../shared/model';
import type { ReplaySender } from '../../replay/context';
import { RequestEditor } from './RequestEditor';
import { ReplayResults } from './ReplayResults';
import { openEditorTab } from '../editor-actions';
export function ReplayPanel({
  record,
  r,
  settings,
  copy,
  onSend,
  onSave,
}: {
  record: CapturedRequest;
  r: CapturedRequest;
  settings: Settings;
  copy: (text: string) => void;
  onSend: ReplaySender;
  onSave: (request: RequestData) => void;
}) {
  return (
    <>
      <RequestEditor
        key={record.id}
        record={record}
        context={settings.replayContext}
        onSend={onSend}
        onSave={onSave}
        onOpenInTab={(request, context, cookies) =>
          openEditorTab(record, request, context, cookies)
        }
      />
      <hr />
      <ReplayResults r={r} copy={copy} />
    </>
  );
}
