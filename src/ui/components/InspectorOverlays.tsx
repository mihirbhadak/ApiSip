import { storeImport } from '../../storage/import';
import { ShieldCheck } from 'lucide-react';
import { uid } from '../../shared/model';
import { sendCommand } from '../../shared/messages';
import { importRecords } from '../../export/formats';
import { mutateRecord, saveEntity } from '../../storage/repository';
import { FilterBuilder } from './FilterBuilder';
import { ExportDialog } from './ExportDialog';
import { SettingsDialog } from './SettingsDialog';
import { CommandPalette } from './CommandPalette';
import { ConfirmDialog } from './Dialog';
import { EntityDialog } from './EntityDialog';
import { CollectionDialog, ColumnsDialog, RequestMenu } from './RequestActions';
import type { InspectorController } from '../use-inspector-controller';
import { RunMonitor } from '../runner/RunMonitor';
export function InspectorOverlays({ controller }: { controller: InspectorController }) {
  const {
    importInput,
    task,
    settings,
    changed,
    notify,
    modal,
    expression,
    setModal,
    setExpression,
    selected,
    visible,
    entities,
    state,
    updateSettings,
    refresh,
    commands,
    columns,
    setColumns,
    scopedEntities,
    recordId,
    management,
    context,
    contextActions,
    setContext,
    toast,
    clear,
  } = controller;
  return (
    <>
      {modal === 'runs' && <RunMonitor onClose={() => setModal('')} />}{' '}
      <input
        ref={importInput}
        type="file"
        accept=".json,.har,application/json"
        className="visually-hidden"
        aria-label="Import file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          task(async () => {
            if (file.size > 100 * 1048576)
              throw new Error('Import files must be smaller than 100 MB.');
            const backup = importRecords(
              await file.text(),
              settings.workspaceId,
              settings.sessionId,
            );
            await storeImport(backup);
            await changed();
            notify('Imported ' + backup.requests.length + ' requests');
          });
        }}
      />
      {modal === 'filters' && (
        <FilterBuilder
          expression={expression}
          scope={
            controller.viewSession === 'all'
              ? { workspaceId: settings.workspaceId }
              : { sessionId: controller.viewSession || settings.sessionId }
          }
          onClose={() => setModal('')}
          onApply={(e) => {
            setExpression(e);
            setModal('');
          }}
          onSave={(name, expression) =>
            task(async () => {
              await saveEntity({
                id: uid(),
                kind: 'filter',
                name,
                expression,
                workspaceId: settings.workspaceId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
              setExpression(expression);
              setModal('');
              await changed();
              notify('Filter saved');
            })
          }
        />
      )}
      {modal === 'export' && (
        <ExportDialog
          selected={selected}
          filtered={visible}
          settings={settings}
          entities={entities}
          notify={notify}
          onClose={() => setModal('')}
        />
      )}
      {modal === 'settings' && (
        <SettingsDialog
          state={state}
          entityCounts={{
            workspaces: entities.filter((e) => e.kind === 'workspace').length,
            sessions: entities.filter((e) => e.kind === 'session').length,
          }}
          onSave={updateSettings}
          onRetry={async () => {
            await sendCommand({ type: 'retry-debugger' });
            await refresh();
          }}
          onClear={clear}
          onClose={() => setModal('')}
        />
      )}
      {modal === 'commands' && <CommandPalette commands={commands} onClose={() => setModal('')} />}
      {modal === 'columns' && (
        <ColumnsDialog columns={columns} setColumns={setColumns} onClose={() => setModal('')} />
      )}
      {modal === 'collection' && (
        <CollectionDialog
          entities={scopedEntities}
          count={selected.size || (recordId ? 1 : 0)}
          onClose={() => setModal('')}
          onCreate={() => {
            setModal('');
            management.create('collection');
          }}
          onSelect={(collectionId) =>
            task(async () => {
              for (const id of selected.size ? selected : recordId ? [recordId] : [])
                await mutateRecord(id, (r) => ({ ...r, collectionId, isFavorite: true }));
              await changed();
              setModal('');
              notify('Requests added to collection');
            })
          }
        />
      )}
      {management.naming && (
        <EntityDialog
          title={management.naming.title}
          initial={management.naming.initial}
          onSave={management.naming.save}
          onClose={() => management.setNaming(undefined)}
        />
      )}
      {management.confirmation && (
        <ConfirmDialog
          title={management.confirmation.title}
          description={management.confirmation.description}
          onClose={() => management.setConfirmation(undefined)}
          onConfirm={() => {
            const action = management.confirmation!.action;
            management.setConfirmation(undefined);
            task(action);
          }}
        />
      )}
      {context && context.recordId === recordId && contextActions.length > 0 && (
        <RequestMenu
          position={context}
          actions={contextActions}
          onClose={() => setContext(undefined)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <ShieldCheck size={15} />
          {toast}
        </div>
      )}
    </>
  );
}
