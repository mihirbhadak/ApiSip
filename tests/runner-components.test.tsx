import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunForm } from '../src/ui/runner/RunForm';
import { RunnerPanel } from '../src/ui/runner/RunnerPanel';
import { RunResults } from '../src/ui/runner/RunResults';
import { defaultRunConfig } from '../src/runner/model';
import { createRunReport } from '../src/runner/analytics';
import { clearDatabase, saveRecords } from '../src/storage/repository';
import { fixture } from './fixtures';
import type { Pair } from '../src/shared/model';
afterEach(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await clearDatabase();
  await saveRecords([fixture()]);
});
it('supports searchable units and variable rows without accidentally submitting the run', async () => {
  const review = vi.fn(),
    user = userEvent.setup();
  function Harness() {
    const [config, setConfig] = useState(defaultRunConfig),
      [variables, setVariables] = useState<Pair[]>([]);
    return (
      <RunForm
        config={config}
        setConfig={setConfig}
        variables={variables}
        setVariables={setVariables}
        rows="[]"
        setRows={vi.fn()}
        seed={1}
        setSeed={vi.fn()}
        disabled={false}
        onReview={review}
      />
    );
  }
  render(<Harness />);
  await user.click(screen.getByText('Variables & data rows'));
  await user.click(screen.getByRole('button', { name: 'Add row' }));
  expect(review).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Run variables key 1'), 'name');
  await user.type(screen.getByLabelText('Run variables value 1'), 'Mihir');
  await user.click(screen.getByRole('combobox', { name: 'Duration unit' }));
  await user.keyboard('minutes{Enter}');
  expect(screen.getByLabelText('Run duration')).toHaveValue(10 / 60);
  await user.click(screen.getByRole('button', { name: 'Review run' }));
  expect(review).toHaveBeenCalledOnce();
});
it('previews a concrete plan and requires Start run before sending traffic', async () => {
  const send = vi.fn(async (message: { type: string }) => ({
    ok: true,
    data: message.type === 'runner-status' ? null : null,
  }));
  vi.stubGlobal('chrome', { runtime: { id: 'test', sendMessage: send } });
  const user = userEvent.setup();
  render(<RunnerPanel sourceId="test-1" request={fixture().request} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review run' })).toBeEnabled());
  expect(screen.getByText('No timed runs yet')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Review run' }));
  expect(screen.getByRole('dialog', { name: 'Start timed run' })).toBeVisible();
  expect(send.mock.calls.some(([m]) => m.type === 'runner-start')).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Start run' }));
  await waitFor(() => expect(send.mock.calls.some(([m]) => m.type === 'runner-start')).toBe(true));
});
it('renders unavailable statistics and safe report samples with accessible tables', () => {
  const plan = {
    sourceId: 'test-1',
    request: fixture().request,
    config: defaultRunConfig,
    variables: [],
    rows: [],
    seed: 1,
  };
  const report = createRunReport(plan, 'https://example.com', 'default', 'initial', []);
  render(<RunResults report={report} />);
  expect(screen.getByRole('table', { name: 'Run timing statistics' })).toBeVisible();
  expect(screen.getByText('Attempt duration')).toBeVisible();
  expect(screen.getByTestId('run-started')).toHaveTextContent('0');
  expect(screen.getByText(/Percentiles are histogram estimates/)).toBeVisible();
  expect(screen.queryByText('NaN')).not.toBeInTheDocument();
});
