type LockStatus = "acquired" | "waiting";

/** Queue ownership instead of treating a briefly held lock as a permanent conflict. */
export function holdTrainingSession(
  manager: Pick<LockManager, "request">,
  name: string,
  options: {
    onStatus: (status: LockStatus) => void;
    onError: (error: unknown) => void;
    flushWrites: () => Promise<void>;
    waitingDelayMs?: number;
  },
) {
  const controller = new AbortController();
  let disposed = false;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waitingTimer = setTimeout(() => {
    if (!disposed) options.onStatus("waiting");
  }, options.waitingDelayMs ?? 1000);

  // A pending request is aborted on unmount; an acquired one is held until
  // queued puzzle/time writes finish. This also handles StrictMode remounts.
  async function acquire() {
    try {
      await manager.request(name, { signal: controller.signal }, async () => {
        clearTimeout(waitingTimer);
        if (disposed) return;
        options.onStatus("acquired");
        await held;
      });
    } catch (error) {
      clearTimeout(waitingTimer);
      if (!disposed) options.onError(error);
    }
  }
  void acquire();

  return () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(waitingTimer);
    controller.abort();
    // Run in a microtask so all effect cleanups can enqueue their final write.
    void Promise.resolve().then(options.flushWrites).then(release, release);
  };
}
