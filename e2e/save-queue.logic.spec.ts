import { test, expect } from '@playwright/test';
import { SaveQueue, saveLabel, type SaveClock, type SaveQueueState } from '@/lib/reels/saveQueue';

/**
 * The save chip is the one thing on the screen she has to be able to trust: it
 * is the difference between «safe to close» and «you are about to lose this».
 * So its two failure modes are both tested — claiming saved when it is not,
 * and claiming failed when it is.
 */

function harness() {
  const timers = new Map<number, () => void>();
  let nextId = 1;
  const clock: SaveClock = {
    setTimeout: (fn) => {
      const id = nextId++;
      timers.set(id, fn);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (t) => {
      timers.delete(t as unknown as number);
    },
  };
  const states: SaveQueueState[] = [];
  const queue = new SaveQueue(600, (s) => states.push(s), clock);
  const runAll = () => {
    const due = [...timers.values()];
    timers.clear();
    due.forEach((fn) => fn());
  };
  return { queue, states, runAll, last: () => states[states.length - 1] };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test('a burst of typing in one field is one write', async () => {
  const { queue, runAll } = harness();
  let writes = 0;
  for (let i = 0; i < 5; i++) queue.schedule('note', async () => (writes++, true));
  runAll();
  await settle();
  expect(writes).toBe(1);
});

test('busy is true while anything is unsent — that is what guards leaving', () => {
  const { queue } = harness();
  expect(queue.busy).toBe(false);
  queue.schedule('note', async () => true);
  expect(queue.busy).toBe(true);
});

test('a refused write is reported', async () => {
  const { queue, runAll, last } = harness();
  queue.schedule('note', async () => false);
  runAll();
  await settle();
  expect(last().failed).toBe(true);
});

test('a LATER success on the same field clears the failure', async () => {
  // The bug this covers: one transient refusal latched «НЕ збережено» on for
  // the rest of the session, over text that was in fact saved, while every
  // write after it succeeded. A warning that never clears is one she learns to
  // ignore.
  const { queue, runAll, last } = harness();

  queue.schedule('note', async () => false);
  runAll();
  await settle();
  expect(last().failed).toBe(true);

  queue.schedule('note', async () => true);
  runAll();
  await settle();
  expect(last().failed).toBe(false);
});

test('a success on ANOTHER field does not clear a real failure', async () => {
  // «The overlay did not save» must keep warning while the text saves fine.
  const { queue, runAll, last } = harness();

  queue.schedule('overlays', async () => false);
  runAll();
  await settle();
  expect(last().failed).toBe(true);

  queue.schedule('note', async () => true);
  runAll();
  await settle();
  expect(last().failed).toBe(true);
});

test('a throw counts as refused — a dropped connection is the case it is for', async () => {
  const { queue, runAll, last } = harness();
  queue.schedule('note', async () => {
    throw new Error('offline');
  });
  runAll();
  await settle();
  expect(last().failed).toBe(true);
});

test('flush sends what is waiting without waiting for the timer', async () => {
  const { queue } = harness();
  let writes = 0;
  queue.schedule('note', async () => (writes++, true));
  queue.flush();
  await settle();
  expect(writes).toBe(1);
});

test('one-off writes cannot pin a field that is saving fine', async () => {
  const { queue, runAll, last } = harness();
  queue.now(async () => true);
  queue.now(async () => true);
  runAll();
  await settle();
  expect(last().failed).toBe(false);
});

test('the chip only claims «saved» once something really has been', () => {
  const idle: SaveQueueState = { pending: 0, inFlight: 0, failed: false };
  expect(saveLabel(idle, false)).toBe('idle');
  expect(saveLabel(idle, true)).toBe('saved');
  expect(saveLabel({ ...idle, pending: 1 }, true)).toBe('saving');
  expect(saveLabel({ ...idle, failed: true }, true)).toBe('failed');
});
