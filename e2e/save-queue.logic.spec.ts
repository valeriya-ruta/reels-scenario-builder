import { test, expect } from '@playwright/test';
import { SaveQueue, saveLabel, type SaveClock, type SaveQueueState } from '../lib/reels/saveQueue';

/**
 * The reel builder debounces typing, so there is always a window where work is
 * on screen and not in the database. A reload inside that window used to lose
 * it silently — the bug behind «the text on the block keeps disappearing».
 *
 * These pin the three things that make that impossible: the flush, the busy
 * flag `beforeunload` asks about, and the fact that a refusal STAYS visible.
 */

/** A clock the test drives by hand, so nothing here waits on real time. */
function fakeClock() {
  let next = 1;
  const jobs = new Map<number, () => void>();
  const clock: SaveClock = {
    setTimeout: ((fn: () => void) => {
      const id = next++;
      jobs.set(id, fn);
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as SaveClock['setTimeout'],
    clearTimeout: ((t: unknown) => {
      jobs.delete(t as number);
    }) as SaveClock['clearTimeout'],
  };
  return {
    clock,
    /** Fire every timer that is currently due. */
    tick() {
      for (const [id, fn] of [...jobs]) {
        jobs.delete(id);
        fn();
      }
    },
    get scheduled() {
      return jobs.size;
    },
  };
}

function harness() {
  const c = fakeClock();
  const states: SaveQueueState[] = [];
  const queue = new SaveQueue(600, (s) => states.push(s), c.clock);
  return { queue, states, ...c };
}

test.describe('save queue — nothing typed is lost', () => {
  test('a burst of keystrokes on one field is one write', async () => {
    const { queue, tick } = harness();
    const sent: string[] = [];
    for (const text of ['П', 'Пр', 'При', 'Привіт']) {
      queue.schedule('b1:spoken', async () => {
        sent.push(text);
        return true;
      });
    }
    expect(queue.state.pending).toBe(1);
    tick();
    await Promise.resolve();
    expect(sent).toEqual(['Привіт']);
  });

  test('different fields of the same block are written independently', async () => {
    const { queue, tick } = harness();
    const sent: string[] = [];
    queue.schedule('b1:spoken', async () => (sent.push('spoken'), true));
    queue.schedule('b1:clips', async () => (sent.push('clips'), true));
    expect(queue.state.pending).toBe(2);
    tick();
    await Promise.resolve();
    expect(sent.sort()).toEqual(['clips', 'spoken']);
  });

  test('flush sends a pending edit immediately — the reload case', async () => {
    const { queue } = harness();
    let sent = false;
    queue.schedule('b1:clips', async () => ((sent = true), true));
    // Before the fix this is exactly where the work went: the debounce had not
    // elapsed, the page went away, the write never happened.
    expect(sent).toBe(false);
    queue.flush();
    await Promise.resolve();
    expect(sent).toBe(true);
    expect(queue.state.pending).toBe(0);
  });

  test('flush does not fire a timer twice', async () => {
    const { queue, tick } = harness();
    let calls = 0;
    queue.schedule('k', async () => (calls++, true));
    queue.flush();
    tick();
    await Promise.resolve();
    expect(calls).toBe(1);
  });

  test('busy covers both waiting and in-flight, so beforeunload asks', async () => {
    let release!: (ok: boolean) => void;
    const { queue } = harness();
    expect(queue.busy).toBe(false);

    queue.schedule('k', () => new Promise<boolean>((r) => (release = r)));
    expect(queue.busy).toBe(true); // typed, not sent

    queue.flush();
    expect(queue.busy).toBe(true); // sent, not answered
    expect(queue.state.inFlight).toBe(1);

    release(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.busy).toBe(false);
  });

  test('a refused write is remembered until it is seen', async () => {
    const { queue } = harness();
    queue.now(async () => false);
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.state.failed).toBe(true);

    // A later success must NOT quietly clear it: one field saved does not mean
    // the field that was refused is in the database.
    queue.now(async () => true);
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.state.failed).toBe(true);

    queue.clearFailed();
    expect(queue.state.failed).toBe(false);
  });

  test('a thrown write counts as failed, not as saved', async () => {
    const { queue } = harness();
    queue.now(async () => {
      throw new Error('network');
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(queue.state.failed).toBe(true);
    expect(queue.state.inFlight).toBe(0);
  });

  test('dispose drops timers without sending', async () => {
    const { queue, tick } = harness();
    let sent = false;
    queue.schedule('k', async () => ((sent = true), true));
    queue.dispose();
    tick();
    await Promise.resolve();
    expect(sent).toBe(false);
    expect(queue.busy).toBe(false);
  });
});

test.describe('save chip', () => {
  const state = (s: Partial<SaveQueueState>): SaveQueueState => ({
    pending: 0,
    inFlight: 0,
    failed: false,
    ...s,
  });

  test('an untouched page claims nothing', () => {
    expect(saveLabel(state({}), false)).toBe('idle');
  });

  test('waiting and in-flight both read as saving', () => {
    expect(saveLabel(state({ pending: 1 }), true)).toBe('saving');
    expect(saveLabel(state({ inFlight: 1 }), true)).toBe('saving');
  });

  test('failure outranks everything — it must not be hidden by a later save', () => {
    expect(saveLabel(state({ failed: true, inFlight: 2 }), true)).toBe('failed');
  });

  test('saved only once something was actually written', () => {
    expect(saveLabel(state({}), true)).toBe('saved');
  });
});
