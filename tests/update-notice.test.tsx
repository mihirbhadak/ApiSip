import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { UpdateNotice } from '../src/ui/components/UpdateNotice';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('shows newer release changes safely, links its ZIP, and persists dismissal', async () => {
  const latest = {
    version: '0.2.0',
    title: 'Capture improvements',
    notes: 'Fixed recording after deletion. <script>alert(1)</script>',
    url: 'https://github.com/mihirbhadak/ApiSip/releases/tag/v0.2.0',
    downloadUrl: 'https://github.com/mihirbhadak/ApiSip/releases/download/v0.2.0/apisip-0.2.0.zip',
  };
  const send = vi.fn(async (command: { type: string }) => ({
    ok: true,
    data: {
      latest,
      dismissedVersion: command.type === 'dismiss-update' ? latest.version : undefined,
    },
  }));
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'test',
      getManifest: () => ({ version: '0.1.2' }),
      sendMessage: send,
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
  render(<UpdateNotice />);
  expect(await screen.findByRole('dialog')).toHaveAccessibleName('ApiSip 0.2.0 is available');
  expect(screen.getByLabelText('Release notes')).toHaveTextContent(latest.notes);
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByRole('link', { name: 'Download update' })).toHaveAttribute(
    'href',
    latest.downloadUrl,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Remind me with the next version' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(send).toHaveBeenCalledWith({ type: 'dismiss-update', version: '0.2.0' });
});
