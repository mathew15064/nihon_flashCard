import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleReview, LADDER_MINUTES, WRONG_DELAY_MINUTES } from "../src/modules/learning/scheduler";

test("SRS matches the six-step v1 schedule and never stops reviewing mastered cards", () => {
  const date = new Date("2026-11-11T12:00:00.000Z");
  let state = { streak:0, timesReviewed:0, correctCount:0, wrongCount:0 };
  for (let i = 0; i < LADDER_MINUTES.length; i++) {
    const next = scheduleReview(state, "correct", date);
    assert.equal(next.streak, i + 1);
    assert.equal(next.timesReviewed, i + 1);
    assert.equal(next.correctCount, i + 1);
    assert.equal(next.wrongCount, 0);
    assert.equal(next.status, i === 5 ? "mastered" : i === 0 ? "learning" : "review");
    assert.equal(next.nextReviewAt, new Date(date.getTime()+LADDER_MINUTES[i]*60000).toISOString());
    state=next;
  }
  const more = scheduleReview(state, "correct", date);
  assert.equal(more.streak, 7);
  assert.equal(more.status, "mastered");
  assert.equal(more.nextReviewAt, new Date(date.getTime()+43200*60000).toISOString());
});
test("Wrong answer resets the streak and correct answer restarts at ten minutes", () => {
  const date=new Date("2026-11-11T12:00:00.000Z");
  const wrong=scheduleReview({streak:5,timesReviewed:7,correctCount:5,wrongCount:2}, "wrong", date);
  assert.equal(wrong.streak,0);
  assert.equal(wrong.status,"learning");
  assert.equal(wrong.wrongCount,3);
  assert.equal(wrong.nextReviewAt,new Date(date.getTime()+WRONG_DELAY_MINUTES*60000).toISOString());
  const again=scheduleReview(wrong, "correct", date);
  assert.equal(again.streak,1);
  assert.equal(again.timesReviewed,9);
  assert.equal(again.nextReviewAt,new Date(date.getTime()+600000).toISOString());
});
