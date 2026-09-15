type ScheduleConfig = {
  count: number;
  durationSeconds: number;
  rampSeconds: number;
  maxStartDelayMs: number;
};
/** Reserve at most 1% of the window (50 ms) for normal browser timer granularity. */
export function deadlineHeadroom(config: ScheduleConfig) {
  return Math.min(50, config.durationSeconds * 10, config.maxStartDelayMs);
}
function shape(config: ScheduleConfig) {
  const end = config.durationSeconds * 1000 - deadlineHeadroom(config);
  const ramp = Math.min(config.rampSeconds * 1000, end);
  return { ramp, area: end - ramp / 2 };
}
export function plannedPeakRate(config: ScheduleConfig) {
  return (config.count * 1000) / shape(config).area;
}
/** Inverse integral of a uniform or linearly ramped arrival rate. Index is zero-based. */
export function scheduledTime(index: number, config: ScheduleConfig) {
  const { ramp, area } = shape(config);
  const position = (index * area) / config.count;
  return ramp && position < ramp / 2 ? Math.sqrt(2 * ramp * position) : position + ramp / 2;
}
export function dueCount(elapsed: number, config: ScheduleConfig) {
  if (elapsed < 0) return 0;
  const { ramp, area } = shape(config);
  const integrated = ramp && elapsed < ramp ? (elapsed * elapsed) / (2 * ramp) : elapsed - ramp / 2;
  return Math.min(config.count, Math.floor((integrated * config.count) / area + 1e-9) + 1);
}
