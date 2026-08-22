'use strict';

const crypto = require('crypto');

const userRepository = require('../repositories/user.repository');
const contentRepository = require('../repositories/content.repository');
const learningService = require('./learning.service');
const { ALL_CONTENT_TYPES } = require('../constants/content-types');
const { generateQuestions, typesFor } = require('../utils/quiz-generator');

const QUESTION_TYPES = ['jp-to-meaning', 'meaning-to-jp', 'jp-to-reading', 'reading-to-jp', 'random'];

// In-memory quiz sessions (intentionally not persisted; see ARCHITECTURE.md)
const sessions = new Map();

function fail(status, code, message) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  throw err;
}

function publicQuestion(q) {
  const { questionId, contentType, questionType, prompt, options } = q;
  return { questionId, contentType, questionType, prompt, options };
}

function assertUser(userId) {
  const user = userRepository.findById(userId);
  if (!user) fail(404, 'USER_NOT_FOUND', 'User not found');
  if (user.status !== 'active') fail(409, 'USER_INACTIVE', 'User is inactive');
  return user;
}

function createSession({ userId, contentType, questionType, count }) {
  assertUser(userId);

  if (!ALL_CONTENT_TYPES.includes(contentType) && contentType !== 'mixed') {
    fail(400, 'INVALID_CONTENT_TYPE', `contentType must be one of: ${[...ALL_CONTENT_TYPES, 'mixed'].join(', ')}`);
  }
  if (!QUESTION_TYPES.includes(questionType)) {
    fail(400, 'INVALID_QUESTION_TYPE', `questionType must be one of: ${QUESTION_TYPES.join(', ')}`);
  }

  const numCount = Number(count);
  if (![5, 10, 20].includes(numCount)) {
    fail(400, 'VALIDATION_ERROR', 'count must be 5, 10 or 20');
  }

  // source pools per real content type
  const selected =
    contentType === 'mixed'
      ? ALL_CONTENT_TYPES
      : [contentType];

  const sourcePools = {};
  let totalItems = 0;
  for (const type of selected) {
    const items = contentRepository.getAll(type);
    totalItems += items.length;
    if (items.length >= 3) sourcePools[type] = items;
  }

  if (Object.keys(sourcePools).length === 0 || totalItems < 4) {
    fail(409, 'INSUFFICIENT_CONTENT', 'Not enough content available for this quiz configuration');
  }

  // For single-type quizzes the requested type must be valid for it.
  if (contentType !== 'mixed' && questionType !== 'random') {
    if (!typesFor(contentType).includes(questionType)) {
      fail(400, 'INVALID_QUESTION_TYPE',
        `${questionType} is not supported for ${contentType}; valid: ${typesFor(contentType).join(', ')}`);
    }
  }

  const generated = generateQuestions({ questionType, sourcePools });
  const questions = generated.slice(0, numCount);
  if (!questions.length) {
    fail(409, 'INSUFFICIENT_CONTENT', 'Could not generate any questions from the available content');
  }

  const sessionId = 'quiz_' + crypto.randomBytes(8).toString('hex');
  sessions.set(sessionId, {
    sessionId,
    userId,
    createdAt: new Date().toISOString(),
    questions,
    results: {}
  });

  return {
    sessionId,
    totalQuestions: questions.length,
    generatedFor: numCount > questions.length ? questions.length : numCount,
    questions: questions.map(publicQuestion)
  };
}

function getSession(sessionId, userId) {
  const session = sessions.get(sessionId);
  if (!session) fail(404, 'SESSION_NOT_FOUND', 'Quiz session not found or expired');
  assertUser(userId);
  if (session.userId !== userId) fail(403, 'SESSION_FORBIDDEN', 'Session belongs to another user');
  return session;
}

function submitAnswer(sessionId, userId, { questionId, optionId }) {
  const session = getSession(sessionId, userId);

  const question = session.questions.find((q) => q.questionId === questionId);
  if (!question) fail(404, 'QUESTION_NOT_FOUND', 'Question not in this session');

  if (session.results[questionId]) {
    fail(409, 'ALREADY_ANSWERED', 'Question has already been answered');
  }

  if (!question.options.some((o) => o.id === optionId)) {
    fail(400, 'VALIDATION_ERROR', 'optionId must be one of: ' + question.options.map((o) => o.id).join(', '));
  }

  const correct = question._correctOptionId === optionId;
  session.results[questionId] = {
    questionId,
    correct,
    chosenOptionId: optionId,
    correctOptionId: question._correctOptionId,
    prompt: question.prompt,
    options: question.options,
    questionType: question.questionType,
    contentType: question.contentType,
    cardRef: question.contentRef
  };

  // Learning integration — reuse existing progress/scheduling/history pipeline.
  try {
    learningService.recordReview(userId, {
      contentType: question.contentType,
      contentId: question.contentRef,
      result: correct ? 'correct' : 'wrong'
    });
  } catch (err) {
    // Answer still counts for the quiz; progress recording issues must not break it.
    console.error('quiz: failed to record review:', err.message);
  }

  const answeredCount = Object.keys(session.results).length;

  return {
    correct,
    correctOptionId: question._correctOptionId,
    explanation: explanation(question),
    progress: { current: answeredCount, total: session.questions.length },
    sessionComplete: answeredCount === session.questions.length
  };
}

function explanation(question) {
  const correctText = question.options.find((o) => o.id === question._correctOptionId).text;
  const labels = {
    'jp-to-meaning': 'meaning',
    'meaning-to-jp': 'Japanese',
    'jp-to-reading': 'reading',
    'reading-to-jp': 'kanji/word'
  };
  return `${labels[question.questionType]} of ${question.prompt} is ${correctText}`;
}

function getResult(sessionId, userId) {
  const session = getSession(sessionId, userId);
  const results = session.questions.map((q) => session.results[q.questionId]).filter(Boolean);

  if (results.length < session.questions.length) {
    fail(409, 'QUIZ_INCOMPLETE', `Quiz not finished (${results.length}/${session.questions.length} answered)`);
  }

  const total = results.length;
  const correctCount = results.filter((r) => r.correct).length;

  return {
    sessionId,
    total,
    correct: correctCount,
    wrong: total - correctCount,
    score: Math.round((correctCount / total) * 100),
    questions: results.map((r) => ({
      questionId: r.questionId,
      prompt: r.prompt,
      questionType: r.questionType,
      contentType: r.contentType,
      chosenOptionId: r.chosenOptionId,
      correctOptionId: r.correctOptionId,
      correct: r.correct
    }))
  };
}

module.exports = { createSession, submitAnswer, getResult };
