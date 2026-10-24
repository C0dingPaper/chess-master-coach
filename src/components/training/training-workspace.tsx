import { useEffect, useRef, useState } from "react";
import {
  Check,
  CircleCheck,
  Clock,
  Flame,
  Loader2,
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  Target,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PuzzlePlayer } from "./puzzle-player";
import type { Connection } from "@/lib/chess/types";
import { loadCalibrationPuzzle, loadCollectionPuzzles } from "@/lib/training/catalog";
import {
  CALIBRATION_LENGTH,
  INITIAL_CALIBRATION_RATING,
  fetchTrainingRatings,
  updateCalibrationRating,
  type VerifiedPlayingRating,
  type VerifiedPuzzleRating,
} from "@/lib/training/rating";
import {
  COLLECTION_SIZE,
  DAILY_GOAL_MS,
  completeAttempt,
  createActivePuzzle,
  createCollection,
  createTrainingState,
  getCurrentPuzzle,
  prepareTrainingSession,
} from "@/lib/training/engine";
import {
  loadTrainingState,
  saveAttempt,
  saveTrainingState,
  replaceTrainingCollection,
  getTrainingArchives,
} from "@/lib/training/storage";
import {
  TRAINING_GAIN,
  attachPlayingBaseline,
  attachRatingBaseline,
  ratingDecision,
  trainingLevel,
} from "@/lib/training/progression";
import { useTrainingClock, useTrainingLock } from "@/lib/training/use-training-clock";
import type { ActivePuzzle, Puzzle, TrainingAttempt, TrainingState } from "@/lib/training/types";

type Stage = "loading" | "calibration-ready" | "calibrating" | "building" | "ready" | "error";
interface Calibration {
  rating: number;
  completed: number;
  used: string[];
  puzzle: Puzzle;
  active: ActivePuzzle;
}

