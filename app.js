import { STORAGE_KEY, MAX_ATTEMPTS, validateBank, validateProgress, emptyProgress, newRun, score, summarize } from './core.js';

const main = document.querySelector('#main');
const notice = document.querySelector('#notice');
const backupStatus = document.querySelector('#backup-status');
let bank;
let progress;
let storageProblem = false;
let rawStored = null;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, action, className = 'button') {
  const node = el('button', text, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function report(message, error) {
  notice.textContent = message;
  notice.hidden = false;
  if (error) console.error(message, error);
}

function save() {
  if (storageProblem) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch (error) {
    report('לא ניתן לשמור בדפדפן. אפשר להמשיך, אך יש לייצא גיבוי לפני יציאה; רענון עלול לאבד את ההתקדמות.', error);
    return false;
  }
}

function page() {
  main.replaceChildren();
  main.focus();
}

function sourceLink() {
  const link = el('a', 'פתיחת המאמר באתר המקור ↗', 'source-link');
  link.href = bank.source.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function draftNote() {
  if (bank.reviewStatus === 'draft') {
    return el('p', 'גרסת תוכן לבדיקה · השאלות, התשובות והמחוונים הם טיוטות שטרם אושרו.', 'draft-note');
  }
  return el('p', 'תוכן מאושר', 'draft-note');
}

function home() {
  page();
  const hero = el('section', undefined, 'hero');
  hero.append(el('p', 'מבדקים במאמרי חסידות', 'eyebrow'), el('h1', 'לא רק להבין.\nלדייק במה שכתוב.'), el('p', 'ביאור יכול להיות נכון — ועדיין לא להיות הביאור של המאמר הזה. כאן בוחנים את ההבנה מול המילים, ההקשר והמהלך.', 'hero-description'));
  main.append(hero);
  const card = el('section', undefined, 'card maamar-card');
  card.append(el('p', 'המאמר הראשון', 'eyebrow'), el('h2', bank.title), el('p', bank.author, 'muted'), draftNote());
  const tags = el('div', undefined, 'tags');
  for (const text of [`${bank.questions.length} שאלות`, 'ניתוח והערכה', 'ביאור + ראיה', 'ללא הגבלת זמן']) tags.append(el('span', text, 'tag'));
  card.append(tags, el('p', 'בכל שאלה בוחרים ביאור וראיה, ורק אז נחשף המשוב. אפשר גם לנסח הסבר ולבדוק אותו בעצמך מול מחוון.'), el('p', bank.source.note, 'small muted'), sourceLink());
  const actions = el('div', undefined, 'actions');
  if (progress.active) {
    actions.append(button(`המשך ניסיון · ${progress.active.answers.length}/${progress.active.questionIds.length}`, resume));
    actions.append(button('התחלה מחדש', () => {
      if (confirm('להחליף את הניסיון הנוכחי בניסיון חדש? התשובות בניסיון הנוכחי יימחקו.')) start();
    }, 'button secondary'));
  } else {
    actions.append(button('מתחילים לדייק ←', () => start()));
  }
  card.append(actions);
  main.append(card);
  const steps = el('section', undefined, 'steps');
  for (const [number, title, text] of [
    ['01', 'בוחרים ביאור', 'מכריעים מה נאמן למאמר, לא רק מה נשמע נכון.'],
    ['02', 'מעגנים במילים', 'מזהים ראיה שבאמת מבססת את ההכרעה.'],
    ['03', 'מדייקים בהסבר', 'בודקים שלא הוספנו או הכללנו מעבר לכתוב.']
  ]) {
    const item = el('div');
    item.append(el('span', number, 'step-number'), el('h3', title), el('p', text, 'muted'));
    steps.append(item);
  }
  main.append(steps);
  const history = el('section', undefined, 'history');
  history.append(el('h2', 'הניסיונות שלך'));
  if (!progress.attempts.length) history.append(el('p', 'עוד אין ניסיונות שהושלמו. ההתקדמות תופיע כאן ותישאר בדפדפן הזה.', 'muted'));
  for (const attempt of [...progress.attempts].reverse()) {
    const result = summarize(attempt, bank);
    const row = el('div', undefined, 'history-row');
    const date = new Date(attempt.completedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
    row.append(el('span', `${date} · ${result.total} שאלות · ביאור ${result.conclusion}/${result.total} · ראיה ${result.evidence}/${result.total}`), button('לסיכום', () => results(attempt), 'text-button'));
    history.append(row);
  }
  main.append(history);
}

function start(ids) {
  progress.active = newRun(bank, ids);
  save();
  question();
}

function resume() {
  const run = progress.active;
  if (run.answers.length) feedback(run.answers.at(-1), run.answers.length - 1);
  else question();
}

function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function choiceGroup(legend, items, name) {
  const fieldset = el('fieldset');
  fieldset.append(el('legend', legend));
  for (const item of shuffled(items)) {
    const label = el('label', undefined, 'choice');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.value = item.id;
    input.required = true;
    label.append(input, el('span', item.text));
    fieldset.append(label);
  }
  return fieldset;
}

function question() {
  const run = progress.active;
  if (run.answers.length === run.questionIds.length) {
    finish();
    return;
  }
  page();
  const q = bank.questions.find(q => q.id === run.questionIds[run.answers.length]);
  const top = el('div', undefined, 'quiz-top');
  top.append(el('span', `${bank.title} · שאלה ${run.answers.length + 1} מתוך ${run.questionIds.length}`, 'eyebrow'), button('חזרה לבית', home, 'text-button'));
  const bar = el('progress');
  bar.max = run.questionIds.length;
  bar.value = run.answers.length;
  bar.setAttribute('aria-label', 'התקדמות במבדק');
  main.append(top, bar, draftNote());
  const card = el('section', undefined, 'card quiz-card');
  card.append(el('p', `${q.process} · ${q.skill}`, 'eyebrow'), el('h1', q.title), el('p', q.prompt, 'prompt'));
  const details = el('details');
  details.append(el('summary', 'היכן לעיין במאמר?'), el('p', q.anchor), sourceLink());
  card.append(details, el('p', 'התשובות נשמרות לאחר שליחת השאלה. בחירות וטקסט שטרם נשלחו לא יישמרו ביציאה.', 'small muted'));
  const form = el('form');
  const answers = choiceGroup('1. איזה ביאור מדויק כאן?', q.options, 'option');
  const evidence = choiceGroup('2. איזו ראיה מכריעה בין הביאורים?', q.evidence, 'evidence');
  evidence.hidden = true;
  const writing = el('div', undefined, 'writing');
  writing.hidden = true;
  const label = el('label', '3. הסבר במילים שלך — רשות', 'writing-label');
  label.htmlFor = 'written';
  const textarea = el('textarea');
  textarea.id = 'written';
  textarea.name = 'written';
  textarea.maxLength = 5000;
  textarea.rows = 4;
  textarea.placeholder = 'כיצד הראיה מבססת את הביאור? מה היא מאפשרת לומר, ומה לא?';
  writing.append(label, el('p', 'הטקסט אינו נבדק אוטומטית. לאחר השליחה אפשר להעריך אותו מול תשובה ומחוון.', 'small muted'), textarea);
  const next = button('בחרתי ביאור · ממשיכים לראיה ←', () => {
    if (!form.querySelector('input[name="option"]:checked')) {
      answers.querySelector('input').reportValidity();
      return;
    }
    for (const input of answers.querySelectorAll('input')) input.disabled = true;
    evidence.hidden = false;
    writing.hidden = false;
    next.hidden = true;
    submit.hidden = false;
    evidence.querySelector('input').focus();
  });
  const submit = el('button', 'בדיקת הביאור והראיה ←', 'button');
  submit.type = 'submit';
  submit.hidden = true;
  form.append(answers, evidence, writing, next, submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const option = form.querySelector('input[name="option"]:checked');
    const selectedEvidence = form.querySelector('input[name="evidence"]:checked');
    if (!option || !selectedEvidence) return;
    const answer = { questionId: q.id, option: option.value, evidence: selectedEvidence.value, written: textarea.value.trim(), precision: null };
    run.answers.push(answer);
    save();
    feedback(answer, run.answers.length - 1);
  });
  card.append(form);
  main.append(card);
}

function feedback(answer, index) {
  page();
  const run = progress.active;
  const q = bank.questions.find(q => q.id === answer.questionId);
  const scores = score(q, answer);
  const card = el('section', undefined, 'card quiz-card');
  card.append(el('p', `שאלה ${index + 1} · משוב מתוך המאמר`, 'eyebrow'), el('h1', q.title));
  for (const [title, field, selected, correct, earned] of [
    ['ביאור', 'options', answer.option, q.correctOption, scores.conclusion],
    ['ראיה', 'evidence', answer.evidence, q.correctEvidence, scores.evidence]
  ]) {
    const block = el('section', undefined, earned ? 'feedback correct' : 'feedback incorrect');
    block.append(el('h2', `${earned ? '✓' : '↺'} ${title}: ${earned ? 'מדויק' : 'כדאי לחזור ולדייק'}`), el('p', `בחרת: ${q[field].find(item => item.id === selected).text}`), el('p', q[field].find(item => item.id === selected).rationale));
    if (!earned) block.append(el('p', `האפשרות המתאימה: ${q[field].find(item => item.id === correct).text}`));
    card.append(block);
  }
  card.append(el('h2', 'הביאור המעוגן במאמר'), el('p', q.model), el('p', `מיקום: ${q.anchor}`, 'small muted'), sourceLink());
  if (answer.written) {
    card.append(el('h2', 'ההסבר שכתבת'), el('p', answer.written, 'written-answer'), el('h3', 'דיוק ההסבר · הערכה עצמית בלבד'), el('p', 'סמן רק קריטריונים שההסבר שלך כבר מילא לפני חשיפת התשובה. זו אינה בדיקה אוטומטית.', 'small muted'));
    const rubric = el('fieldset', undefined, 'rubric');
    rubric.append(el('legend', 'כמה מהקריטריונים ההסבר שלך מילא?'));
    q.rubric.forEach((text, i) => card.append(el('p', `${i + 1}. ${text}`)));
    ['אף קריטריון', 'קריטריון אחד', 'שני הקריטריונים'].forEach((text, i) => {
      const label = el('label', undefined, 'choice');
      const input = el('input');
      input.type = 'radio';
      input.name = 'precision';
      input.value = String(i);
      input.checked = answer.precision === i;
      label.append(input, el('span', text));
      rubric.append(label);
    });
    const rating = el('p', answer.precision === null ? 'טרם בוצעה הערכה עצמית.' : `הערכה עצמית: ${answer.precision}/2`, 'small');
    rubric.addEventListener('change', () => {
      answer.precision = Number(rubric.querySelector('input:checked').value);
      rating.textContent = `הערכה עצמית: ${answer.precision}/2`;
      save();
    });
    card.append(rubric, rating);
  } else {
    card.append(el('p', 'לא נכתב הסבר; דיוק ההסבר לא הוערך ואינו נספר כנכשל.', 'small muted'));
  }
  const actions = el('div', undefined, 'actions');
  actions.append(button(index + 1 === run.questionIds.length ? 'לסיכום המבדק ←' : 'לשאלה הבאה ←', question), button('חזרה לבית', home, 'button secondary'));
  card.append(actions);
  main.append(card);
}

function finish() {
  const completed = { ...progress.active, completedAt: new Date().toISOString() };
  progress.attempts.push(completed);
  progress.attempts = progress.attempts.slice(-MAX_ATTEMPTS);
  progress.active = null;
  save();
  results(completed);
}

function results(run) {
  page();
  const summary = summarize(run, bank);
  const card = el('section', undefined, 'card results-card');
  card.append(el('p', `${bank.title} · סיכום ניסיון`, 'eyebrow'), el('h1', 'הדיוק שלך, לפי מרכיבים.'), draftNote(), el('p', 'זהו סיכום הניסיון הזה, לא קביעה של שליטה במאמר. כדאי לחזור למקור גם אחרי תשובה נכונה.', 'muted'));
  const metrics = el('div', undefined, 'metrics');
  for (const [value, label, note] of [
    [`${summary.conclusion}/${summary.total}`, 'נכונות הביאור', 'נבדק אוטומטית'],
    [`${summary.evidence}/${summary.total}`, 'התאמת הראיה', 'נבדק אוטומטית'],
    [summary.selfRated ? `${summary.precision}/${summary.selfRated * 2}` : '—', 'דיוק ההסבר', `הערכה עצמית · ${summary.selfRated} מתוך ${summary.total} הסברים`]
  ]) {
    const metric = el('div', undefined, 'metric');
    metric.append(el('strong', value), el('h2', label), el('p', note, 'small muted'));
    metrics.append(metric);
  }
  card.append(metrics, el('h2', 'מה כדאי לחזור ולדייק?'));
  for (const answer of run.answers) {
    const q = bank.questions.find(q => q.id === answer.questionId);
    const result = score(q, answer);
    const row = el('div', undefined, 'result-row');
    const labels = [];
    if (!result.conclusion) labels.push('הביאור');
    if (!result.evidence) labels.push('הראיה');
    if (result.precision !== null && result.precision < 2) labels.push('ההסבר לפי הערכתך');
    row.append(el('h3', q.skill), el('p', labels.length ? `לחזרה: ${labels.join(' · ')}` : 'הביאור והראיה התאימו בניסיון הזה.'), el('p', result.precision === null ? 'דיוק ההסבר לא הוערך.' : `דיוק ההסבר לפי הערכתך: ${result.precision}/2`, 'small muted'));
    const details = el('details');
    details.append(el('summary', 'עיון במשוב ובמקור'), el('p', q.model), el('p', q.anchor, 'small muted'));
    if (answer.written) details.append(el('p', `ההסבר שלך: ${answer.written}`, 'written-answer'));
    details.append(sourceLink());
    row.append(details);
    card.append(row);
  }
  const actions = el('div', undefined, 'actions');
  function begin(ids) {
    if (!progress.active || confirm('להחליף את הניסיון שעדיין פתוח?')) start(ids);
  }
  if (summary.revisit.length) actions.append(button(`מבדק חוזר · ${summary.revisit.length} שאלות לחזרה`, () => begin(summary.revisit)));
  actions.append(button('מבדק מלא חדש', () => begin(), 'button secondary'), button('חזרה לבית', home, 'text-button'));
  card.append(actions);
  main.append(card);
}

function download(data, filename) {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelector('#export').addEventListener('click', () => {
  if (!progress) return;
  download(JSON.stringify(progress, null, 2), `diyuk-backup-${new Date().toISOString().slice(0, 10)}.json`);
  backupStatus.textContent = 'הגיבוי יוצא לקובץ. הוא כולל גם הסברים שכתבת; שמור אותו במקום פרטי.';
});
document.querySelector('#import').addEventListener('click', () => {
  if (bank) document.querySelector('#backup-file').click();
});
document.querySelector('#backup-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('הקובץ גדול מדי; הגודל המרבי הוא 2MB.');
    const imported = validateProgress(JSON.parse(await file.text()), bank);
    if (!confirm('הייבוא יחליף את כל ההתקדמות השמורה בדפדפן הזה. להמשיך?')) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
    progress = imported;
    storageProblem = false;
    notice.hidden = true;
    backupStatus.textContent = 'הגיבוי יובא ונשמר בהצלחה.';
    home();
  } catch (error) {
    report(`הגיבוי לא יובא; הנתונים הקיימים לא הוחלפו. ${error.message}`, error);
  } finally {
    event.target.value = '';
  }
});
document.querySelector('#erase').addEventListener('click', () => {
  if (!progress || !confirm('למחוק את כל הניסיונות וההסברים השמורים בדפדפן הזה? הפעולה אינה ניתנת לביטול.')) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    progress = emptyProgress();
    storageProblem = false;
    notice.hidden = true;
    backupStatus.textContent = 'הנתונים המקומיים נמחקו.';
    home();
  } catch (error) {
    report('מחיקת הנתונים נכשלה. הנתונים לא אופסו.', error);
  }
});

async function boot() {
  try {
    const response = await fetch('./questions.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bank = validateBank(await response.json());
    progress = emptyProgress();
    try {
      rawStored = localStorage.getItem(STORAGE_KEY);
      if (rawStored !== null) progress = validateProgress(JSON.parse(rawStored), bank);
    } catch (error) {
      storageProblem = true;
      report('לא ניתן לקרוא את ההתקדמות. הנתונים הקיימים לא יידרסו. אפשר לייצא את הנתונים המקוריים לשחזור, לייבא גיבוי תקין או למחוק אותם במפורש. המשך ללא שמירה מחייב ייצוא לפני יציאה.', error);
      if (rawStored !== null) notice.append(button('ייצוא הנתונים המקוריים לשחזור', () => download(rawStored, 'diyuk-recovery.json'), 'text-button'));
    }
    home();
  } catch (error) {
    page();
    main.append(el('h1', 'המבדק לא נטען'), el('p', 'בדוק את החיבור ונסה שוב. אם התקלה נמשכת, יש לבדוק את קובץ השאלות.'), button('ניסיון נוסף', () => location.reload()));
    report(`שגיאה בטעינת המבדק: ${error.message}`, error);
  }
}

boot();
