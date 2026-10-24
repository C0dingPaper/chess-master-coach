import { openDB, type IDBPDatabase } from "idb";
import { trainingDay } from "./engine.ts";
import type { DailyTraining, TrainingAttempt, TrainingState } from "./types.ts";

const DB_NAME = "neverpay4chess-training";
let database: Promise<IDBPDatabase> | undefined;

function getDb() {
  if (typeof indexedDB === "undefined")
    throw new Error("This browser does not support saving training progress.");
  if (database) return database;
  const opening = openDB(DB_NAME, 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("states"))
        db.createObjectStore("states", { keyPath: "collection.accountKey" });
      if (!db.objectStoreNames.contains("attempts")) {
        const attempts = db.createObjectStore("attempts", { keyPath: "id" });
        attempts.createIndex("accountKey", "accountKey");
        attempts.createIndex("accountDay", ["accountKey", "day"]);
      }
      if (!db.objectStoreNames.contains("daily")) db.createObjectStore("daily", { keyPath: "id" });
      if (!db.objectStoreNames.contains("leases")) db.createObjectStore("leases");
      if (!db.objectStoreNames.contains("archives")) {
        const archives = db.createObjectStore("archives", { keyPath: "id", autoIncrement: true });
        archives.createIndex("accountKey", "state.collection.accountKey");
      }
    },
  })
    .then((db) => {
      const clear = () => {
        if (database === opening) database = undefined;
      };
      db.addEventListener("versionchange", () => {
        db.close();
        clear();
      });
      db.addEventListener("close", clear);
      return db;
    })
    .catch((error) => {
      if (database === opening) database = undefined;
      throw error;
    });
  database = opening;
  return database;
}

export function emptyDailyTraining(accountKey: string, day = trainingDay()): DailyTraining {
  return {
    id: `${accountKey}:${day}`,
    accountKey,
    day,
    activeMs: 0,
    attempts: 0,
    correct: 0,
    failed: 0,
    firstAttempts: 0,
    firstCorrect: 0,
  };
}

// Keep same-tab state writes in invocation order even while IndexedDB opens.
let writeQueue: Promise<unknown> = Promise.resolve();
function queued<T>(work: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(work, work);
  writeQueue = next.catch(() => undefined);
  return next;
}

/** Allow effect cleanups to enqueue their final timer tick before releasing a tab lock. */
export async function flushTrainingWrites() {
  await Promise.resolve();
  await writeQueue;
}

/** Transactional fallback for browsers without Web Locks (for example plain LAN HTTP). */
export async function claimTrainingLease(accountKey: string, owner: string, now = Date.now()) {
  const db = await getDb();
  const tx = db.transaction("leases", "readwrite");
  const lease = (await tx.store.get(accountKey)) as { owner: string; expires: number } | undefined;
  const granted = !lease || lease.owner === owner || lease.expires <= now;
  if (granted) await tx.store.put({ owner, expires: now + 15000 }, accountKey);
  await tx.done;
  return granted;
}

export async function releaseTrainingLease(accountKey: string, owner: string) {
  await flushTrainingWrites();
  const db = await getDb();
  const tx = db.transaction("leases", "readwrite");
  const lease = (await tx.store.get(accountKey)) as { owner: string } | undefined;
  if (lease?.owner === owner) await tx.store.delete(accountKey);
  await tx.done;
}

export async function loadTrainingState(accountKey: string): Promise<TrainingState | null> {
  await writeQueue;
  const db = await getDb();
  return (await db.get("states", accountKey)) ?? null;
}

export function saveTrainingState(state: TrainingState): Promise<void> {
  return queued(async () => {
    const db = await getDb();
    const tx = db.transaction("states", "readwrite");
    const previous = (await tx.store.get(state.collection.accountKey)) as TrainingState | undefined;
    // Delayed writes cannot resurrect a replaced collection or undo a completion.
    if (
      !previous ||
      (previous.collection.id === state.collection.id &&
        previous.attemptCount <= state.attemptCount)
    ) {
      await tx.store.put(state);
    }
    await tx.done;
  });
}

/** Atomically swap a collection only if the caller still has the current one. */
export function replaceTrainingCollection(
  next: TrainingState,
  expectedCollectionId: string | null,
): Promise<boolean> {
  return queued(async () => {
    const db = await getDb();
    const tx = db.transaction(["states", "archives"], "readwrite");
    const states = tx.objectStore("states");
    const previous = (await states.get(next.collection.accountKey)) as TrainingState | undefined;
    if ((previous?.collection.id ?? null) !== expectedCollectionId) {
      await tx.done;
      return false;
    }
    if (previous?.collection.id === next.collection.id) {
      await tx.done;
      throw new Error("A replacement collection must have a new identifier.");
    }
    if (previous) await tx.objectStore("archives").add({ state: previous, archivedAt: Date.now() });
    await states.put(next);
    await tx.done;
    return true;
  });
}

