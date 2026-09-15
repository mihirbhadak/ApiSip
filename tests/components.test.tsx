import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fixture } from './fixtures';
import { RequestTable, defaultColumns } from '../src/ui/components/RequestTable';
import { FilterBuilder } from '../src/ui/components/FilterBuilder';
import { RequestEditor } from '../src/ui/components/RequestEditor';
import { Headers } from '../src/ui/components/Headers';
import { BodyViewer } from '../src/ui/components/BodyViewer';
import { PairEditor } from '../src/ui/components/PairEditor';
import { CommandPalette } from '../src/ui/components/CommandPalette';
import { ExportDialog } from '../src/ui/components/ExportDialog';
import { SettingsDialog } from '../src/ui/components/SettingsDialog';
import { CollectionDialog } from '../src/ui/components/RequestActions';
import { EntityDialog } from '../src/ui/components/EntityDialog';
import { defaultSettings } from '../src/shared/model';
describe('request table', () => {
  it('virtualizes 10,000 records and supports selection and keyboard navigation', () => {
    const onSelect = vi.fn(),
      onToggle = vi.fn();
    render(
      <RequestTable
        rows={Array.from({ length: 10000 }, (_, i) => fixture({ id: String(i) }))}
        selected={new Set()}
        onSelect={onSelect}
        onToggle={onToggle}
        onToggleAll={vi.fn()}
        onContext={vi.fn()}
        columns={defaultColumns}
        onColumns={vi.fn()}
        sort={{ column: 'Timestamp', desc: true }}
        onSort={vi.fn()}
        mask
        onFavorite={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('request-row').length).toBeLessThan(40);
    fireEvent.keyDown(screen.getByLabelText('Request list'), { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '0' }));
    fireEvent.click(screen.getAllByRole('checkbox')[1]!);
    expect(onToggle).toHaveBeenCalledWith('0');
  });
});
it('builds nested filters and reports malformed expressions', async () => {
  const user = userEvent.setup(),
    onApply = vi.fn();
  render(<FilterBuilder expression="" onApply={onApply} onSave={vi.fn()} onClose={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: 'Rule' }));
  await user.click(screen.getByRole('button', { name: 'Group' }));
  expect(screen.getAllByLabelText('Filter field')).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Apply filter' }));
  expect(onApply).toHaveBeenCalledWith(expect.stringContaining('url contains'));
  await user.click(screen.getByRole('tab', { name: 'Expression' }));
  await user.clear(screen.getByLabelText('Filter expression'));
  await user.type(screen.getByLabelText('Filter expression'), 'status > nope');
  await user.click(screen.getByRole('button', { name: 'Apply filter' }));
  expect(screen.getByRole('alert')).toHaveTextContent('number');
});
it('masks headers, reveals explicitly and copies duplicate headers', async () => {
  const user = userEvent.setup(),
    copy = vi.fn();
  render(<Headers pairs={fixture().request.headers} title="Request headers" copy={copy} />);
  expect(screen.queryByText('Bearer top-secret')).not.toBeInTheDocument();
  await user.click(screen.getByLabelText('Reveal Authorization'));
  expect(screen.getByText('Bearer top-secret')).toBeInTheDocument();
  await user.click(screen.getByText('Copy all'));
  expect(copy.mock.calls[0]![0]).toContain('X-Test: one\nX-Test: two');
});
it('renders untrusted HTML inertly and handles unavailable bodies', () => {
  const { rerender } = render(
    <BodyViewer
      body={{
        type: 'html',
        text: '<script>window.hacked=true</script>',
        available: true,
        encoding: 'utf8',
        truncated: false,
      }}
      copy={vi.fn()}
    />,
  );
  expect(screen.getByText('<script>window.hacked=true</script>')).toBeVisible();
  expect(document.querySelector('script')).toBeNull();
  rerender(
    <BodyViewer
      body={{
        type: 'unknown',
        available: false,
        encoding: 'utf8',
        truncated: false,
        reason: 'Chrome did not expose the body.',
      }}
      copy={vi.fn()}
    />,
  );
  expect(screen.getByText('Response body unavailable')).toBeVisible();
});
it('edits duplicate query/header pairs with accessible add/delete controls', async () => {
  const user = userEvent.setup(),
    onChange = vi.fn();
  render(<PairEditor label="Query" pairs={[{ name: 'page', value: '1' }]} onChange={onChange} />);
  await user.click(screen.getByText('Add row'));
  expect(onChange).toHaveBeenCalledWith([
    { name: 'page', value: '1' },
    { name: '', value: '' },
  ]);
  await user.click(screen.getByLabelText('Delete Query row 1'));
  expect(onChange).toHaveBeenLastCalledWith([]);
});
it('edits URL/query/body, sends via shortcut, and reports replay errors', async () => {
  const user = userEvent.setup(),
    onSend = vi.fn().mockRejectedValue(new Error('Source tab closed.'));
  render(<RequestEditor record={fixture()} context="auto" onSend={onSend} onSave={vi.fn()} />);
  await user.clear(screen.getByLabelText('Request URL'));
  await user.type(screen.getByLabelText('Request URL'), 'https://example.com/new?q=2');
  fireEvent.keyDown(screen.getByLabelText('Request URL'), { key: 'Enter', ctrlKey: true });
  expect(await screen.findByRole('alert')).toHaveTextContent('Source tab closed');
  expect(onSend).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'https://example.com/new?q=2' }),
    'auto',
  );
});
it('executes command palette actions using the keyboard', async () => {
  const user = userEvent.setup(),
    run = vi.fn();
  render(
    <CommandPalette
      commands={[
        { name: 'Export', run },
        { name: 'Settings', run: vi.fn() },
      ]}
      onClose={vi.fn()}
    />,
  );
  await user.type(screen.getByLabelText('Search commands'), 'export');
  await user.keyboard('{Enter}');
  expect(run).toHaveBeenCalledOnce();
});
it('defaults export to redacted data and supports scopes', () => {
  render(
    <ExportDialog
      selected={new Set(['test-1'])}
      filtered={[fixture()]}
      settings={defaultSettings}
      entities={[]}
      onClose={vi.fn()}
      notify={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Include sensitive values')).not.toBeChecked();
  expect(screen.getByLabelText('Cookies')).not.toBeChecked();
  expect(screen.getByLabelText('Export scope')).toHaveValue('Selected requests');
});
it('saves theme settings and presents storage diagnostics', async () => {
  const user = userEvent.setup(),
    save = vi.fn().mockResolvedValue(undefined);
  render(
    <SettingsDialog
      state={{
        settings: defaultSettings,
        count: 10,
        tabCount: 10,
        sessionCount: 10,
        attachedTabs: [],
        diagnostics: [],
        hostsGranted: false,
      }}
      entityCounts={{ sessions: 1, workspaces: 1 }}
      onSave={save}
      onRetry={vi.fn()}
      onClear={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('tab', { name: 'Appearance' }));
  await user.click(screen.getByRole('combobox', { name: 'Theme' }));
  await user.type(screen.getByRole('combobox', { name: 'Theme' }), 'dark');
  await user.keyboard('{Enter}');
  await user.click(screen.getByText('Save settings'));
  expect(save).toHaveBeenCalledWith({ theme: 'dark' });
});
it('creates named workspaces and selects collections', async () => {
  const user = userEvent.setup(),
    save = vi.fn().mockResolvedValue(undefined);
  const { unmount } = render(
    <EntityDialog title="New workspace" onSave={save} onClose={vi.fn()} />,
  );
  await user.type(screen.getByLabelText('Name'), 'Project A');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(save).toHaveBeenCalledWith('Project A');
  unmount();
  const select = vi.fn();
  render(
    <CollectionDialog
      count={1}
      entities={[
        {
          id: 'c',
          kind: 'collection',
          name: 'Authentication',
          workspaceId: 'default',
          createdAt: 0,
          updatedAt: 0,
        },
      ]}
      onSelect={select}
      onCreate={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  await user.click(screen.getByText('Authentication'));
  expect(select).toHaveBeenCalledWith('c');
});

it('opens current editor changes in a new tab and restores an initial draft without resetting on history refresh', async () => {
  const user = userEvent.setup(),
    open = vi.fn().mockResolvedValue(undefined),
    change = vi.fn();
  const props = {
    record: fixture(),
    context: 'extension' as const,
    onSend: vi.fn(),
    onSave: vi.fn(),
    onDraftChange: change,
    onOpenInTab: open,
  };
  const { rerender } = render(
    <RequestEditor
      {...props}
      initialRequest={{ ...fixture().request, url: 'https://example.com/restored' }}
    />,
  );
  expect(screen.getByLabelText('Request URL')).toHaveValue('https://example.com/restored');
  await user.clear(screen.getByLabelText('Request URL'));
  await user.type(screen.getByLabelText('Request URL'), 'https://example.com/edited?page=2');
  rerender(<RequestEditor {...props} record={{ ...fixture(), notes: 'Updated elsewhere' }} />);
  expect(screen.getByLabelText('Request URL')).toHaveValue('https://example.com/edited?page=2');
  await user.click(screen.getByRole('button', { name: 'Open in new tab' }));
  expect(open).toHaveBeenCalledWith(
    expect.objectContaining({
      url: 'https://example.com/edited?page=2',
      query: [{ name: 'page', value: '2' }],
    }),
    'extension',
  );
  expect(change).toHaveBeenLastCalledWith(
    expect.objectContaining({ url: 'https://example.com/edited?page=2' }),
    'extension',
  );
  expect(await screen.findByRole('status')).toHaveTextContent('Editor opened');
});
