import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { authenticationHint, replayCredentials, resolveReplayContext } from '../src/replay/context';
import { replayCookiesSchema, type ReplayCookies } from '../src/shared/model';
import { ReplayContext } from '../src/ui/components/ReplayContext';
import { RequestEditor } from '../src/ui/components/RequestEditor';
import { fixture } from './fixtures';

describe('replay cookie policy', () => {
  it('keeps explicit auth separate from header visibility and chooses safe defaults', () => {
    expect(resolveReplayContext(fixture(), 'auto')).toBe('browser');
    expect(resolveReplayContext({}, 'auto')).toBe('extension');
    expect(replayCredentials('browser', 'https://example.com/api')).toBe('include');
    expect(replayCredentials('extension', 'https://example.com/api')).toBe('omit');
    expect(
      replayCredentials('browser', 'https://example.com/api', {
        mode: 'omit',
        origin: 'https://example.com',
      }),
    ).toBe('omit');
    expect(
      replayCredentials('extension', 'https://example.com/api', {
        mode: 'include',
        origin: 'https://example.com',
      }),
    ).toBe('include');
  });
  it('rejects reuse on a different origin, protocol or port and invalid origins', () => {
    const cookies = { mode: 'include' as const, origin: 'https://example.com' };
    for (const url of [
      'https://other.test/api',
      'http://example.com/api',
      'https://example.com:8443/api',
    ])
      expect(() => replayCredentials('extension', url, cookies)).toThrow('target origin changed');
    for (const origin of [
      'https://example.com/path',
      'https://user:pass@example.com',
      'file:///tmp',
      'https://example.com/',
    ])
      expect(replayCookiesSchema.safeParse({ ...cookies, origin }).success).toBe(false);
  });
  it('does not diagnose every 403 as a missing login or trigger any retry', () => {
    const replay = {
      id: 'r',
      timestamp: 0,
      context: 'extension' as const,
      request: fixture().request,
      duration: 1,
      warnings: [],
      response: { status: 403, statusText: 'Forbidden', headers: [] },
    };
    expect(authenticationHint(replay)).toContain('cookies were omitted');
    expect(authenticationHint({ ...replay, credentials: 'include' })).toContain('not proof');
    expect(
      authenticationHint({ ...replay, response: { ...replay.response, status: 200 } }),
    ).toBeUndefined();
  });
});
it('explains hidden headers and switches cookie policy with keyboard controls', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [cookies, setCookies] = useState<ReplayCookies>();
    return (
      <ReplayContext
        record={fixture()}
        url="https://example.com/api"
        context="extension"
        cookies={cookies}
        onChange={setCookies}
      />
    );
  }
  render(<Harness />);
  expect(screen.getByText(/Hiding header rows/)).toBeInTheDocument();
  screen.getByRole('combobox', { name: 'Browser cookies' }).focus();
  await user.keyboard(' ');
  await user.click(screen.getByRole('option', { name: 'Use eligible browser cookies' }));
  expect(screen.getByText(/Cookie access is enabled only for https:\/\/example.com/)).toBeVisible();
  await user.click(screen.getByText(/Which context should I use/));
  expect(screen.getByText(/Test without login/)).toBeVisible();
});
it('sends and saves the exact cookie choice with a draft', async () => {
  const user = userEvent.setup(),
    changed = vi.fn(),
    sent = vi.fn().mockRejectedValue(new Error('Test stopped before network'));
  render(
    <RequestEditor
      record={fixture()}
      context="extension"
      onSend={sent}
      onSave={vi.fn()}
      onDraftChange={changed}
    />,
  );
  await user.click(screen.getByRole('combobox', { name: 'Browser cookies' }));
  await user.click(screen.getByRole('option', { name: 'Use eligible browser cookies' }));
  const cookies = { mode: 'include', origin: 'https://example.com:8443' };
  expect(changed).toHaveBeenLastCalledWith(fixture().request, 'extension', cookies);
  await user.click(screen.getByRole('button', { name: 'Send' }));
  expect(sent).toHaveBeenCalledWith(fixture().request, 'extension', cookies);
  expect(await screen.findByRole('alert')).toHaveTextContent('Test stopped before network');
});
