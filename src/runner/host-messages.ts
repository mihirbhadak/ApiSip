import type { RunPlan, RunReport } from './model';
export type HostCommand = { target: 'load-host' } & (
  | { action: 'start'; plan: RunPlan; report: RunReport }
  | { action: 'status' }
  | { action: 'stop'; reason?: string }
);
export type HostReply = { ok: true; report: RunReport | null } | { ok: false; error: string };