export async function getTrainingArchives(accountKey: string): Promise<TrainingState[]> {
  await writeQueue;
  const db = await getDb();
  const archives = (await db.getAllFromIndex("archives", "accountKey", accountKey)) as {
    id: number;
    state: TrainingState;
    archivedAt: number;
  }[];
  return archives.sort((a, b) => b.id - a.id).map((archive) => archive.state);
}

/** Save the next position and the result together; duplicate retries are harmless. */
export function saveAttempt(state: TrainingState, attempt: TrainingAttempt): Promise<void> {
  return queued(async () => {
    if (
      state.collection.accountKey !== attempt.accountKey ||
      state.collection.id !== attempt.collectionId
    ) {
      throw new Error("The attempt does not belong to this training collection.");
    }
    const db = await getDb();
    const tx = db.transaction(["states", "attempts", "daily"], "readwrite");
    const states = tx.objectStore("states");
    const previous = (await states.get(attempt.accountKey)) as TrainingState | undefined;
    // A completion arriving after a collection swap belongs to its archived state.
    // Ignore it instead of altering the new collection or inflating today's totals.
    if (previous && previous.collection.id !== state.collection.id) {
      await tx.done;
      return;
    }
    const attempts = tx.objectStore("attempts");
    if (!(await attempts.get(attempt.id))) {
      const dailyStore = tx.objectStore("daily");
      const daily =
        ((await dailyStore.get(`${attempt.accountKey}:${attempt.day}`)) as
          | DailyTraining
          | undefined) ?? emptyDailyTraining(attempt.accountKey, attempt.day);
      await attempts.add(attempt);
      await dailyStore.put({
        ...daily,
        attempts: daily.attempts + 1,
        correct: daily.correct + Number(attempt.correct),
        failed: daily.failed + Number(!attempt.correct),
        firstAttempts: daily.firstAttempts + Number(attempt.firstAttempt),
        firstCorrect: daily.firstCorrect + Number(attempt.firstAttempt && attempt.correct),
      });
    }
    if (!previous || previous.attemptCount <= state.attemptCount) {
      await states.put(state);
    }
    await tx.done;
  });
}

export async function getDailyTraining(
  accountKey: string,
  day = trainingDay(),
): Promise<DailyTraining> {
  await writeQueue;
  const db = await getDb();
  return (await db.get("daily", `${accountKey}:${day}`)) ?? emptyDailyTraining(accountKey, day);
}

/** Read-modify-write in one transaction so sessions cannot overwrite elapsed time. */
export function addTrainingTime(
  accountKey: string,
  deltaMs: number,
  day = trainingDay(),
  expectedTimerVersion?: number,
): Promise<DailyTraining> {
  return queued(async () => {
    if (!Number.isFinite(deltaMs) || deltaMs < 0)
      throw new Error("Training time must be a non-negative duration.");
    const db = await getDb();
    const tx = db.transaction("daily", "readwrite");
    const daily =
      ((await tx.store.get(`${accountKey}:${day}`)) as DailyTraining | undefined) ??
      emptyDailyTraining(accountKey, day);
    // A tick queued before Reset must not restore time after the reset commits.
    if (expectedTimerVersion !== undefined && expectedTimerVersion !== (daily.timerVersion ?? 0)) {
      await tx.done;
      return daily;
    }
    const next = { ...daily, activeMs: daily.activeMs + Math.round(deltaMs) };
    await tx.store.put(next);
    await tx.done;
    return next;
  });
}

/** Reset only the current day's clock; attempts, accuracy and puzzle progress remain intact. */
export function resetTrainingTime(accountKey: string, day = trainingDay()): Promise<DailyTraining> {
  return queued(async () => {
    const db = await getDb();
    const tx = db.transaction("daily", "readwrite");
    const daily =
      ((await tx.store.get(`${accountKey}:${day}`)) as DailyTraining | undefined) ??
      emptyDailyTraining(accountKey, day);
    const next = { ...daily, activeMs: 0, timerVersion: (daily.timerVersion ?? 0) + 1 };
    await tx.store.put(next);
    await tx.done;
    return next;
  });
}

export async function getTrainingAttempts(
  accountKey: string,
  day?: string,
): Promise<TrainingAttempt[]> {
  await writeQueue;
  const db = await getDb();
  const attempts = day
    ? await db.getAllFromIndex("attempts", "accountDay", [accountKey, day])
    : await db.getAllFromIndex("attempts", "accountKey", accountKey);
  return (attempts as TrainingAttempt[]).sort((a, b) => a.at - b.at || a.sequence - b.sequence);
}
