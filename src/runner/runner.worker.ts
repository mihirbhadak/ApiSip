import { RunEngine } from './engine';
import {
  isRunActive,
  runPlanSchema,
  type RunnerCommand,
  type RunnerEvent,
  type RunReport,
} from './model';
import { beginRun, checkpointRun, recoverInterruptedRuns } from '../storage/runs';
import { CoalescedTask } from '../shared/coalesced-task';

let engine: RunEngine | undefined;
let starting = false;
let latest: RunReport | undefined;
let checkpointAt = 0;
const emit = (event: RunnerEvent) => postMessage(event);
const writer = new CoalescedTask(async () => {
  if (!latest) return;
  await checkpointRun(structuredClone(latest));
});
onmessage = (event: MessageEvent<RunnerCommand>) => {
  const command = event.data;
  if (command.type === 'stop') {
    engine?.stop(command.reason);
    return;
  }
  if (command.type !== 'start' || starting || (engine && isRunActive(engine.report.state))) return;
  starting = true;
  void (async () => {
    const plan = runPlanSchema.parse(command.plan);
    await recoverInterruptedRuns();
    await beginRun(command.report);
    latest = command.report;
    emit({ type: 'snapshot', report: command.report });
    engine = new RunEngine(plan, command.report, (report) => {
      latest = report;
      emit({ type: 'snapshot', report });
      if (performance.now() - checkpointAt >= 2000) {
        checkpointAt = performance.now();
        void writer
          .run()
          .catch(() =>
            engine?.stop(
              'Local storage could not save progress. Check available storage or deleted history.',
            ),
          );
      }
    });
    const result = await engine.run();
    latest = result;
    try {
      await writer.run();
    } catch {
      result.reason =
        'Run stopped. Final progress could not be saved because storage failed or history was deleted.';
    }
    emit({ type: 'finished', report: result });
  })()
    .catch(() =>
      emit({
        type: 'failure',
        message:
          'The runner could not start. Check the request, variables and available local storage.',
      }),
    )
    .finally(() => {
      starting = false;
    });
};
