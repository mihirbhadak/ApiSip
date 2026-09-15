import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from '../src/ui/components/ActionMenu';
import { SearchSelect } from '../src/ui/components/SearchSelect';
import { TabBar } from '../src/ui/components/TabBar';
import { KeyboardHints } from '../src/ui/components/KeyboardHints';
import { HelpCenter } from '../src/ui/components/HelpCenter';
import { HelpButton } from '../src/ui/components/HelpButton';
import { RequestTable, defaultColumns } from '../src/ui/components/RequestTable';
import { useShortcuts } from '../src/ui/use-shortcuts';
import { fixture } from './fixtures';

describe('dismissible action menus', () => {
  it('closes outside, keeps only one open, and returns focus on Escape', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ActionMenu
          label="Manage first"
          actions={[
            { name: 'Rename', run: vi.fn() },
            { name: 'Delete', danger: true, run: vi.fn() },
          ]}
        />
        <ActionMenu label="Manage second" actions={[{ name: 'Archive', run: vi.fn() }]} />
        <button>Outside</button>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Manage first' }));
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('danger-text');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage first' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Manage second' }));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menu')).toHaveAccessibleName('Manage second');
    await user.click(screen.getByText('Outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
  it('executes an action once and closes immediately', async () => {
    const user = userEvent.setup(),
      run = vi.fn();
    render(<ActionMenu label="Manage item" actions={[{ name: 'Rename', run }]} />);
    await user.click(screen.getByRole('button'));
    await user.keyboard('{Enter}');
    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

function Picker({ allowCustom = false }: { allowCustom?: boolean }) {
  const [value, setValue] = useState('light');
  return (
    <>
      <SearchSelect
        aria-label="Theme"
        value={value}
        onValueChange={setValue}
        allowCustom={allowCustom}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="disabled" disabled>
          Unavailable
        </option>
      </SearchSelect>
      <button>Outside</button>
      <output>{value}</output>
    </>
  );
}
describe('searchable pickers', () => {
  it('searches, commits with Enter, cancels with Escape and dismisses outside', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const picker = screen.getByRole('combobox');
    await user.click(picker);
    await user.type(picker, 'dar');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(picker).toHaveValue('Dark');
    expect(picker).toHaveFocus();
    await user.click(picker);
    await user.type(picker, 'light');
    await user.keyboard('{Escape}');
    expect(picker).toHaveValue('Dark');
    await user.click(picker);
    await user.click(screen.getByText('Outside'));
    expect(picker).toHaveAttribute('aria-expanded', 'false');
  });
  it('handles empty results, disabled options, arrow navigation and Tab', async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const picker = screen.getByRole('combobox');
    await user.click(picker);
    await user.type(picker, 'missing');
    expect(screen.getByText('No matching options')).toBeVisible();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
    await user.clear(picker);
    await user.type(picker, 'unavailable');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('option')).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Escape}{ArrowDown}{ArrowDown}{Enter}');
    expect(picker).toHaveValue('Dark');
    await user.keyboard('{ArrowDown}{Tab}');
    expect(picker).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Outside')).toHaveFocus();
  });
  it('accepts a custom field only after explicit selection', async () => {
    const user = userEvent.setup();
    render(<Picker allowCustom />);
    const picker = screen.getByRole('combobox');
    await user.click(picker);
    await user.type(picker, 'requestHeader.authorization');
    await user.keyboard('{Enter}');
    expect(picker).toHaveValue('requestHeader.authorization');
  });
});

