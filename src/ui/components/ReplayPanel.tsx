import type { CapturedRequest, RequestData, ReplayResult, Settings } from '../../shared/model';
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
  onSend: (request: RequestData, context: Settings['replayContext']) => Promise<ReplayResult>;
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
        onOpenInTab={(request, context) => openEditorTab(record, request, context)}
      />
      <hr />
      <ReplayResults r={r} copy={copy} />
    </>
  );
}
