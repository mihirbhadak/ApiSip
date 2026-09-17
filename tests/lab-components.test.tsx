import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CheckEditor } from '../src/ui/lab/CheckEditor';
import { EnvironmentDialog } from '../src/ui/lab/EnvironmentDialog';
import { SecurityReview } from '../src/ui/lab/SecurityReview';
import { LabReport } from '../src/ui/lab/LabReport';
import { stepFromCapture, type SuiteReport } from '../src/lab/model';
import { fixture } from './fixtures';
import { FloatingPanel } from '../src/ui/components/FloatingPanel';
import { createRef } from 'react';
it('adds accessible checks and extractions using the keyboard', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [step, setStep] = useState(stepFromCapture(fixture()));
    return <CheckEditor step={step} onChange={setStep} />;
  }
  render(<Harness />);
  const add = screen.getByRole('button', { name: 'Add check' });
  add.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByLabelText('Check 2 selector')).toHaveValue('/id');
  await user.click(screen.getByRole('button', { name: 'Add extraction' }));
  expect(screen.getByLabelText('Extraction 1 variable')).toHaveValue('userId');
  await user.click(screen.getByRole('button', { name: 'Delete check 2' }));
  expect(screen.queryByLabelText('Check 2 selector')).not.toBeInTheDocument();
});
it('validates environment origins and reports save failure in the dialog', async () => {
  const user = userEvent.setup(),
    save = vi.fn().mockRejectedValue(new Error('Conflict: reload environment'));
  render(<EnvironmentDialog workspaceId="default" onSave={save} onClose={() => {}} />);
  await user.click(
    within(screen.getByRole('region', { name: 'Environment values' })).getByRole('button', {
      name: 'Add row',
    }),
  );
  await user.type(screen.getByLabelText('Environment values key 1'), 'token');
  await user.type(screen.getByLabelText('Environment values value 1'), 'test-secret');
  expect(save).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Override origin (optional)'), 'https://example.com/api');
  await user.click(screen.getByRole('button', { name: 'Save environment' }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('origin only');
  await user.clear(screen.getByLabelText('Override origin (optional)'));
  await user.click(screen.getByRole('button', { name: 'Save environment' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Conflict');
});
it('ignores delayed scroll events but dismisses a popover when its anchor moves', () => {
  const anchor = createRef<HTMLButtonElement>(),
    close = vi.fn();
  const { rerender } = render(<button ref={anchor}>Anchor</button>);
  let top = 200;
  vi.spyOn(anchor.current!, 'getBoundingClientRect').mockImplementation(() => ({
    top,
    bottom: top + 30,
    left: 0,
    right: 100,
    width: 100,
    height: 30,
    x: 0,
    y: top,
    toJSON() {},
  }));
  rerender(
    <>
      <button ref={anchor}>Anchor</button>
      <FloatingPanel anchor={anchor} role="listbox" label="Options" onClose={close}>
        A
      </FloatingPanel>
    </>,
  );
  fireEvent.scroll(document);
  expect(close).not.toHaveBeenCalled();
  top = 150;
  fireEvent.scroll(document);
  expect(close).toHaveBeenCalledOnce();
});
it('requires review before copying AI context and renders captured content as text', async () => {
  const user = userEvent.setup(),
    record = fixture();
  record.response!.body!.text = '{"token":"secret-value","content":"<script>alert(1)</script>"}';
  render(<SecurityReview record={record} />);
  expect(screen.getByText('Credential-like response fields')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Prepare AI / bug-report context' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByLabelText('Shareable API context')).not.toHaveValue(
    expect.stringContaining('secret-value'),
  );
  expect(document.querySelector('script')).toBeNull();
});
it('reports unsent and inconclusive steps explicitly', () => {
  const report: SuiteReport = {
    id: 'r',
    suiteId: 's',
    suiteName: 'suite',
    workspaceId: 'default',
    timestamp: 0,
    duration: 12,
    environment: 'stage',
    planned: 2,
    state: 'failed',
    origins: [],
    steps: [
      {
        id: 'a',
        name: 'first',
        state: 'failed',
        duration: 12,
        checks: [{ id: 'c', state: 'inconclusive', message: 'Body unavailable' }],
      },
    ],
  };
  render(<LabReport report={report} />);
  expect(screen.getByText('inconclusive')).toBeVisible();
  expect(screen.getByText(/1 step\(s\) have not been sent/)).toBeVisible();
});
