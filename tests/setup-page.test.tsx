import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetupPage from '../src/ui/SetupPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  location.hash = '';
});

function chromeFixture(allowed = false) {
  const request = vi.fn().mockResolvedValue(false);
  const sendMessage = vi.fn().mockResolvedValue({ ok: true, data: null });
  const contains = vi.fn().mockResolvedValue(allowed);
  const onAdded = { addListener: vi.fn(), removeListener: vi.fn() };
  const onRemoved = { addListener: vi.fn(), removeListener: vi.fn() };
  vi.stubGlobal('chrome', {
    permissions: { contains, request, onAdded, onRemoved },
    commands: {
      getAll: vi.fn().mockResolvedValue([{ name: 'toggle-recording', shortcut: 'Ctrl+Shift+Y' }]),
    },
    runtime: { id: 'test-extension', sendMessage },
    tabs: { create: vi.fn().mockResolvedValue({}) },
  });
  return { request, sendMessage, contains, onAdded, onRemoved };
}

it('explains access without requesting it automatically; handles denial and a later approval', async () => {
  const chrome = chromeFixture();
  const user = userEvent.setup();
  render(<SetupPage />);
  const allow = await screen.findByRole('button', { name: 'Allow website access' });
  expect(chrome.request).not.toHaveBeenCalled();
  expect(screen.getByText('Ctrl + Shift + Y')).toBeVisible();
  await user.click(allow);
  expect(screen.getByRole('alert')).toHaveTextContent('not granted');
  expect(chrome.sendMessage).not.toHaveBeenCalled();
  chrome.request.mockResolvedValue(true);
  await user.click(allow);
  expect(await screen.findByRole('status')).toHaveTextContent('Website access granted');
  expect(chrome.request).toHaveBeenCalledWith({
    permissions: ['webRequest'],
    origins: ['http://*/*', 'https://*/*'],
  });
  expect(chrome.sendMessage).toHaveBeenCalledWith({ type: 'changed' });
  expect(chrome.sendMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: 'settings' }),
  );
  await user.click(screen.getByRole('button', { name: 'Start recording' }));
  expect(chrome.sendMessage).toHaveBeenLastCalledWith({
    type: 'settings',
    patch: { recording: true },
  });
});

it('keeps errors actionable and releases permission listeners when closed', async () => {
  const chrome = chromeFixture();
  chrome.request.mockRejectedValue(new Error('Permission API failed'));
  const user = userEvent.setup();
  const { unmount } = render(<SetupPage />);
  await user.click(await screen.findByRole('button', { name: 'Allow website access' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Chrome could not grant site access');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Allow website access' })).toBeEnabled(),
  );
  unmount();
  expect(chrome.onAdded.removeListener).toHaveBeenCalledWith(
    chrome.onAdded.addListener.mock.calls[0]![0],
  );
  expect(chrome.onRemoved.removeListener).toHaveBeenCalledWith(
    chrome.onRemoved.addListener.mock.calls[0]![0],
  );
});
