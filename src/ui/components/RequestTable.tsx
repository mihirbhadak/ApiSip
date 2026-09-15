import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Pin, Star } from 'lucide-react';
import type { CapturedRequest } from '../../shared/model';
import { formatBytes, formatTime } from '../../shared/parse';
import { redactUrl, redactText } from '../../shared/security';
export const allColumns = [
  'Method',
  'URL',
  'Status',
  'Type',
  'Time',
  'Size',
  'Domain',
  'Timestamp',
  'Initiator',
  'Protocol',
  'MIME',
  'Tab',
  'Frame',
  'Cache',
  'Tags',
] as const;
export type Column = (typeof allColumns)[number];
export type ColumnConfig = { name: Column; width: number };
export const defaultColumns: ColumnConfig[] = [
  { name: 'Method', width: 66 },
  { name: 'URL', width: 260 },
  { name: 'Status', width: 60 },
  { name: 'Type', width: 70 },
  { name: 'Time', width: 72 },
  { name: 'Size', width: 72 },
];
export function columnValue(r: CapturedRequest, c: Column): string | number {
  switch (c) {
    case 'Method':
      return r.request.method;
    case 'URL':
      return r.request.url;
    case 'Status':
      return r.response?.status ?? (r.metadata.error ? 'Error' : 'Pending');
    case 'Type':
      return r.metadata.resourceType;
    case 'Time':
      return r.timing?.total ?? -1;
    case 'Size':
      return r.response?.size ?? -1;
    case 'Domain':
      return new URL(r.request.url).host;
    case 'Timestamp':
      return r.timestamp;
    case 'Initiator':
      return r.initiator ?? '';
    case 'Protocol':
      return r.request.protocol ?? '';
    case 'MIME':
      return r.metadata.mimeType ?? '';
    case 'Tab':
      return r.tabId ?? -1;
    case 'Frame':
      return r.frameId ?? '';
    case 'Cache':
      return r.metadata.fromCache === undefined ? '—' : r.metadata.fromCache ? 'Cached' : 'Network';
    case 'Tags':
      return r.tags.join(' ');
  }
}
function cell(r: CapturedRequest, c: Column, mask: boolean) {
  if (c === 'URL') {
    const u = new URL(mask ? redactUrl(r.request.url) : r.request.url);
    return (
      <>
        <span className="url-path">
          {u.pathname}
          {u.search}
        </span>
        <span className="url-domain">{u.host}</span>
      </>
    );
  }
  if (c === 'Method')
    return (
      <span className={'method method-' + r.request.method.toLowerCase()}>{r.request.method}</span>
    );
  if (c === 'Status')
    return (
      <span
        className={
          (r.response?.status ?? 0) >= 400 || r.metadata.error
            ? 'status-error'
            : r.response
              ? 'status-success'
              : 'muted'
        }
      >
        {r.metadata.error ? 'Error' : (r.response?.status ?? '…')}
      </span>
    );
  if (c === 'Type')
    return (
      new Map([
        ['xmlhttprequest', 'XHR'],
        ['main_frame', 'document'],
        ['sub_frame', 'frame'],
      ]).get(r.metadata.resourceType) ?? r.metadata.resourceType
    );
  if (c === 'Time') return formatTime(r.timing?.total);
  if (c === 'Size') return formatBytes(r.response?.size);
  if (c === 'Timestamp') return new Date(r.timestamp).toLocaleTimeString();
  if (c === 'Initiator') return mask && r.initiator ? redactUrl(r.initiator) : (r.initiator ?? '—');
  const value = String(columnValue(r, c));
  return mask ? redactText(value) : value;
}
export function RequestTable({
  rows,
  selected,
  focused,
  onSelect,
  onToggle,
  onContext,
  columns,
  onColumns,
  sort,
  onSort,
  mask,
  onFavorite,
}: {
  rows: CapturedRequest[];
  selected: Set<string>;
  focused?: string;
  onSelect: (r: CapturedRequest) => void;
  onToggle: (id: string) => void;
  onContext: (r: CapturedRequest, x: number, y: number) => void;
  columns: ColumnConfig[];
  onColumns: (columns: ColumnConfig[]) => void;
  sort: { column: Column; desc: boolean };
  onSort: (column: Column) => void;
  mask: boolean;
  onFavorite: (r: CapturedRequest) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    [scroll, setScroll] = useState(0),
    [height, setHeight] = useState(600);
  const [unseen, setUnseen] = useState(0),
    previous = useRef(rows.length);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    setHeight(element.clientHeight || 600);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (rows.length > previous.current && scroll > 50)
      setUnseen((n) => n + rows.length - previous.current);
    previous.current = rows.length;
  }, [rows.length, scroll]);
  const rowHeight = 36,
    start = Math.max(0, Math.floor(scroll / rowHeight) - 5),
    end = Math.min(rows.length, start + Math.ceil(height / rowHeight) + 12);
  const grid =
    '32px 28px ' +
    columns
      .map((c) => (c.name === 'URL' ? 'minmax(' + c.width + 'px, 1fr)' : c.width + 'px'))
      .join(' ');
  const width = 60 + columns.reduce((n, c) => n + c.width, 0);
  const resize = (index: number, clientX: number) => {
    const initial = columns[index]!.width;
    const move = (event: PointerEvent) =>
      onColumns(
        columns.map((c, i) =>
          i === index
            ? { ...c, width: Math.max(50, Math.min(900, initial + event.clientX - clientX)) }
            : c,
        ),
      );
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };
  return (
    <div className="request-table">
      <div
        className="table-scroll"
        ref={viewport}
        tabIndex={0}
        role="table"
        aria-label="Request list"
        aria-rowcount={rows.length + 1}
        onScroll={(e) => {
          setScroll(e.currentTarget.scrollTop);
          if (e.currentTarget.scrollTop < 50) setUnseen(0);
        }}
        onKeyDown={(e) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const current = rows.findIndex((r) => r.id === focused);
          const next =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? rows.length - 1
                : Math.max(
                    0,
                    Math.min(rows.length - 1, current + (e.key === 'ArrowDown' ? 1 : -1)),
                  );
          const row = rows[next];
          if (row) {
            onSelect(row);
            if (
              viewport.current &&
              (next * rowHeight < scroll || next * rowHeight > scroll + height - 80)
            )
              viewport.current.scrollTop = next * rowHeight;
          }
        }}
      >
        <div
          className="table-head"
          role="row"
          style={{ gridTemplateColumns: grid, minWidth: width }}
        >
          <span role="columnheader" aria-label="Select" />
          <span role="columnheader" aria-label="Favorite" />
          {columns.map((c, i) => (
            <div
              role="columnheader"
              key={c.name}
              aria-sort={sort.column === c.name ? (sort.desc ? 'descending' : 'ascending') : 'none'}
            >
              <button onClick={() => onSort(c.name)}>
                {c.name}
                {sort.column === c.name &&
                  (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
              </button>
              <span
                className="column-resizer"
                role="separator"
                aria-label={'Resize ' + c.name}
                aria-orientation="vertical"
                aria-valuenow={c.width}
                aria-valuemin={50}
                aria-valuemax={900}
                aria-valuetext={c.width + ' pixels'}
                tabIndex={0}
                onPointerDown={(e) => {
                  e.preventDefault();
                  resize(i, e.clientX);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    e.stopPropagation();
                    onColumns(
                      columns.map((item, index) =>
                        index === i
                          ? {
                              ...item,
                              width: Math.max(
                                50,
                                Math.min(900, item.width + (e.key === 'ArrowRight' ? 10 : -10)),
                              ),
                            }
                          : item,
                      ),
                    );
                  }
                }}
              />
            </div>
          ))}
        </div>
        <div
          role="rowgroup"
          style={{ height: rows.length * rowHeight, minWidth: width, position: 'relative' }}
        >
          {rows.slice(start, end).map((r, i) => (
            <div
              key={r.id}
              role="row"
              aria-rowindex={start + i + 2}
              aria-selected={focused === r.id}
              data-testid="request-row"
              className={
                'table-row ' + (focused === r.id ? 'selected' : '') + (r.isPinned ? ' pinned' : '')
              }
              style={{
                gridTemplateColumns: grid,
                position: 'absolute',
                top: (start + i) * rowHeight,
                width: '100%',
                height: rowHeight,
              }}
              onClick={() => onSelect(r)}
              onContextMenu={(e) => {
                e.preventDefault();
                onSelect(r);
                onContext(r, e.clientX, e.clientY);
              }}
            >
              <span role="cell">
                <input
                  type="checkbox"
                  aria-label={
                    'Select ' +
                    r.request.method +
                    ' ' +
                    (mask ? redactUrl(r.request.url) : r.request.url)
                  }
                  checked={selected.has(r.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggle(r.id)}
                />
              </span>
              <span role="cell">
                <button
                  className="icon-button star"
                  aria-label={r.isFavorite ? 'Unsave request' : 'Save request'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFavorite(r);
                  }}
                >
                  {r.isPinned ? (
                    <Pin size={12} />
                  ) : (
                    <Star size={12} fill={r.isFavorite ? 'currentColor' : 'none'} />
                  )}
                </button>
              </span>
              {columns.map((c) => (
                <span
                  role="cell"
                  title={
                    mask
                      ? c.name === 'URL' || c.name === 'Initiator'
                        ? redactUrl(String(columnValue(r, c.name)))
                        : redactText(String(columnValue(r, c.name)))
                      : String(columnValue(r, c.name))
                  }
                  className={c.name === 'URL' ? 'url-cell' : 'mono'}
                  key={c.name}
                >
                  {cell(r, c.name, mask)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      {unseen > 0 && (
        <button
          className="new-requests"
          onClick={() => {
            if (viewport.current)
              viewport.current.scrollTop = sort.desc ? 0 : viewport.current.scrollHeight;
            setUnseen(0);
          }}
        >
          {unseen} new requests · Jump to latest
        </button>
      )}
    </div>
  );
}
