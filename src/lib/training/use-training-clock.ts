import { useEffect, useRef, useState } from "react";
import { DAILY_GOAL_MS, trainingDay } from "./engine";
import { elapsedTrainingTime } from "./clock";
import { holdTrainingSession } from "./session-lock";
import {
  addTrainingTime,
  getDailyTraining,
  resetTrainingTime,
  flushTrainingWrites,
  claimTrainingLease,
  releaseTrainingLease,
} from "./storage";
import type { DailyTraining } from "./types";

/** Only visible, resumed practice counts. Small atomic writes also survive reloads. */
export function useTrainingClock(accountKey: string, running: boolean, revision: number) {
  const [daily, setDaily] = useState<DailyTraining | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goalReached, setGoalReached] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [day, setDay] = useState(trainingDay);
  const mounted = useRef(true);
  function updateDaily(value: DailyTraining) {
    if (!mounted.current || value.day !== trainingDay()) return;
    // Reads racing with a completed write must never make counters go backwards.
    setDaily((previous) => {
      if (previous?.day !== value.day) return value;
      if ((value.timerVersion ?? 0) < (previous.timerVersion ?? 0)) return previous;
      if ((value.timerVersion ?? 0) > (previous.timerVersion ?? 0)) return value;
      return {
        ...value,
        activeMs: Math.max(previous.activeMs, value.activeMs),
        attempts: Math.max(previous.attempts, value.attempts),
        correct: Math.max(previous.correct, value.correct),
        failed: Math.max(previous.failed, value.failed),
        firstAttempts: Math.max(previous.firstAttempts, value.firstAttempts),
        firstCorrect: Math.max(previous.firstCorrect, value.firstCorrect),
      };
    });
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const refreshDay = () => setDay(trainingDay());
    const timer = window.setInterval(refreshDay, 1000);
    document.addEventListener("visibilitychange", refreshDay);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshDay);
    };
  }, []);
  useEffect(() => {
    setGoalReached(false);
  }, [day]);
  useEffect(() => {
    let current = true;
    void getDailyTraining(accountKey)
      .then((value) => {
        if (current) updateDaily(value);
      })
      .catch(() => {
        if (current)
          setError(
            "Your training time could not be loaded. Check that browser storage is available.",
          );
      });
    return () => {
      current = false;
    };
  }, [accountKey, revision, day]);

  const loadedDay = daily?.day;
  const timerVersion = daily?.timerVersion ?? 0;
  useEffect(() => {
    if (!running || error || loadedDay !== trainingDay()) return;
    let last = { monotonicMs: performance.now(), wallMs: Date.now() };
    let visible = document.visibilityState === "visible";
    function save(delta: number, day: string) {
      const expectedVersion = day === loadedDay ? timerVersion : 0;
      void addTrainingTime(accountKey, delta, day, expectedVersion)
        .then((value) => {
          if (!mounted.current) return;
          updateDaily(value);
          if (
            day === trainingDay() &&
            (value.timerVersion ?? 0) === expectedVersion &&
            value.activeMs >= DAILY_GOAL_MS &&
            value.activeMs - Math.round(delta) < DAILY_GOAL_MS
          )
            setGoalReached(true);
        })
        .catch(() => {
          if (mounted.current)
            setError(
              "Training time could not be saved. Please pause and check your browser storage.",
            );
        });
    }
    function tick() {
      const now = { monotonicMs: performance.now(), wallMs: Date.now() };
      for (const slice of elapsedTrainingTime(last, now, visible)) save(slice.deltaMs, slice.day);
      last = now;
    }
    function onVisibility() {
      tick();
      visible = document.visibilityState === "visible";
    }
    function onPageHide() {
      tick();
      visible = false;
    }
    function onPageShow() {
      last = { monotonicMs: performance.now(), wallMs: Date.now() };
      visible = document.visibilityState === "visible";
    }
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearInterval(timer);
      tick();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [accountKey, running, error, loadedDay, timerVersion]);

  async function reset() {
    if (resetting) return;
    setResetting(true);
    try {
      const value = await resetTrainingTime(accountKey);
      if (!mounted.current) return;
      updateDaily(value);
      setGoalReached(false);
    } catch {
      if (mounted.current)
        setError("Your timer could not be reset. Please check that browser storage is available.");
    } finally {
      if (mounted.current) setResetting(false);
    }
  }
  return { daily, error, goalReached, dismissGoal: () => setGoalReached(false), reset, resetting };
}

/** One training writer per account, including across browser tabs. */
export function useTrainingLock(accountKey: string) {
  const [locked, setLocked] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    setLocked(false);
    setUnavailable(false);
    setError(null);
    const failed = () => {
      if (disposed) return;
      setLocked(false);
      setUnavailable(false);
      setError(
        "Your browser could not open a training session. Make sure storage is allowed for this site, then reload training.",
      );
    };
    if (!navigator.locks) {
      const owner = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
      let renewing = false;
      const renew = async () => {
        if (renewing || disposed) return;
        renewing = true;
        try {
          const granted = await claimTrainingLease(accountKey, owner);
          if (disposed) {
            if (granted) await releaseTrainingLease(accountKey, owner);
            return;
          }
          setLocked(granted);
          setUnavailable(!granted);
          setError(null);
        } catch {
          failed();
        } finally {
          renewing = false;
        }
      };
      const onVisibility = () => {
        if (document.visibilityState === "visible") {
          void renew();
        }
      };
      void renew();
      const timer = window.setInterval(() => void renew(), 5000);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        disposed = true;
        window.clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisibility);
        void releaseTrainingLease(accountKey, owner).catch(() => undefined);
      };
    }
    const stop = holdTrainingSession(navigator.locks, `chess-training:${accountKey}`, {
      onStatus: (status) => {
        if (disposed) return;
        setLocked(status === "acquired");
        setUnavailable(status === "waiting");
        setError(null);
      },
      onError: failed,
      flushWrites: flushTrainingWrites,
    });
    return () => {
      disposed = true;
      stop();
    };
  }, [accountKey]);
  return { locked, unavailable, error };
}
