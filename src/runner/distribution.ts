import type { Distribution } from './model';

/** Fixed 1,024-bin histogram; percentile upper bounds have at most ~2% relative error. */
export class Histogram {
  private bins = new Uint32Array(1024);
  private count = 0;
  private mean = 0;
  private m2 = 0;
  private min = Infinity;
  private max = 0;
  add(value: number) {
    if (!Number.isFinite(value) || value < 0) return;
    const slot =
      value < 0.01 ? 0 : Math.min(1023, 1 + Math.ceil(Math.log(value / 0.01) / Math.log(1.02)));
    this.bins[slot] = (this.bins[slot] ?? 0) + 1;
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    this.m2 += delta * (value - this.mean);
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
  }
  private percentile(percent: number) {
    let cumulative = 0;
    const rank = Math.ceil(this.count * percent);
    for (let i = 0; i < this.bins.length; i++) {
      cumulative += this.bins[i] ?? 0;
      if (cumulative >= rank) return Math.min(this.max, i === 0 ? 0.01 : 0.01 * 1.02 ** (i - 1));
    }
    return this.max;
  }
  summary(): Distribution {
    return this.count
      ? {
          count: this.count,
          min: this.min,
          max: this.max,
          mean: this.mean,
          stddev: Math.sqrt(Math.max(0, this.m2 / this.count)),
          p50: this.percentile(0.5),
          p95: this.count >= 20 ? this.percentile(0.95) : undefined,
          p99: this.count >= 100 ? this.percentile(0.99) : undefined,
        }
      : { count: 0 };
  }
}
