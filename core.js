export const STORAGE_KEY = 'diyuk-progress-v1';
export const MAX_ATTEMPTS = 30;

export function progressKey(bank) {
  return bank.revision === 1 ? STORAGE_KEY : `${STORAGE_KEY}:${bank.id}:r${bank.revision}`;
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateBank(bank) {
  check(bank && typeof bank.id === 'string' && Number.isInteger(bank.revision), 'מזהה או גרסת המבדק אינם תקינים.');
  check(typeof bank.title === 'string' && typeof bank.author === 'string', 'חסר שם מאמר או מחבר.');
  check(bank.source && typeof bank.source.note === 'string', 'חסרה הבהרת מקור.');
  check(typeof bank.source.url === 'string' && new URL(bank.source.url).protocol === 'https:', 'קישור המקור חייב להיות כתובת HTTPS.');
  check(['draft', 'approved'].includes(bank.reviewStatus), 'חסר סטטוס בדיקת תוכן.');
  check(Array.isArray(bank.questions) && bank.questions.length > 0, 'המבדק ריק.');
  const ids = new Set();
  for (const q of bank.questions) {
    check(typeof q.id === 'string' && !ids.has(q.id), 'מזהה שאלה כפול או חסר.');
    ids.add(q.id);
    for (const field of ['title', 'prompt', 'anchor', 'skill', 'process', 'model', 'reasoning', 'boundary']) {
      check(typeof q[field] === 'string' && q[field].length > 0, `חסר שדה ${field}.`);
    }
    for (const [field, key] of [['options', 'correctOption'], ['evidence', 'correctEvidence']]) {
      check(Array.isArray(q[field]) && q[field].length >= 2, 'חסרות אפשרויות.');
      const optionIds = new Set();
      for (const option of q[field]) {
        check(typeof option.id === 'string' && !optionIds.has(option.id), 'מזהה אפשרות כפול או חסר.');
        optionIds.add(option.id);
        check(typeof option.text === 'string' && typeof option.rationale === 'string', 'חסר הסבר לאפשרות.');
      }
      check(optionIds.has(q[key]), 'המפתח מפנה לאפשרות שאינה קיימת.');
    }
    check(Array.isArray(q.rubric) && q.rubric.length === 2 && q.rubric.every(x => typeof x === 'string'), 'מחוון הדיוק אינו תקין.');
    check(Array.isArray(q.answerSteps) && q.answerSteps.length >= 2 && q.answerSteps.every(x => typeof x === 'string' && x.length > 0), 'חסרים שלבי ביאור.');
  }
  return bank;
}

export function score(q, answer) {
  return {
    conclusion: Number(answer.option === q.correctOption),
    evidence: Number(answer.evidence === q.correctEvidence),
    precision: answer.precision
  };
}

export function emptyProgress() {
  return { version: 1, attempts: [], active: null };
}

export function newRun(bank, ids = bank.questions.map(q => q.id)) {
  return {
    bankId: bank.id,
    revision: bank.revision,
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    questionIds: [...ids],
    answers: []
  };
}

function cleanAnswer(answer, bank) {
  check(answer && typeof answer === 'object', 'תשובה לא תקינה בגיבוי.');
  const q = bank.questions.find(item => item.id === answer.questionId);
  check(q, 'הגיבוי כולל שאלה שאינה במבדק.');
  check(q.options.some(o => o.id === answer.option), 'ביאור לא תקין בגיבוי.');
  check(q.evidence.some(o => o.id === answer.evidence), 'ראיה לא תקינה בגיבוי.');
  check(typeof answer.written === 'string' && answer.written.length <= 5000, 'הסבר לא תקין בגיבוי.');
  check(answer.precision === null || [0, 1, 2].includes(answer.precision), 'הערכה עצמית לא תקינה בגיבוי.');
  check(answer.written.trim().length > 0 || answer.precision === null, 'הערכה עצמית מחייבת הסבר כתוב.');
  return { questionId: q.id, option: answer.option, evidence: answer.evidence, written: answer.written, precision: answer.precision };
}

function cleanRun(run, bank, completed) {
  check(run && run.bankId === bank.id && run.revision === bank.revision, 'הגיבוי שייך למבדק או לגרסת תוכן אחרים.');
  check(typeof run.id === 'string' && run.id.length > 0 && run.id.length <= 100, 'מזהה ניסיון לא תקין.');
  check(typeof run.startedAt === 'string' && Number.isFinite(Date.parse(run.startedAt)), 'תאריך לא תקין בגיבוי.');
  check(Array.isArray(run.questionIds) && run.questionIds.length > 0 && run.questionIds.length <= bank.questions.length, 'רשימת שאלות לא תקינה.');
  check(new Set(run.questionIds).size === run.questionIds.length && run.questionIds.every(id => bank.questions.some(q => q.id === id)), 'שאלות כפולות או לא מוכרות בגיבוי.');
  check(Array.isArray(run.answers) && run.answers.length <= run.questionIds.length, 'מספר תשובות לא תקין.');
  const answers = run.answers.map(a => cleanAnswer(a, bank));
  check(answers.every((a, i) => a.questionId === run.questionIds[i]), 'סדר התשובות בגיבוי אינו תקין.');
  if (completed) check(answers.length === run.questionIds.length, 'ניסיון שהושלם חסר תשובות.');
  const result = { bankId: bank.id, revision: bank.revision, id: run.id, startedAt: run.startedAt, questionIds: [...run.questionIds], answers };
  if (completed) {
    check(typeof run.completedAt === 'string' && Number.isFinite(Date.parse(run.completedAt)), 'חסר תאריך סיום תקין.');
    result.completedAt = run.completedAt;
  }
  return result;
}

export function validateProgress(data, bank) {
  check(data && data.version === 1 && Array.isArray(data.attempts), 'פורמט הגיבוי אינו נתמך.');
  check(data.attempts.length <= MAX_ATTEMPTS, 'הגיבוי מכיל יותר מדי ניסיונות.');
  const attempts = data.attempts.map(run => cleanRun(run, bank, true));
  const active = data.active === null ? null : cleanRun(data.active, bank, false);
  const ids = attempts.map(run => run.id);
  if (active) ids.push(active.id);
  check(new Set(ids).size === ids.length, 'מזהי ניסיונות כפולים בגיבוי.');
  return { version: 1, attempts, active };
}

export function summarize(run, bank) {
  let conclusion = 0;
  let evidence = 0;
  let precision = 0;
  let selfRated = 0;
  const revisit = [];
  for (const answer of run.answers) {
    const q = bank.questions.find(q => q.id === answer.questionId);
    const result = score(q, answer);
    conclusion += result.conclusion;
    evidence += result.evidence;
    if (result.precision !== null) {
      precision += result.precision;
      selfRated++;
    }
    if (!result.conclusion || !result.evidence || (result.precision !== null && result.precision < 2)) revisit.push(q.id);
  }
  return { conclusion, evidence, precision, selfRated, total: run.answers.length, revisit };
}
