/**
 * Leading + trailing throttle that coalesces high-frequency triggers — most
 * importantly the stream of selection-change events produced by a held arrow
 * key — into at most one execution per cooldown window.
 *
 * Why this exists: applying inline-markdown decorations is an O(document) pass
 * (filter every decoration, re-issue every `setDecorations`). Running it once
 * per raw selection event lets passes queue faster than they finish on long
 * documents, so the rendered reveal/ghost decorations visibly trail the caret.
 *
 * Behaviour:
 *  - The first call after an idle period runs immediately (leading edge), so a
 *    single discrete cursor move updates with no perceptible delay.
 *  - While "warm" (inside a cooldown window) only the most recent callback is
 *    retained; intermediate triggers are dropped. When the window elapses that
 *    latest callback runs once (trailing edge) and a fresh window starts.
 *  - The cooldown auto-tunes to the measured synchronous cost of the previous
 *    pass, clamped to [minIntervalMs, maxIntervalMs]. This guarantees the next
 *    pass cannot start until at least one pass-worth of time has elapsed, so a
 *    backlog can never form regardless of document size, while cheap documents
 *    stay effectively immediate.
 */
export type Clock = () => number;

export class SelectionUpdateThrottle {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: (() => void) | undefined;

  constructor(
    private readonly minIntervalMs: number,
    private readonly maxIntervalMs: number,
    private readonly now: Clock = () => Date.now()
  ) {}

  /**
   * Request execution of `callback`. Runs immediately when idle, otherwise
   * records it as the pending trailing-edge run (latest wins).
   */
  run(callback: () => void): void {
    if (this.timer !== undefined) {
      this.pending = callback;
      return;
    }
    this.execute(callback);
  }

  private execute(callback: () => void): void {
    const start = this.now();
    try {
      callback();
    } finally {
      const elapsed = this.now() - start;
      const interval = Math.min(this.maxIntervalMs, Math.max(this.minIntervalMs, elapsed));
      this.timer = setTimeout(() => this.onWindowEnd(), interval);
    }
  }

  private onWindowEnd(): void {
    this.timer = undefined;
    const next = this.pending;
    this.pending = undefined;
    if (next) {
      this.execute(next);
    }
  }

  /** Drop any pending trailing run and clear the cooldown (e.g. on editor switch). */
  cancel(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.pending = undefined;
  }

  dispose(): void {
    this.cancel();
  }
}
