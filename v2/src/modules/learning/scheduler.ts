/** Nihon v1-compatible interval ladder. Pure logic with no database or clock dependencies. */
export const LADDER_MINUTES = [10, 1440, 4320, 10080, 20160, 43200] as const;
export const WRONG_DELAY_MINUTES = 10;

export type ReviewResult = "correct" | "wrong";
export type ReviewStatus = "new" | "learning" | "review" | "mastered";

export type ScheduleState = {
  streak: number;
  timesReviewed: number;
  correctCount: number;
  wrongCount: number;
};

export type ScheduleOutcome = ScheduleState & {
  status: ReviewStatus;
  lastReviewedAt: string;
  nextReviewAt: string;
};

/** A wrong answer restarts the ladder. Mastered cards still repeat after 30 days. */
export function scheduleReview(
  previous: ScheduleState,
  result: ReviewResult,
  now: Date
): ScheduleOutcome {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_REVIEW_DATE");
  const streak = result === "correct" ? previous.streak + 1 : 0;
  const step = Math.min(Math.max(streak - 1, 0), LADDER_MINUTES.length - 1);
  const delay = result === "correct" ? LADDER_MINUTES[step] : WRONG_DELAY_MINUTES;
  const status: ReviewStatus = result === "wrong" ? "learning"
    : step === LADDER_MINUTES.length - 1 ? "mastered"
      : streak >= 2 ? "review" : "learning";
  return {
    streak,
    timesReviewed: previous.timesReviewed + 1,
    correctCount: previous.correctCount + (result === "correct" ? 1 : 0),
    wrongCount: previous.wrongCount + (result === "wrong" ? 1 : 0),
    status,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: new Date(now.getTime() + delay * 60_000).toISOString(),
  };
}
