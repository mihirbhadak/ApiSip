import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestEditor } from '../src/ui/components/RequestEditor';
import { RunForm } from '../src/ui/runner/RunForm';
import { defaultRunConfig } from '../src/runner/model';
import { makeBody } from '../src/shared/parse';
import { materializeRequest } from '../src/shared/request-fields';
import type { Pair } from '../src/shared/model';
import { fixture } from './fixtures';

it('toggles header/body inclusion by keyboard, blurs excluded values and preserves the editable draft', async () => {
  const user = userEvent.setup(),
    record = fixture();
  record.request.body = makeBody(
    '{"name":"Mihir","extra":{"omit":"hidden","keep":1}}',
    'application/json',
  );
  const send = vi.fn(async (request) => ({
    id: 'replay',
    timestamp: 0,
    context: 'extension' as const,
    request: materializeRequest(request),
    duration: 1,
    warnings: [],
    response: { status: 200, statusText: 'OK', headers: [] },
  }));
  const draft = vi.fn();
  render(
    <RequestEditor
      record={record}
      context="extension"
      onSend={send}
      onSave={vi.fn()}
      onDraftChange={draft}
    />,
  );
  screen.getByRole('button', { name: 'Send Request headers row 3' }).focus();
  await user.keyboard(' ');
  expect(screen.getByRole('button', { name: 'Send Request headers row 3' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByLabelText('Request headers value 3')).toHaveClass('excluded-value');
  expect(screen.getByLabelText('Request headers value 3')).toHaveValue('one');
  await user.click(screen.getByRole('tab', { name: 'Body' }));
  await user.click(screen.getByRole('button', { name: 'Send body field $["extra"]["omit"]' }));
  expect(screen.getByLabelText('Body field value $["extra"]["omit"]')).toHaveClass(
    'excluded-value',
  );
  expect(screen.getByLabelText('Request body')).toHaveAttribute('readonly');
  await user.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  const projected = materializeRequest(send.mock.calls[0]![0]);
  expect(projected.headers.filter((h) => h.name === 'X-Test')).toEqual([
    { name: 'X-Test', value: 'two' },
  ]);
  expect(JSON.parse(projected.body!.text!)).toEqual({ name: 'Mihir', extra: { keep: 1 } });
  expect(draft.mock.calls.at(-1)![0].body.text).toContain('hidden');
  await user.click(screen.getByRole('button', { name: 'Send request body' }));
  expect(screen.getByLabelText('Request body')).toHaveClass('excluded-value');
  expect(materializeRequest(draft.mock.calls.at(-1)![0]).body).toBeUndefined();
});

it('builds typed examples from the actual body, previews rows, and never starts traffic from guide controls', async () => {
  const user = userEvent.setup(),
    review = vi.fn();
  function Harness() {
    const initial = fixture().request;
    initial.body = makeBody(
      '{"userId":42,"name":"Mihir","password":"do-not-expose"}',
      'application/json',
    );
    const [request, setRequest] = useState(initial),
      [config, setConfig] = useState(defaultRunConfig),
      [variables, setVariables] = useState<Pair[]>([]),
      [rows, setRows] = useState('[]');
    return (
      <RunForm
        request={request}
        onRequestChange={setRequest}
        config={config}
        setConfig={setConfig}
        variables={variables}
        setVariables={setVariables}
        rows={rows}
        setRows={setRows}
        seed={1}
        setSeed={vi.fn()}
        disabled={false}
        onReview={review}
      />
    );
  }
  render(<Harness />);
  await user.click(screen.getByText('Variables & data rows'));
  expect(screen.getByRole('combobox', { name: 'Variable example field' })).toHaveValue(
    'Body $["userId"]',
  );
  expect(screen.getByLabelText('Data rows')).toHaveAttribute(
    'placeholder',
    expect.stringContaining('42'),
  );
  await user.click(screen.getByRole('button', { name: 'Insert placeholder & define value' }));
  expect(screen.getByLabelText('Run variables key 1')).toHaveValue('bodyUserId');
  expect(JSON.parse((screen.getByLabelText('Data rows') as HTMLTextAreaElement).value)).toEqual([
    { bodyUserId: 42 },
  ]);
  const preview = screen.getByRole('region', { name: 'Variable request preview' });
  await waitFor(() => expect(preview).toHaveTextContent('42'));
  expect(preview).not.toHaveTextContent('do-not-expose');
  expect(preview).not.toHaveTextContent('top-secret');
  await user.clear(screen.getByLabelText('Data rows'));
  await user.paste('[{"bodyUserId":7},{"bodyUserId":8}]');
  await waitFor(() =>
    expect(
      [...preview.querySelectorAll('pre')].map(
        (node) => JSON.parse(JSON.parse(node.textContent!).body).userId,
      ),
    ).toEqual([7, 8, 7]),
  );
  expect(review).not.toHaveBeenCalled();
});
