import { z } from 'zod';
import { runPlanSchema, type RunReport } from '../runner/model';
import {
  requestSchema,
  settingsSchema,
  type Diagnostic,
  type ReplayResult,
  type Settings,
} from './model';
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('state') }),
  z.object({ type: z.literal('settings'), patch: settingsSchema.partial() }),
  z.object({ type: z.literal('changed') }),
  z.object({ type: z.literal('open-inspector') }),
  z.object({ type: z.literal('runner-start'), plan: runPlanSchema }),
  z.object({ type: z.literal('runner-status') }),
  z.object({ type: z.literal('runner-stop') }),
  z.object({ type: z.literal('runner-release') }),
  z.object({ type: z.literal('retry-debugger') }),
  z.object({
    type: z.literal('replay'),
    id: z.string(),
    request: requestSchema,
    context: z.enum(['auto', 'browser', 'extension']),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export type RuntimeState = {
  buildId?: string;
  captureQueue?: { pendingWrites: number; largestQueue: number };
  settings: Settings;
  count: number;
  tabCount: number;
  sessionCount: number;
  attachedTabs: number[];
  diagnostics: Diagnostic[];
  hostsGranted: boolean;
};
export interface Replies {
  state: RuntimeState;
  settings: Settings;
  changed: null;
  'open-inspector': null;
  'runner-start': RunReport | null;
  'runner-status': RunReport | null;
  'runner-stop': RunReport | null;
  'runner-release': null;
  'retry-debugger': null;
  replay: ReplayResult;
}
export type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };
export async function sendCommand<T extends Command['type']>(
  command: Extract<Command, { type: T }>,
): Promise<Replies[T]> {
  if (!globalThis.chrome?.runtime?.id)
    throw new Error('Open this inspector from the installed Chrome extension.');
  const response = (await chrome.runtime.sendMessage(command)) as Envelope<Replies[T]> | undefined;
  if (!response) throw new Error('The background worker did not respond. Reload the extension.');
  if (!response.ok) throw new Error(response.error);
  if (
    command.type === 'state' &&
    typeof __BUILD_ID__ !== 'undefined' &&
    (response.data as RuntimeState).buildId !== __BUILD_ID__
  )
    throw new Error(
      'The extension worker is from an older build. Reload ApiSip in chrome://extensions, then reload this inspector.',
    );
  return response.data;
}