it('uses roving focus and arrow keys in tabs', async () => {
  function Tabs() {
    const [tab, setTab] = useState('One');
    return (
      <TabBar label="Sections">
        {['One', 'Two', 'Three'].map((name) => (
          <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </TabBar>
    );
  }
  const user = userEvent.setup();
  render(<Tabs />);
  await user.tab();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{End}');
  expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus();
});

it('shows hold-to-reveal shortcuts only after one second and resets safely', () => {
  vi.useFakeTimers();
  try {
    const { unmount } = render(<KeyboardHints />);
    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
    act(() => vi.advanceTimersByTime(999));
    expect(screen.queryByLabelText('Keyboard shortcuts')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByLabelText('Keyboard shortcuts')).toHaveTextContent('Search requests');
    fireEvent.keyUp(window, { key: 'Control' });
    expect(screen.queryByLabelText('Keyboard shortcuts')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText('Keyboard shortcuts')).toHaveTextContent('New session');
    fireEvent.blur(window);
    expect(screen.queryByLabelText('Keyboard shortcuts')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.queryByLabelText('Keyboard shortcuts')).not.toBeInTheDocument();
    unmount();
  } finally {
    vi.useRealTimers();
  }
});

it('selects all filtered rows including unrendered ones and exposes partial selection', async () => {
  const rows = Array.from({ length: 100 }, (_, i) => fixture({ id: String(i) }));
  function Table() {
    const [selected, setSelected] = useState(new Set(['0']));
    return (
      <>
        <RequestTable
          rows={rows}
          selected={selected}
          focused="0"
          onSelect={vi.fn()}
          onToggle={(id) => setSelected(new Set([id]))}
          onToggleAll={(checked) => setSelected(new Set(checked ? rows.map((row) => row.id) : []))}
          onContext={vi.fn()}
          columns={defaultColumns}
          onColumns={vi.fn()}
          sort={{ column: 'Timestamp', desc: true }}
          onSort={vi.fn()}
          mask
          onFavorite={vi.fn()}
        />
        <output data-testid="selection-count">{selected.size}</output>
      </>
    );
  }
  const user = userEvent.setup();
  render(<Table />);
  const all = screen.getByRole('checkbox', { name: 'Select all matching requests' });
  expect(all).toBePartiallyChecked();
  await user.click(all);
  expect(screen.getByTestId('selection-count')).toHaveTextContent('100');
  expect(all).toBeChecked();
  expect(screen.getAllByTestId('request-row').length).toBeLessThan(40);
  await user.click(all);
  expect(screen.getByTestId('selection-count')).toHaveTextContent('0');
  screen.getByRole('table').focus();
  await user.keyboard('{Control>}a{/Control}');
  expect(screen.getByTestId('selection-count')).toHaveTextContent('100');
});

it('opens contextual help, searches topics and preserves exact creator links', async () => {
  const user = userEvent.setup();
  render(
    <>
      <HelpButton topic="replay" label="Replay help" />
      <HelpCenter />
    </>,
  );
  await user.click(screen.getByRole('button', { name: 'Replay help' }));
  expect(screen.getByRole('article')).toHaveAccessibleName('Edit, replay and compare');
  await user.type(screen.getByRole('textbox', { name: 'Search help' }), 'creator');
  expect(screen.getByRole('article')).toHaveAccessibleName('About and creator');
  expect(screen.getByRole('link', { name: 'Mihir Bhadak on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/mihirbhadak',
  );
  expect(screen.getByRole('link', { name: 'Mihir Bhadak on LinkedIn' })).toHaveAttribute(
    'href',
    'https://www.linkedin.com/in/mihirbhadak/',
  );
  expect(screen.getByRole('link', { name: 'Mihir Bhadak on Instagram' })).toHaveAttribute(
    'href',
    'https://www.instagram.com/mihir_bhadak/',
  );
  for (const link of screen.getAllByRole('link'))
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await user.clear(screen.getByRole('textbox'));
  await user.type(screen.getByRole('textbox'), 'zzzzzzz');
  expect(screen.getByText('No matching help topics')).toBeVisible();
  await user.click(screen.getByLabelText('Close dialog'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('dispatches global shortcuts without intercepting text editing or open dialogs', () => {
  const run = vi.fn();
  function Harness() {
    useShortcuts({
      search: run,
      commands: run,
      export: run,
      copy: run,
      capture: run,
      session: run,
      workspace: run,
      collection: run,
      filters: run,
      settings: run,
      help: run,
      list: run,
      delete: run,
      close: run,
    });
    return <input aria-label="Text" />;
  }
  render(<Harness />);
  fireEvent.keyDown(window, { key: 'c', altKey: true, shiftKey: true });
  expect(run).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Delete' });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: '?', shiftKey: true });
  expect(run).toHaveBeenCalledTimes(1);
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.append(dialog);
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  expect(run).toHaveBeenCalledTimes(1);
  dialog.remove();
});

it('starts a picker search by typing after keyboard focus', async () => {
  const user = userEvent.setup();
  render(<Picker />);
  await user.tab();
  await user.keyboard('dark{Enter}');
  expect(screen.getByRole('combobox')).toHaveValue('Dark');
});

it('closes after choosing an option inside a label without reopening from label activation', async () => {
  function LabeledPicker() {
    const [value, setValue] = useState('light');
    return (
      <label>
        Theme
        <SearchSelect aria-label="Theme" value={value} onValueChange={setValue}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </SearchSelect>
      </label>
    );
  }
  const user = userEvent.setup();
  render(<LabeledPicker />);
  await user.click(screen.getByRole('combobox'));
  await user.click(screen.getByRole('option', { name: 'Dark' }));
  expect(screen.getByRole('combobox')).toHaveValue('Dark');
  expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
