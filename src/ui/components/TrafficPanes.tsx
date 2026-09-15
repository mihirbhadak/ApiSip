import { Activity, Search, ShieldCheck } from 'lucide-react';
import { sendCommand } from '../../shared/messages';
import { Analytics } from './Analytics';
import { RequestTable } from './RequestTable';
import { RequestDetails } from './RequestDetails';
import type { InspectorController } from '../use-inspector-controller';
export function TrafficPanes({ controller }: { controller: InspectorController }) {
  const {
    view,
    visible,
    select,
    recordId,
    panelWidth,
    selected,
    setSelected,
    setContext,
    columns,
    setColumns,
    sort,
    setSort,
    settings,
    updateRecord,
    notify,
    search,
    expression,
    loading,
    setSearch,
    setExpression,
    task,
    capture,
    setPanelWidth,
    record,
    copy,
    detailTab,
    setDetailTab,
    setRecordId,
    saveDraft,
    refresh,
  } = controller;
  return (
    <>
      {' '}
      {view === 'analytics' ? (
        <Analytics rows={visible} onSelect={select} />
      ) : (
        <div className="inspector-panes">
          <section
            className="request-pane"
            style={{ width: recordId ? 100 - panelWidth + '%' : '100%' }}
            aria-label="Network traffic"
          >
            {visible.length ? (
              <RequestTable
                rows={visible}
                selected={selected}
                focused={recordId}
                onSelect={select}
                onToggle={(id) =>
                  setSelected((old) => {
                    const next = new Set(old);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onContext={(_r, x, y) => setContext({ x, y })}
                columns={columns}
                onColumns={setColumns}
                sort={sort}
                onSort={(column) =>
                  setSort({ column, desc: column === sort.column ? !sort.desc : false })
                }
                mask={settings.maskSecrets}
                onFavorite={(r) => {
                  updateRecord({ isFavorite: !r.isFavorite }, r.id);
                  notify(r.isFavorite ? 'Request unsaved' : 'Request saved');
                }}
              />
            ) : (
              <div className="empty-state">
                <span className="empty-icon">
                  {search || expression ? <Search size={28} /> : <Activity size={30} />}
                </span>
                <h2>
                  {loading
                    ? 'Loading requests…'
                    : search || expression
                      ? 'No requests match your filters'
                      : 'Your next request starts here'}
                </h2>
                <p>
                  {loading
                    ? 'Reading local history.'
                    : search || expression
                      ? 'Try a different search or clear your filters.'
                      : 'Open a webpage and start browsing. Captured requests will appear here in real time.'}
                </p>
                {!loading && (
                  <button
                    className="primary"
                    onClick={() => {
                      if (search || expression) {
                        setSearch('');
                        setExpression('');
                      } else task(capture);
                    }}
                  >
                    {search || expression
                      ? 'Clear filters'
                      : settings.recording
                        ? 'Pause capture'
                        : 'Start capturing'}
                  </button>
                )}
                <div className="empty-footnote">
                  <ShieldCheck size={14} />
                  Capture stays on this device. Replay sends to your chosen API.
                </div>
              </div>
            )}
          </section>
          {recordId && (
            <>
              <div
                className="panel-resizer"
                role="separator"
                aria-label="Resize detail panel"
                aria-orientation="vertical"
                aria-valuemin={28}
                aria-valuemax={70}
                aria-valuenow={panelWidth}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
                    setPanelWidth(
                      Math.max(28, Math.min(70, panelWidth + (e.key === 'ArrowLeft' ? 2 : -2))),
                    );
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  const start = e.clientX,
                    initial = panelWidth,
                    width = e.currentTarget.parentElement!.clientWidth;
                  const move = (event: PointerEvent) =>
                    setPanelWidth(
                      Math.max(28, Math.min(70, initial - ((event.clientX - start) / width) * 100)),
                    );
                  const stop = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', stop);
                  };
                  window.addEventListener('pointermove', move);
                  window.addEventListener('pointerup', stop, { once: true });
                }}
              />
              <div className="detail-pane" style={{ width: panelWidth + '%' }}>
                {record?.id === recordId ? (
                  <RequestDetails
                    key={record.id}
                    record={record}
                    settings={settings}
                    copy={copy}
                    tab={detailTab}
                    setTab={setDetailTab}
                    onClose={() => setRecordId(undefined)}
                    onUpdate={updateRecord}
                    onSave={saveDraft}
                    onSend={async (request, context) => {
                      const result = await sendCommand({
                        type: 'replay',
                        id: record.id,
                        request,
                        context,
                      });
                      await refresh();
                      return result;
                    }}
                  />
                ) : (
                  <div className="empty-small">Loading request body…</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
