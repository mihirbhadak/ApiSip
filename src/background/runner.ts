import type { RunPlan, RunReport } from '../runner/model';
import { isRunActive } from '../runner/model';
import { createRunReport } from '../runner/analytics';
import { compileRunRequest } from '../runner/templates';
import type { HostCommand, HostReply } from '../runner/host-messages';
import { getRecord } from '../storage/repository';
import { recoverInterruptedRuns } from '../storage/runs';
import { getDB } from '../storage/database';

let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => undefined);
  return next;
}
function hostPath() {
  const background = chrome.runtime.getManifest().background;
  const worker =
    background && 'service_worker' in background ? background.service_worker : 'service-worker.js';
  return worker.replace(/[^/]+$/, 'offscreen.html');
}
async function exists() {
  return (
    (
      await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [chrome.runtime.getURL(hostPath())],
      })
    ).length > 0
  );
}
async function ask(command: HostCommand) {
  const reply = (await chrome.runtime.sendMessage(command)) as HostReply | undefined;
  if (!reply)
    throw new Error('Runner did not respond. Stop or reload the extension before retrying.');
  if (!reply.ok) throw new Error(reply.error);
  return reply.report;
}
export function startRun(plan: RunPlan): Promise<RunReport | null> {
  return serialize(async () => {
    const compiled = compileRunRequest(plan);
    if (!(await chrome.permissions.contains({ origins: [compiled.origin + '/*'] })))
      throw new Error('Grant site access for the target API before starting a timed run.');
    const source = await getRecord(plan.sourceId);
    if (!source) throw new Error('The source request was deleted.');
    if (!(await exists()))
      await chrome.offscreen.createDocument({
        url: hostPath(),
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification:
          'Run a dedicated worker for user-started, paced API tests and streaming measurements without blocking the inspector.',
      });
    const report = createRunReport(
      plan,
      compiled.origin,
      source.workspaceId,
      source.sessionId,
      compiled.warnings,
    );
    return ask({ target: 'load-host', action: 'start', plan, report });
  });
}
export function runnerStatus() {
  return serialize(async () => {
    if (await exists()) return ask({ target: 'load-host', action: 'status' });
    await recoverInterruptedRuns();
    return null;
  });
}
export function stopRun(reason?: string) {
  return serialize(async () => {
    if (await exists()) return ask({ target: 'load-host', action: 'stop', reason });
    await recoverInterruptedRuns();
    return null;
  });
}
export function stopOrphanedRun() {
  return serialize(async () => {
    if (!(await exists())) return;
    const report = await ask({ target: 'load-host', action: 'status' });
    if (!report || !isRunActive(report.state)) return;
    const db = await getDB();
    if (!(await db.count('requests', report.sourceId)) || !(await db.count('runs', report.id)))
      await ask({
        target: 'load-host',
        action: 'stop',
        reason: 'Run history or the source request was deleted.',
      });
  });
}
export function releaseRunner() {
  return serialize(async () => {
    if (!(await exists())) return;
    const report = await ask({ target: 'load-host', action: 'status' });
    if (!report || !isRunActive(report.state)) {
      await chrome.offscreen.closeDocument();
      await recoverInterruptedRuns();
    }
  });
}
