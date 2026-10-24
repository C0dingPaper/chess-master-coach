import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { holdTrainingSession } from "../src/lib/training/session-lock.ts";

const manager = globalThis.navigator?.locks;
const nativeOptions = { skip: !manager, timeout: 5000 };
let sequence = 0;
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function session(name: string, flushWrites: () => Promise<void> = async () => {}) {
  const acquired = deferred();
  const waiting = deferred();
  const statuses: string[] = [];
  const errors: unknown[] = [];
  const stop = holdTrainingSession(manager!, name, {
    onStatus(status) {
      statuses.push(status);
      if (status === "acquired") acquired.resolve();
      else waiting.resolve();
    },
    onError: (error) => errors.push(error),
    flushWrites,
    waitingDelayMs: 10,
  });
  return { acquired: acquired.promise, waiting: waiting.promise, statuses, errors, stop };
}
const name = () => `training-lock-regression:${++sequence}`;

test(
  "StrictMode setup-cleanup-setup acquires without a permanent conflict",
  nativeOptions,
  async (t) => {
    const key = name();
    const first = session(key);
    first.stop();
    const remounted = session(key);
    t.after(remounted.stop);
    await remounted.acquired;
    assert.equal(remounted.statuses.at(-1), "acquired");
    assert.deepEqual(first.errors, []);
    assert.deepEqual(remounted.errors, []);
  },
);

test(
  "a remount waits for the old session's pending writes, then recovers automatically",
  nativeOptions,
  async (t) => {
    const key = name();
    const flushed = deferred();
    const first = session(key, () => flushed.promise);
    t.after(() => {
      flushed.resolve();
      first.stop();
    });
    await first.acquired;
    first.stop();
    const remounted = session(key);
    t.after(remounted.stop);
    await remounted.waiting;
    assert.deepEqual(remounted.statuses, ["waiting"]);
    flushed.resolve();
    await remounted.acquired;
    assert.deepEqual(remounted.statuses, ["waiting", "acquired"]);
    assert.deepEqual(remounted.errors, []);
  },
);

test(
  "a genuine second session waits and acquires after the owner leaves",
  nativeOptions,
  async (t) => {
    const key = name();
    const first = session(key);
    t.after(first.stop);
    await first.acquired;
    const second = session(key);
    t.after(second.stop);
    await second.waiting;
    assert.deepEqual(second.statuses, ["waiting"]);
    first.stop();
    await second.acquired;
    assert.equal(second.statuses.at(-1), "acquired");
  },
);

test(
  "unmount cancels a queued request instead of acquiring an orphan lock later",
  nativeOptions,
  async (t) => {
    const key = name();
    const first = session(key);
    t.after(first.stop);
    await first.acquired;
    const cancelled = session(key);
    cancelled.stop();
    const next = session(key);
    t.after(next.stop);
    first.stop();
    await next.acquired;
    assert.deepEqual(cancelled.statuses, []);
    assert.deepEqual(cancelled.errors, []);
  },
);

test("a rejected final write does not leave the browser lock stuck", nativeOptions, async (t) => {
  const key = name();
  const first = session(key, async () => {
    throw new Error("Storage failed");
  });
  t.after(first.stop);
  await first.acquired;
  first.stop();
  const next = session(key);
  t.after(next.stop);
  await next.acquired;
  assert.equal(next.statuses.at(-1), "acquired");
});

test("browser access failures are errors, never mislabeled as another active tab", async () => {
  const failure = new Error("Browser access denied");
  const broken = { request: () => Promise.reject(failure) } as unknown as Pick<
    LockManager,
    "request"
  >;
  const errors: unknown[] = [];
  const statuses: string[] = [];
  const stop = holdTrainingSession(broken, "broken", {
    onStatus: (value) => statuses.push(value),
    onError: (error) => errors.push(error),
    flushWrites: async () => {},
    waitingDelayMs: 1,
  });
  await delay(10);
  stop();
  assert.deepEqual(errors, [failure]);
  assert.deepEqual(statuses, []);
});
