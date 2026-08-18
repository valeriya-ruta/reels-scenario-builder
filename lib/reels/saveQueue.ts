/**
 * Typing is debounced, so at any moment there is work that has been typed and
 * not yet sent. That is fine right up until the page goes away — and the reel
 * builder had no idea whether it was safe to close. A reload one second after
 * the last keystroke threw the last few seconds of writing away, silently, and
 * the only way to find out was to look at the page afterwards and notice a
 * sentence missing.
 *
 * The queue makes that state knowable and recoverable:
 *   • one timer per key, so a burst of keystrokes is one write;
 *   • `flush()` sends everything now, for `pagehide` / tab-switch;
 *   • `busy` says whether anything is unsaved, so leaving can be questioned;
 *   • `failed` survives until cleared, because a refused write means what is on
 *     screen is NOT what is stored, and that must not fade after a second.
 *
 * Deliberately not a React hook: this is where the correctness lives, so it is
 * a plain object a test can drive with a fake clock.
 */

type Timer = ReturnType<typeof setTimeout>;

/** A write. Resolves true when the server accepted it. */
export type SaveRun = () => Promise<boolean>;

export type SaveQueueState = {
  /** Edits typed but not yet sent. */
  pending: number;
  /** Writes sent and not yet answered. */
  inFlight: number;
  /** A write came back refused — the screen and the database disagree. */
  failed: boolean;
};

export type SaveClock = {
  setTimeout: (fn: () => void, ms: number) => Timer;
  clearTimeout: (t: Timer) => void;
};

const REAL_CLOCK: SaveClock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t),
};

export class SaveQueue {
  private readonly waiting = new Map<string, { timer: Timer; run: SaveRun }>();
  private flying = 0;
  private broke = false;

  constructor(
    private readonly delayMs: number,
    private readonly onState: (s: SaveQueueState) => void,
    private readonly clock: SaveClock = REAL_CLOCK,
  ) {}

  get state(): SaveQueueState {
    return { pending: this.waiting.size, inFlight: this.flying, failed: this.broke };
  }

  /** Is there anything that would be lost by closing the page right now? */
  get busy(): boolean {
    return this.waiting.size > 0 || this.flying > 0;
  }

  /**
   * Typing. Keyed by field, so editing the text does not cancel the write of an
   * overlay attached a moment earlier — and typing the same field twice sends
   * once.
   */
  schedule(key: string, run: SaveRun): void {
    const existing = this.waiting.get(key);
    if (existing) this.clock.clearTimeout(existing.timer);
    const timer = this.clock.setTimeout(() => this.fire(key), this.delayMs);
    this.waiting.set(key, { timer, run });
    this.emit();
  }

  /** A click, not typing — nothing to coalesce, but still worth counting. */
  now(run: SaveRun): void {
    this.start(run);
  }

  /** Send everything that is waiting, immediately. */
  flush(): void {
    for (const key of [...this.waiting.keys()]) {
      const entry = this.waiting.get(key);
      if (!entry) continue;
      this.clock.clearTimeout(entry.timer);
      this.fire(key);
    }
  }

  /** The failure has been seen. */
  clearFailed(): void {
    if (!this.broke) return;
    this.broke = false;
    this.emit();
  }

  /** Drop pending timers without sending — unmounting a screen nobody kept. */
  dispose(): void {
    for (const { timer } of this.waiting.values()) this.clock.clearTimeout(timer);
    this.waiting.clear();
    this.emit();
  }

  private fire(key: string): void {
    const entry = this.waiting.get(key);
    if (!entry) return;
    this.waiting.delete(key);
    this.start(entry.run);
  }

  private start(run: SaveRun): void {
    this.flying += 1;
    this.emit();
    void (async () => {
      try {
        const ok = await run();
        if (!ok) this.broke = true;
      } catch {
        // A dropped connection is exactly the case the banner exists for.
        this.broke = true;
      } finally {
        this.flying -= 1;
        this.emit();
      }
    })();
  }

  private emit(): void {
    this.onState(this.state);
  }
}

/** What the little chip in the header says. */
export type SaveLabel = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * `saved` is only claimed once something has actually been written this
 * session — a chip reading «Збережено» on a page nobody has touched is a
 * promise the app has not made.
 */
export function saveLabel(state: SaveQueueState, everSaved: boolean): SaveLabel {
  if (state.failed) return 'failed';
  if (state.pending > 0 || state.inFlight > 0) return 'saving';
  return everSaved ? 'saved' : 'idle';
}
