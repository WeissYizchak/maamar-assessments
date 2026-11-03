import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STORAGE_KEY, progressKey, validateBank, validateProgress, emptyProgress, newRun, score, summarize, MAX_ATTEMPTS } from '../core.js';

const bank = JSON.parse(await readFile(new URL('../questions.json', import.meta.url), 'utf8'));

function answer(q, overrides = {}) {
  return { questionId: q.id, option: q.correctOption, evidence: q.correctEvidence, written: '', precision: null, ...overrides };
}
function completed() {
  const run = newRun(bank);
  run.answers = bank.questions.map(q => answer(q));
  run.completedAt = new Date().toISOString();
  return run;
}

test('bank has reviewed structure, unique ids, valid answer keys and precise locators', () => {
  assert.equal(validateBank(bank), bank);
  assert.equal(bank.reviewStatus, 'draft');
  assert.equal(bank.questions.length, 4);
  assert.equal(bank.revision, 2);
  assert.ok(bank.questions.every(q => q.anchor && q.model && q.reasoning && q.boundary && q.answerSteps.length >= 2 && q.rubric.length === 2));
});

test('conclusion and evidence are scored independently; no invented precision score', () => {
  const q = bank.questions[0];
  assert.deepEqual(score(q, answer(q)), { conclusion: 1, evidence: 1, precision: null });
  const wrongEvidence = q.evidence.find(e => e.id !== q.correctEvidence).id;
  const wrongOption = q.options.find(o => o.id !== q.correctOption).id;
  assert.deepEqual(score(q, answer(q, { evidence: wrongEvidence, written: 'הסבר', precision: 1 })), { conclusion: 1, evidence: 0, precision: 1 });
  assert.deepEqual(score(q, answer(q, { option: wrongOption })), { conclusion: 0, evidence: 1, precision: null });
});

test('backup round trip preserves completed and active runs and written explanations', () => {
  const data = emptyProgress();
  data.attempts.push(completed());
  data.active = newRun(bank, [bank.questions[0].id]);
  data.active.answers.push(answer(bank.questions[0], { written: '<script>alert(1)</script>', precision: 2 }));
  assert.deepEqual(validateProgress(JSON.parse(JSON.stringify(data)), bank), data);
});

test('retries include either automatic error and low self rating, not missing self rating', () => {
  const run = completed();
  run.answers[0].evidence = bank.questions[0].evidence.find(e => e.id !== bank.questions[0].correctEvidence).id;
  run.answers[1].written = 'הסבר';
  run.answers[1].precision = 1;
  const result = summarize(run, bank);
  assert.equal(result.conclusion, 4);
  assert.equal(result.evidence, 3);
  assert.equal(result.selfRated, 1);
  assert.equal(result.precision, 1);
  assert.deepEqual(result.revisit, [bank.questions[0].id, bank.questions[1].id]);
});

test('invalid and incompatible backups are rejected rather than silently reset', () => {
  for (const mutate of [
    data => { data.version = 9; },
    data => { data.attempts[0].revision++; },
    data => { data.attempts[0].answers[0].option = 'unknown'; },
    data => { data.attempts[0].answers[0].evidence = 'unknown'; },
    data => { data.attempts[0].answers[0].precision = 2; },
    data => { data.attempts[0].answers[0].written = 'x'.repeat(5001); },
    data => { data.attempts[0].questionIds[1] = data.attempts[0].questionIds[0]; },
    data => { data.attempts[0].answers.reverse(); },
    data => { data.attempts[0].answers.pop(); },
    data => { data.attempts.push(data.attempts[0]); },
    data => { data.active = {}; },
    data => { data.attempts = Array(MAX_ATTEMPTS + 1).fill(data.attempts[0]); }
  ]) {
    const data = { ...emptyProgress(), attempts: [completed()] };
    mutate(data);
    assert.throws(() => validateProgress(data, bank));
  }
});

test('answer-key and identifier mistakes fail bank validation', () => {
  const copy = structuredClone(bank);
  copy.questions[0].correctEvidence = 'missing';
  assert.throws(() => validateBank(copy));
  copy.questions[0].correctEvidence = bank.questions[0].correctEvidence;
  copy.questions[1].id = copy.questions[0].id;
  assert.throws(() => validateBank(copy));
});

test('new content revisions use isolated storage while legacy progress remains addressable', () => {
  const oldKey = progressKey({ ...bank, revision: 1 });
  assert.equal(oldKey, STORAGE_KEY);
  assert.notEqual(progressKey(bank), oldKey);
  assert.notEqual(progressKey(bank), progressKey({ ...bank, revision: 3 }));
  const stored = new Map([[oldKey, 'previous attempts']]);
  stored.set(progressKey(bank), JSON.stringify(emptyProgress()));
  assert.equal(stored.get(oldKey), 'previous attempts');
  assert.deepEqual(JSON.parse(stored.get(progressKey(bank))), emptyProgress());
  const oldRun = completed();
  oldRun.revision = 1;
  assert.throws(() => validateProgress({ ...emptyProgress(), attempts: [oldRun] }, bank));
});

test('full explanations, reasoning demands and precision boundaries cannot be omitted', () => {
  for (const [field, invalid] of [['answerSteps', []], ['reasoning', ''], ['boundary', '']]) {
    const copy = structuredClone(bank);
    copy.questions[0][field] = invalid;
    assert.throws(() => validateBank(copy));
  }
});