export function TrainingWorkspace({
  connection,
  accountKey,
}: {
  connection: Connection;
  accountKey: string;
}) {
  const [stage, setStage] = useState<Stage>("loading");
  const [state, setState] = useState<TrainingState | null>(null);
  const stateRef = useRef<TrainingState | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [checkingRating, setCheckingRating] = useState(false);
  const [ratingNotice, setRatingNotice] = useState<string | null>(null);
  const [archives, setArchives] = useState<TrainingState[]>([]);
  const ratingCheckInFlight = useRef(false);
  const ratingCheckedAt = useRef(0);
  const failedUpgrade = useRef<string | null>(null);
  const setupPlayingRating = useRef<VerifiedPlayingRating | null>(null);
  const runningRef = useRef(running);
  runningRef.current = running;
  const pendingWrites = useRef(0);
  const alive = useRef(true);
  const lock = useTrainingLock(accountKey);
  const clock = useTrainingClock(
    accountKey,
    running && lock.locked && !storageError && !busy,
    revision,
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (clock.error) setRunning(false);
  }, [clock.error]);

  function publish(next: TrainingState) {
    stateRef.current = next;
    setState(next);
  }
  function persist(next: TrainingState, attempt?: TrainingAttempt) {
    publish(next);
    setSaved(false);
    pendingWrites.current++;
    // The storage layer serializes writes. Enqueue immediately so leaving this
    // page cannot allow a new session to load before pending moves are saved.
    return (attempt ? saveAttempt(next, attempt) : saveTrainingState(next))
      .then(() => {
        pendingWrites.current--;
        if (alive.current) {
          setSaved(pendingWrites.current === 0);
          if (attempt) setRevision((value) => value + 1);
        }
        return true;
      })
      .catch((cause: unknown) => {
        pendingWrites.current--;
        if (alive.current) {
          setStorageError(cause instanceof Error ? cause.message : "Progress could not be saved.");
          setRunning(false);
        }
        return false;
      });
  }

  async function build(
    rating: number,
    source: string,
    signal?: AbortSignal,
    verified?: VerifiedPuzzleRating,
    playing: VerifiedPlayingRating | undefined = setupPlayingRating.current ?? undefined,
  ) {
    setStage("building");
    const catalog = await loadCollectionPuzzles(rating, signal);
    if (!alive.current || signal?.aborted) return;
    const created = createCollection(accountKey, catalog.baseRating, catalog.puzzles, source);
    let collection = verified ? attachRatingBaseline(created, verified) : created;
    if (playing) collection = attachPlayingBaseline(collection, playing);
    const next = {
      ...createTrainingState(collection),
      latestRating: verified,
      latestPlayingRating: playing,
    };
    const previousId = stateRef.current?.collection.id ?? null;
    if (!(await replaceTrainingCollection(next, previousId)))
      throw new Error("Your training collection changed while loading. Please reload training.");
    if (!alive.current || signal?.aborted) return;
    publish(next);
    setArchives(await getTrainingArchives(accountKey));
    setStage("ready");
    setRunning(false);
  }

  async function upgradeDrill(
    current: TrainingState,
    rating: VerifiedPlayingRating,
    resume: boolean,
  ) {
    if (
      busyRef.current ||
      failedUpgrade.current === current.collection.id ||
      stateRef.current?.collection.id !== current.collection.id ||
      ratingDecision(current, rating) !== "upgrade"
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setRunning(false);
    try {
      // Recheck both scales at replacement time, including when an upgrade was
      // deferred until the current puzzle finished. Game ratings never set difficulty.
      const fresh = await fetchTrainingRatings(connection, undefined, rating.mode);
      if (!alive.current) return;
      if (!fresh.playing || !fresh.puzzle) {
        failedUpgrade.current = current.collection.id;
        setRatingNotice(
          "Your current game and puzzle ratings must both be available to refresh the drill. Your collection is unchanged; use Check ratings to retry.",
        );
        setRunning(resume);
        return;
      }
      const latest = stateRef.current!;
      const decision = ratingDecision(latest, fresh.playing);
      if (decision !== "upgrade") {
        if (
          decision === "keep" &&
          !(await persist({
            ...latest,
            latestRating: fresh.puzzle,
            latestPlayingRating: fresh.playing,
          }))
        )
          return;
        setRatingNotice(
          "Your game rating has not reached this drill’s upgrade threshold. Keep training.",
        );
        setRunning(resume);
        return;
      }
      await build(fresh.puzzle.rating, "lichess", undefined, fresh.puzzle, fresh.playing);
      if (!alive.current) return;
      setRatingNotice(
        `Your Lichess ${fresh.playing.mode} rating reached ${fresh.playing.rating}. A new drill uses your ${fresh.puzzle.rating} puzzle rating; previous progress is archived.`,
      );
      setRunning(resume);
    } catch (cause) {
      if (!alive.current) return;
      failedUpgrade.current = current.collection.id;
      setStage("ready");
      setRatingNotice(
        cause instanceof Error
          ? cause.message
          : "Could not refresh the drill. Your existing collection is saved.",
      );
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function checkRatings() {
    if (
      !stateRef.current ||
      ratingCheckInFlight.current ||
      busyRef.current ||
      storageError ||
      !lock.locked
    )
      return;
    ratingCheckInFlight.current = true;
    ratingCheckedAt.current = Date.now();
    setCheckingRating(true);
    try {
      const { puzzle, playing } = await fetchTrainingRatings(
        connection,
        undefined,
        stateRef.current.collection.playingBaseline?.mode ?? "rapid",
      );
      if (!alive.current) return;
      if (!puzzle && !playing) {
        setRatingNotice(
          "Current established ratings are unavailable. Your collection stays unchanged.",
        );
        return;
      }
      const current = stateRef.current!;
      const decision = playing ? ratingDecision(current, playing) : "keep";
      if (decision === "source-mismatch")
        throw new Error("The rating belongs to a different account. Your drill was not changed.");
      const next = {
        ...current,
        latestRating: puzzle ?? current.latestRating,
        latestPlayingRating: playing ?? current.latestPlayingRating,
        collection:
          decision === "migrate" && playing
            ? attachPlayingBaseline(current.collection, playing)
            : current.collection,
      };
      if (!(await persist(next))) return;
      // A puzzle may finish while its rating snapshot is being saved.
      // Use the latest board state, and let an upgrade already in progress finish.
      const savedState = stateRef.current;
      if (
        !alive.current ||
        busyRef.current ||
        !savedState ||
        savedState.collection.id !== next.collection.id
      )
        return;
      if (!playing) {
        setRatingNotice(
          `An established Lichess ${current.collection.playingBaseline?.mode ?? "rapid"} game rating is unavailable. Your drill stays unchanged.`,
        );
        return;
      }
      // Failed refreshes wait for another successful rating check, instead of
      // pausing practice for a network retry after every completed puzzle.
      if (puzzle) failedUpgrade.current = null;
      if (decision === "upgrade") {
        if (!puzzle) {
          failedUpgrade.current = savedState.collection.id;
          setRatingNotice(
            "Your game rating reached the upgrade threshold, but your current puzzle rating is unavailable. Keep training and use Check ratings to retry.",
          );
          return;
        }
        if (!runningRef.current && !savedState.active.failed && savedState.active.moveIndex === 1)
          await upgradeDrill(savedState, playing, false);
        else
          setRatingNotice(
            `Your Lichess ${playing.mode} game rating has gained at least ${TRAINING_GAIN} points. Your drill will refresh after this puzzle.`,
          );
      } else
        setRatingNotice(
          `Lichess ${playing.mode} rating checked: ${playing.rating}. Your current drill stays fixed until ${next.collection.playingBaseline!.rating + TRAINING_GAIN} in ${playing.mode}.`,
        );
    } catch (cause) {
      if (alive.current)
        setRatingNotice(
          cause instanceof Error
            ? cause.message
            : "Rating check failed. Your drill stays unchanged.",
        );
    } finally {
      ratingCheckInFlight.current = false;
      if (alive.current) setCheckingRating(false);
    }
  }

  const checkRatingRef = useRef(checkRatings);
  checkRatingRef.current = checkRatings;
  useEffect(() => {
    if (!lock.locked || stage !== "ready" || connection.platform !== "lichess") return;
    const refresh = () => {
      if (document.visibilityState === "visible" && Date.now() - ratingCheckedAt.current >= 60000)
        void checkRatingRef.current();
    };
    const timer = window.setInterval(refresh, 5 * 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [lock.locked, stage, connection.platform]);

  useEffect(() => {
    if (!lock.locked) return;
    const controller = new AbortController();
    async function initialize() {
      try {
        const existing = await loadTrainingState(accountKey);
        if (controller.signal.aborted) return;
        setArchives(await getTrainingArchives(accountKey));
        ratingCheckedAt.current = Date.now();
        const { puzzle, playing } = await fetchTrainingRatings(
          connection,
          controller.signal,
          existing?.collection.playingBaseline?.mode ?? "rapid",
        );
        if (controller.signal.aborted) return;
        setupPlayingRating.current = playing;
        if (existing) {
          let next = prepareTrainingSession(existing);
          next = {
            ...next,
            latestRating: puzzle ?? next.latestRating,
            latestPlayingRating: playing ?? next.latestPlayingRating,
          };
          if (playing) {
            const decision = ratingDecision(next, playing);
            if (decision === "source-mismatch")
              throw new Error("The saved training rating belongs to a different account.");
            next = {
              ...next,
              collection:
                decision === "migrate"
                  ? attachPlayingBaseline(next.collection, playing)
                  : next.collection,
            };
          } else if (connection.platform === "lichess")
            setRatingNotice(
              "Could not verify an established game rating. Your saved drill is unchanged.",
            );
          await saveTrainingState(next);
          if (controller.signal.aborted) return;
          publish(next);
          setStage("ready");
          if (playing && ratingDecision(next, playing) === "upgrade") {
            if (!next.active.failed && next.active.moveIndex === 1)
              await upgradeDrill(next, playing, false);
            else
              setRatingNotice(
                `Your Lichess ${playing.mode} game rating has gained at least ${TRAINING_GAIN} points. Finish this puzzle to start your updated drill.`,
              );
          }
          return;
        }
        if (puzzle) await build(puzzle.rating, "lichess", controller.signal, puzzle);
        else setStage("calibration-ready");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Training could not load.");
        setStage("error");
      }
    }
    void initialize();
    return () => {
      controller.abort();
    };
    // Account identity is the component key; importing games must not reset a collection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey, lock.locked]);

  async function startCalibration() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const puzzle = await loadCalibrationPuzzle(INITIAL_CALIBRATION_RATING, []);
      if (!alive.current) return;
      setCalibration({
        rating: INITIAL_CALIBRATION_RATING,
        completed: 0,
        used: [puzzle.id],
        puzzle,
        active: createActivePuzzle(puzzle),
      });
      setStage("calibrating");
      setRunning(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Calibration could not load.");
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function finishCalibration(active: ActivePuzzle) {
    if (!calibration || busyRef.current || !active.completed) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const rating = updateCalibrationRating(
      calibration.rating,
      !active.failed && !active.hinted,
      calibration.completed,
    );
    const completed = calibration.completed + 1;
    try {
      if (completed >= CALIBRATION_LENGTH) await build(rating, "calibration");
      else {
        const puzzle = await loadCalibrationPuzzle(rating, calibration.used);
        if (!alive.current) return;
        setCalibration({
          rating,
          completed,
          used: [...calibration.used, puzzle.id],
          puzzle,
          active: createActivePuzzle(puzzle),
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The next puzzles could not load.");
      setStage("calibrating");
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function finishPuzzle(active: ActivePuzzle) {
    const current = stateRef.current;
    if (
      !current ||
      current.active.puzzleId !== active.puzzleId ||
      !active.completed ||
      storageError
    )
      return;
    const result = completeAttempt({ ...current, active });
    setLastResult(
      result.attempt.correct
        ? "Correct — on to the next puzzle."
        : "Saved for review. You’ll see that pattern again soon.",
    );
    if (result.state.cycle !== current.cycle)
      toast.success(`Cycle ${current.cycle} complete!`, {
        description: "The same 1,000 puzzles are shuffled for your next cycle.",
      });
    const savedAttempt = persist(result.state, result.attempt);
    const rating = result.state.latestPlayingRating;
    if (
      rating &&
      failedUpgrade.current !== result.state.collection.id &&
      ratingDecision(result.state, rating) === "upgrade"
    ) {
      // Do not replace the collection unless the final result was saved first.
      setRunning(false);
      void savedAttempt.then((saved) => {
        if (!saved || !alive.current) return;
        // A concurrent profile check may defer the upgrade while this save is pending.
        if (failedUpgrade.current === result.state.collection.id) setRunning(true);
        else void upgradeDrill(result.state, rating, true);
      });
    }
  }

  const today = clock.daily;
  const activeMs = today?.activeMs ?? 0;
  const minutes = Math.floor(activeMs / 60000);
  const seconds = Math.floor((activeMs % 60000) / 1000);
  const timeText = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const currentPuzzle = state ? getCurrentPuzzle(state) : null;
  const completed = state?.completedIds.length ?? 0;
  const firstCorrect = state
    ? Object.values(state.stats).filter((p) => p.firstTryCorrect).length
    : 0;
  const needsPractice = state
    ? Object.values(state.stats).filter((p) => p.failures > 0 && p.successStreak < 3).length
    : 0;
  const canTrain = running && !busy && !storageError && !clock.error && lock.locked;

  if (lock.error)
    return (
      <div className="app-page">
        <ErrorCard message={lock.error} />
      </div>
    );
  if (lock.unavailable)
    return (
      <div className="app-page">
        <div className="surface-card p-8" role="status">
          <h2 className="text-xl font-semibold">Waiting for your training session</h2>
          <p className="mt-4 text-sm text-muted-foreground">
            A previous session may still be finishing. This page will continue automatically when it
            is ready. If you have training open in another tab, close its training page.
          </p>
          <Loader2 className="mt-4 h-5 w-5 animate-spin text-accent" />
        </div>
      </div>
    );
  if (stage === "loading" || stage === "building")
    return (
      <Loading
        message={
          stage === "building"
            ? "Building your personal collection of 1,000 puzzles…"
            : "Finding your training progress and ratings…"
        }
      />
    );
  if (stage === "error")
    return (
      <div className="app-page">
        <ErrorCard message={error ?? "Training could not load."} />
      </div>
    );

  return (
    <div className="app-page !pt-4">
      <PageHeader
        eyebrow="Your daily practice"
        title="Train your calculation"
        description="A fixed collection. A fresh challenge every day. Give your chess one focused hour."
        actions={
          <span className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            {connection.username} · {connection.platform === "lichess" ? "Lichess" : "Chess.com"}
          </span>
        }
      />

      {stage === "calibration-ready" ? (
        <div className="surface-card mx-auto max-w-3xl p-6 sm:p-10">
          <div className="icon-tile mb-5">
            <Target className="h-5 w-5" />
          </div>
          <h2 className="text-2xl font-semibold">Let’s find your starting point</h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
            Solve five short puzzles to help us choose your collection. Playing ratings and puzzle
            ratings use different scales, so we’ll start with your calculation instead.
          </p>
          <div className="my-6 grid gap-3 sm:grid-cols-3">
            {[
              ["500", "At your level"],
              ["300", "A little harder (+100)"],
              ["200", "A stretch (+200)"],
            ].map(([count, label]) => (
              <div key={count} className="rounded-xl bg-secondary/60 p-4">
                <p className="text-2xl font-semibold">{count}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <p className="mb-6 text-sm text-muted-foreground">
            Then we’ll mix all 1,000 puzzles together and bring back your mistakes for extra
            practice. Your collection and progress stay saved in this browser.
          </p>
          {error && (
            <p role="alert" className="mb-4 text-sm text-loss">
              {error}
            </p>
          )}
          <Button size="lg" disabled={busy} onClick={() => void startCalibration()}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Find my level
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            An established Lichess puzzle rating is used automatically when available.
          </p>
        </div>
      ) : (
        <>
          {ratingNotice && (
            <p
              role="status"
              className="mb-4 rounded-lg border bg-card p-3 text-sm text-muted-foreground"
            >
              {ratingNotice}
            </p>
          )}
          {(storageError || clock.error) && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-loss/30 bg-loss/5 p-4 text-sm text-loss"
            >
              {storageError || clock.error} Training is paused to protect your progress.{" "}
              <button className="underline" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          )}
          {clock.goalReached && (
            <div
              role="status"
              className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-accent/10 p-4"
            >
              <Trophy className="h-6 w-6 text-accent" />
              <div className="flex-1">
                <p className="font-semibold">One hour invested. Daily goal reached!</p>
                <p className="text-sm text-muted-foreground">
                  Keep going if you feel focused, or pause and come back tomorrow.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={clock.dismissGoal}>
                Keep training
              </Button>
            </div>
          )}
          <div
            className="surface-card sticky top-[68px] z-20 mb-4 flex items-center gap-3 px-4 py-3 shadow-sm sm:top-20 xl:hidden"
            aria-label="Daily focus timer"
          >
            <Clock className="h-4 w-4 shrink-0 text-accent" />
            <span className="shrink-0 font-mono text-lg font-semibold tabular-nums">
              {timeText}
              <span className="text-xs font-normal text-muted-foreground"> / 60:00</span>
            </span>
            <Progress
              value={Math.min(100, (activeMs / DAILY_GOAL_MS) * 100)}
              aria-label="Daily focus progress"
              className="min-w-8 flex-1"
            />
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {activeMs >= DAILY_GOAL_MS ? "Goal reached" : running ? "Training" : "Paused"}
            </span>
          </div>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(290px,1fr)]">
            <section className="surface-card min-w-0 p-4 sm:p-6" aria-label="Puzzle board">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="section-kicker">
                    {stage === "calibrating"
                      ? `Calibration · ${(calibration?.completed ?? 0) + 1} of ${CALIBRATION_LENGTH}`
                      : `Cycle ${state?.cycle} · Mixed tactics`}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {state?.active.kind === "review"
                      ? "Make the pattern stick"
                      : "Your next challenge"}
                  </h2>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !!storageError || !!clock.error}
                  onClick={() => setRunning((value) => !value)}
                >
                  {running ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                  {running ? "Pause" : state?.attemptCount ? "Resume training" : "Start training"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={clock.resetting || !!clock.error || !lock.locked}
                  onClick={() => void clock.reset()}
                  title="Reset today's timer. Puzzle progress and results are kept."
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {clock.resetting ? "Resetting…" : "Reset timer"}
                </Button>
              </div>
              {error && (
                <p role="alert" className="mb-3 text-sm text-loss">
                  {error} Use Next puzzle to retry.
                </p>
              )}
              {stage === "calibrating" && calibration ? (
                <PuzzlePlayer
                  key={calibration.puzzle.id}
                  puzzle={calibration.puzzle}
                  active={calibration.active}
                  enabled={canTrain}
                  onChange={(active, status) => {
                    setCalibration((value) => (value ? { ...value, active } : value));
                    if (status === "complete" && !active.failed) void finishCalibration(active);
                  }}
                  onFinish={(active) => void finishCalibration(active)}
                />
              ) : state && currentPuzzle ? (
                <PuzzlePlayer
                  key={`${currentPuzzle.id}:${state.attemptCount}`}
                  puzzle={currentPuzzle}
                  active={state.active}
                  enabled={canTrain}
                  onChange={(active, status) => {
                    const current = stateRef.current;
                    if (!current || active.puzzleId !== current.active.puzzleId || storageError)
                      return;
                    if (status === "complete" && !active.failed) finishPuzzle(active);
                    else persist({ ...current, active, updatedAt: Date.now() });
                  }}
                  onFinish={finishPuzzle}
                />
              ) : null}
              {busy && (
                <p
                  role="status"
                  className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing the next puzzle…
                </p>
              )}
              <p aria-live="polite" className="mt-4 min-h-4 text-xs text-accent">
                {lastResult}
              </p>
            </section>

            <aside className="space-y-4">
              <section
                className="hidden rounded-xl bg-[#173f34] p-6 text-white xl:block"
                aria-label="Daily training goal"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4" />
                    Today’s focus
                  </span>
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px]">
                    {running ? "In progress" : "Paused"}
                  </span>
                </div>
                <div className="mt-5 flex items-baseline gap-2">
                  <span
                    className="font-mono text-5xl font-medium tracking-tight"
                    aria-label={`${minutes} minutes ${seconds} seconds trained today`}
                  >
                    {timeText}
                  </span>
                  <span className="text-sm text-white/60">/ 60:00</span>
                </div>
                <Progress
                  value={Math.min(100, (activeMs / DAILY_GOAL_MS) * 100)}
                  aria-label="Daily goal progress"
                  className="mt-5 h-2 bg-white/15 [&>div]:bg-[#a6dbc2]"
                />
                <p className="mt-3 flex items-center gap-1.5 text-xs text-white/75">
                  {activeMs >= DAILY_GOAL_MS ? (
                    <>
                      <CircleCheck className="h-4 w-4" />
                      Daily goal reached. Every extra minute counts.
                    </>
                  ) : (
                    "The timer pauses when you hide this tab or pause training."
                  )}
                </p>
              </section>

              <section className="surface-card p-5">
                <h2 className="mb-4 flex items-center gap-2 font-semibold">
                  <Flame className="h-4 w-4 text-accent" />
                  Today’s practice
                </h2>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    [today?.attempts ?? 0, "Attempts", ""],
                    [today?.correct ?? 0, "Correct", "text-win"],
                    [today?.failed ?? 0, "To revisit", "text-loss"],
                  ].map(([value, label, color]) => (
                    <div key={label}>
                      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  Correct means the full solution without mistakes or hints. Repeat attempts count
                  here, separately from collection progress.
                </p>
              </section>

              {state && (
                <section className="surface-card p-5">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-accent" />
                    <h2 className="font-semibold">Your collection</h2>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between">
                    <span className="text-3xl font-semibold tabular-nums">
                      {completed}
                      <span className="text-base font-normal text-muted-foreground">
                        {" "}
                        / {COLLECTION_SIZE.toLocaleString()}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">unique completed</span>
                  </div>
                  <Progress
                    className="mt-3"
                    value={completed / 10}
                    aria-label="Collection completion"
                  />
                  <dl className="mt-5 space-y-3 text-sm">
                    <Metric
                      label="First-attempt accuracy"
                      value={completed ? `${Math.round((firstCorrect / completed) * 100)}%` : "—"}
                    />
                    <Metric label="Patterns to practice" value={needsPractice} />
                    <Metric label="Current cycle" value={state.cycle} />
                  </dl>
                  <div className="mt-5 border-t pt-4">
                    <p className="text-xs font-medium">
                      {
                        trainingLevel(state.latestRating?.rating ?? state.collection.baseRating)
                          .label
                      }{" "}
                      training
                    </p>
                    <dl className="mt-3 space-y-2 text-xs">
                      <Metric
                        label="Lichess puzzle rating"
                        value={
                          state.latestRating?.rating ??
                          state.collection.ratingBaseline?.rating ??
                          "Calibration"
                        }
                      />
                    </dl>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Puzzle rating sets difficulty. Game rating gains unlock a new drill.
                    </p>
                    {state.collection.playingBaseline ? (
                      <>
                        <dl className="mt-3 space-y-2 text-xs">
                          <Metric
                            label={`Lichess ${state.collection.playingBaseline.mode} rating`}
                            value={
                              state.latestPlayingRating?.rating ??
                              state.collection.playingBaseline.rating
                            }
                          />
                          <Metric
                            label="Game rating baseline"
                            value={state.collection.playingBaseline.rating}
                          />
                          <Metric
                            label={`Next drill at (${state.collection.playingBaseline.mode})`}
                            value={state.collection.playingBaseline.rating + TRAINING_GAIN}
                          />
                        </dl>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          Your drill stays fixed until a {TRAINING_GAIN}-point gain in Lichess{" "}
                          {state.collection.playingBaseline.mode} games. Updates start after the
                          current puzzle.
                        </p>
                        {state.latestPlayingRating && (
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            Game rating verified{" "}
                            {new Date(state.latestPlayingRating.checkedAt).toLocaleString()}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Automatic drill updates require an established Lichess rapid game rating.
                        Your existing puzzles stay saved while that rating is unavailable.
                      </p>
                    )}
                    {connection.platform === "lichess" && (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        onClick={() => void checkRatings()}
                        disabled={checkingRating || busy || !!storageError}
                      >
                        {checkingRating ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="mr-2 h-3 w-3" />
                        )}
                        Check ratings
                      </Button>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      Puzzle bands: nearest 100 within the 400–3,000 catalog.
                    </p>
                    <div className="mt-3 flex h-2 overflow-hidden rounded-full" aria-hidden="true">
                      <span className="w-1/2 bg-accent" />
                      <span className="w-[30%] bg-accent/60" />
                      <span className="w-1/5 bg-accent/30" />
                    </div>
                    <div className="mt-2 flex justify-between gap-2 text-[10px] text-muted-foreground">
                      {state.collection.bands.map((band) => (
                        <span key={band.rating}>
                          {band.count} × ~{band.rating}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              <section className="surface-card p-5">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Repeat2 className="h-4 w-4 text-accent" />
                  Practice that remembers
                </h2>
                <p className="mt-3 text-xs leading-6 text-muted-foreground">
                  Missed puzzles return after other puzzles and in later sessions. Solve them
                  consistently to space out the reviews. Every cycle reshuffles your same
                  collection, with themes hidden while you calculate.
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-accent">
                  <Check className="h-3.5 w-3.5" />
                  {saved ? "Progress saved on this device" : "Saving progress…"}
                </p>
              </section>
              {!!state?.history.length && (
                <section className="surface-card p-5">
                  <h2 className="mb-3 font-semibold">Completed cycles</h2>
                  <div className="space-y-3">
                    {state.history
                      .slice(-5)
                      .reverse()
                      .map((cycle) => (
                        <div key={cycle.cycle} className="flex justify-between text-xs">
                          <span>Cycle {cycle.cycle}</span>
                          <span className="text-muted-foreground">
                            {cycle.attempts} attempts ·{" "}
                            {Math.round((cycle.correct / cycle.attempts) * 100)}% correct
                          </span>
                        </div>
                      ))}
                  </div>
                </section>
              )}
              {archives.length > 0 && (
                <section className="surface-card p-5">
                  <h2 className="font-semibold">Previous drills</h2>
                  <div className="mt-3 space-y-3">
                    {archives.slice(0, 5).map((previous) => (
                      <div key={previous.collection.id} className="text-xs">
                        <p className="font-medium">
                          {previous.collection.playingBaseline
                            ? `${previous.collection.playingBaseline.mode} baseline ${previous.collection.playingBaseline.rating}`
                            : `Puzzle band ${previous.collection.baseRating}`}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {previous.completedIds.length} unique completed · {previous.correctCount}{" "}
                          correct of {previous.attemptCount} attempts
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </div>
        </>
      )}
      <p className="mt-7 text-center text-xs text-muted-foreground">
        Puzzles from the{" "}
        <a
          className="underline underline-offset-4"
          href="https://database.lichess.org/#puzzles"
          target="_blank"
          rel="noreferrer"
        >
          Lichess open database
        </a>{" "}
        · CC0 · Free to learn, free to improve.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
function Loading({ message }: { message: string }) {
  return (
    <div className="app-page">
      <div
        role="status"
        className="surface-card flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <Loader2 className="h-7 w-7 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
function ErrorCard({ message }: { message: string }) {
  return (
    <div className="surface-card p-8" role="alert">
      <h2 className="text-xl font-semibold">Training needs a moment</h2>
      <p className="my-4 text-sm text-muted-foreground">{message}</p>
      <Button onClick={() => window.location.reload()}>Reload training</Button>
    </div>
  );
}
