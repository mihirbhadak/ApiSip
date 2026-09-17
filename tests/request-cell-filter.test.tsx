import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fixture } from './fixtures';
import { compileFilter } from '../src/filters/engine';
import { parseFilter } from '../src/filters/parser';
import { appendCellFilter, requestCellFilter } from '../src/ui/request-cell-filter';
import { allColumns, defaultColumns, RequestTable } from '../src/ui/components/RequestTable';

describe('cell filters', () => {
  it.each(['XHR', 'xmlhttprequest', 'XMLHttpRequest'])(
    'matches %s across capture providers',
    (type) => {
      const record = fixture({ metadata: { ...fixture().metadata, resourceType: type } });
      const filter = requestCellFilter(record, 'Type', true)!;
      expect(filter.label).toBe('Type = XHR');
      const predicate = compileFilter(filter.node);
      for (const alias of ['XHR', 'xmlhttprequest', 'XMLHttpRequest'])
        expect(predicate(fixture({ metadata: { ...record.metadata, resourceType: alias } }))).toBe(
          true,
        );
      expect(predicate(fixture())).toBe(false);
    },
  );
  it('maps every populated column to a matching predicate, preserving exact numbers and all tags', () => {
    const record = fixture({
      frameId: 0,
      initiator: 'https://example.com',
      tags: ['auth', 'slow'],
      request: { ...fixture().request, protocol: 'h2' },
      metadata: { ...fixture().metadata, fromCache: false, mimeType: 'application/json' },
      timing: { total: 0.128765 },
      response: { ...fixture().response!, size: 0 },
    });
    for (const column of allColumns) {
      const filter = requestCellFilter(record, column, true);
      expect(filter, column).toBeDefined();
      expect(compileFilter(filter!.node)(record), column).toBe(true);
    }
    expect(requestCellFilter(record, 'Time', true)?.node).toMatchObject({ value: '0.128765' });
    expect(
      compileFilter(requestCellFilter(record, 'Tags', true)!.node)(fixture({ tags: ['auth'] })),
    ).toBe(false);
  });
  it('does not filter unavailable values, error status labels, or expose masked secrets', () => {
    const record = fixture({ response: undefined, timing: undefined, tags: [], tabId: undefined });
    for (const column of ['Status', 'Time', 'Size', 'Tab', 'Frame', 'Cache', 'Tags'] as const)
      expect(requestCellFilter(record, column, true)).toBeUndefined();
    const secret = fixture({
      request: { ...record.request, url: 'https://example.com/api?token=private' },
    });
    expect(requestCellFilter(secret, 'URL', true)).toBeUndefined();
    expect(requestCellFilter(secret, 'URL', false)).toBeDefined();
    expect(
      requestCellFilter(
        fixture({ metadata: { ...record.metadata, error: 'Failed' } }),
        'Status',
        true,
      ),
    ).toBeUndefined();
  });
  it('ANDs with OR/NOT expressions, safely escapes values and does not duplicate a repeated filter', () => {
    const addition = requestCellFilter(fixture(), 'Method', true)!.node;
    const expression = appendCellFilter('status = 201 OR NOT status < 500', addition);
    const matches = compileFilter(parseFilter(expression));
    expect(matches(fixture())).toBe(true);
    expect(matches(fixture({ request: { ...fixture().request, method: 'GET' } }))).toBe(false);
    expect(appendCellFilter(expression, addition)).toBe(expression);
    const text = 'a" OR method = GET \\ (test)';
    const record = fixture({ tags: [text] });
    const escaped = appendCellFilter('', requestCellFilter(record, 'Tags', true)!.node);
    expect(compileFilter(parseFilter(escaped))(record)).toBe(true);
    expect(compileFilter(parseFilter(escaped))(fixture())).toBe(false);
  });
  it('rejects malformed existing expressions and oversized values without replacing them', () => {
    const addition = requestCellFilter(fixture(), 'Method', true)!.node;
    expect(() => appendCellFilter('status > nope', addition)).toThrow('number');
    expect(() =>
      appendCellFilter('', {
        type: 'predicate',
        field: 'url',
        operator: '=',
        value: 'x'.repeat(10001),
      }),
    ).toThrow('too long');
  });
});

function table(props: Partial<React.ComponentProps<typeof RequestTable>> = {}) {
  const callbacks = { onSelect: vi.fn(), onContext: vi.fn(), onAddFilter: vi.fn() };
  const rows = [
    fixture({ id: 'first' }),
    fixture({ id: 'second' }),
    fixture({ id: 'third', metadata: { ...fixture().metadata, resourceType: 'xmlhttprequest' } }),
  ];
  const result = render(
    <RequestTable
      rows={rows}
      selected={new Set()}
      onToggle={vi.fn()}
      onToggleAll={vi.fn()}
      columns={defaultColumns}
      onColumns={vi.fn()}
      sort={{ column: 'Timestamp', desc: true }}
      onSort={vi.fn()}
      mask
      onFavorite={vi.fn()}
      {...callbacks}
      {...props}
    />,
  );
  return { ...callbacks, ...result, rows };
}

it('right-click uses the third row and actual column even on a nested span', () => {
  const { onContext, onSelect, rows } = table();
  const row = screen.getAllByTestId('request-row')[2]!;
  fireEvent.contextMenu(within(row).getByText('XHR'), { clientX: 100, clientY: 130 });
  expect(onContext).toHaveBeenLastCalledWith(rows[2], 100, 130, 'Type');
  expect(onSelect).toHaveBeenCalledWith(rows[2]);
  fireEvent.contextMenu(within(row).getByText('POST'));
  expect(onContext).toHaveBeenLastCalledWith(rows[2], 0, 0, 'Method');
});

it('double-click filters once and cancels the single-click detail opening that would move the cell', () => {
  vi.useFakeTimers();
  try {
    const { onSelect, onAddFilter } = table();
    const cell = screen.getByText('XHR');
    fireEvent.click(cell, { detail: 1 });
    expect(onSelect).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(150));
    fireEvent.click(cell, { detail: 2 });
    fireEvent.doubleClick(cell);
    act(() => vi.advanceTimersByTime(600));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onAddFilter).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ label: 'Type = XHR' }),
    );
  } finally {
    vi.useRealTimers();
  }
});

it('single-click still opens details and pending selection is cancelled on unmount', () => {
  vi.useFakeTimers();
  try {
    const { onSelect, rows, unmount } = table();
    fireEvent.click(screen.getByText('XHR'), { detail: 1 });
    act(() => vi.advanceTimersByTime(450));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(rows[2]);
    fireEvent.click(screen.getByText('XHR'), { detail: 1 });
    unmount();
    act(() => vi.advanceTimersByTime(450));
    expect(onSelect).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it('supports cell filtering with Enter and a cell-aware keyboard context menu', () => {
  const { onAddFilter, onContext, rows } = table({ focused: 'third' });
  const cell = screen.getByText('XHR');
  fireEvent.keyDown(cell, { key: 'Enter' });
  expect(onAddFilter).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ label: 'Type = XHR' }),
  );
  fireEvent.keyDown(cell, { key: 'F10', shiftKey: true });
  expect(onContext).toHaveBeenLastCalledWith(rows[2], 80, 75, 'Type');
  fireEvent.keyDown(cell, { key: 'ArrowLeft' });
  expect(document.activeElement?.getAttribute('data-column')).toBe('Status');
});
