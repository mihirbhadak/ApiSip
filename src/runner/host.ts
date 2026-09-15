import { isRunActive, type RunnerEvent, type RunReport } from './model';
import type { HostCommand, HostReply } from './host-messages';

let worker: Worker | undefined;
let latest: RunReport | null = null;
let pending: ((reply: HostReply) => void) | undefined;
let starting = false;
const release = () => {
  void chrome.runtime.sendMessage({ type: 'runner-release' }).catch(() => {
    /* Shutdown or no worker listener. */
  });
};
chrome.runtime.onMessage.addListener(
  (message: HostCommand, sender, respond: (reply: HostReply) => void) => {
    if (sender.id !== chrome.runtime.id || !message || message.target !== 'load-host') return;
    if (message.action === 'status') {
      respond({ ok: true, report: latest });
      return;
    }
    if (message.action === 'stop') {
      worker?.postMessage({ type: 'stop', reason: message.reason });
      respond({ ok: true, report: latest });
      return;
    }
    if (message.action !== 'start') return;
    if (starting || worker || (latest && isRunActive(latest.state))) {
      respond({
        ok: false,
        error: 'Another timed run is active. Stop it before starting another.',
      });
      return;
    }
    starting = true;
    pending = respond;
    latest = message.report;
    const startupTimer = setTimeout(() => fail(), 10000);
    const fail = () => {
      clearTimeout(startupTimer);
      starting = false;
      worker?.terminate();
      worker = undefined;
      if (latest)
        latest = {
          ...latest,
          state: 'interrupted',
          reason:
            'Runner worker stopped unexpectedly. Last saved progress is available in history.',
        };
      pending?.({ ok: false, error: 'Runner worker could not start or stopped unexpectedly.' });
      pending = undefined;
      release();
    };
    try {
      worker = new Worker(new URL('./runner.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      fail();
      return true;
    }
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.onmessage = (event: MessageEvent<RunnerEvent>) => {
      const value = event.data;
      if (value.type === 'failure') {
        fail();
        return;
      }
      latest = value.report;
      if (pending) {
        clearTimeout(startupTimer);
        pending({ ok: true, report: latest });
        pending = undefined;
        starting = false;
      }
      if (value.type === 'finished') {
        worker?.terminate();
        worker = undefined;
        release();
      }
    };
    worker.postMessage({ type: 'start', plan: message.plan, report: message.report });
    return true;
  },
);
