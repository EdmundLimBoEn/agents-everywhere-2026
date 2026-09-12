import type { ApiClient, Citation, Lesson } from '../../../../packages/shared-types/src/study';
import { btn, el } from './dashboard';
import './assignment.css';

let disposeAssignment = () => {};

export function mountAssignment(root: HTMLElement, api: ApiClient, initial: Lesson, options: {
  onBack: () => void; onLesson: (lesson: Lesson) => void;
}): void {
  disposeAssignment();
  let lesson = initial;
  let reviewedDraft = initial.assignment?.review ? initial.assignment.draft : null;
  let draft = lesson.assignment?.draft ?? '';
  let question = '';
  let busy = false;
  let error = '';
  let activity = 'Your assignment and class materials, in one place.';
  let selectedSource = lesson.assignment?.materials[0]?.sourceId ?? lesson.sources[0]?.id;
  let selectedPassage: string | undefined;
  let selectedQuote: string | undefined;
  let pending: { action: 'prepare' | 'save' | 'help' | 'review'; assignmentId?: string; draft: string; question?: string; revision: number; requestId: string } | undefined;
  const dirty = () => draft !== (lesson.assignment?.draft ?? '');
  const unload = (event: BeforeUnloadEvent) => {
    if (!root.isConnected) { window.removeEventListener('beforeunload', unload); return; }
    if (dirty()) { event.preventDefault(); event.returnValue = ''; }
  };
  window.addEventListener('beforeunload', unload);
  const app = root.closest('.study-app');
  const beforeClose = (event: Event) => {
    if (busy || (dirty() && !window.confirm('Your draft has unsaved changes. Leave without saving?'))) event.preventDefault();
    else disposeAssignment();
  };
  app?.addEventListener('study:before-close', beforeClose);
  disposeAssignment = () => { window.removeEventListener('beforeunload', unload); app?.removeEventListener('study:before-close', beforeClose); };
  const back = () => {
    if (busy || (dirty() && !window.confirm('Your draft has unsaved changes. Leave without saving?'))) return;
    disposeAssignment();
    options.onBack();
  };
  const openCitation = (citation: Citation) => {
    selectedSource = citation.sourceId; selectedPassage = citation.passageId; selectedQuote = citation.quote;
    renderSource();
    const passage = root.querySelector<HTMLElement>('[data-highlighted="true"]');
    passage?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); passage?.focus({ preventScroll: true });
  };
  const citations = (items: Citation[]) => {
    const links = el('div', '', 'assignment-citations');
    for (const c of items) {
      const source = lesson.sources.find(s => s.id === c.sourceId);
      if (!source?.passages.some(p => p.id === c.passageId && p.text.includes(c.quote))) continue;
      const link = btn(`▤ ${source.title}`, () => openCitation(c));
      link.title = c.quote; links.append(link);
    }
    return links;
  };
  async function run(action: 'prepare' | 'save' | 'help' | 'review') {
    if (busy) return;
    if (!pending || pending.action !== action || pending.draft !== draft || pending.question !== (action === 'help' ? question : undefined) || pending.revision !== lesson.revision) {
      pending = { action, assignmentId: lesson.assignment?.assignmentId, draft, question: action === 'help' ? question : undefined, revision: lesson.revision, requestId: crypto.randomUUID() };
    }
    busy = true; error = '';
    activity = { prepare: 'Reading assignment requirements and finding class materials…', save: 'Saving your draft…', help: 'Looking through your materials for a useful hint…', review: 'Checking your draft against each requirement…' }[action];
    render();
    try {
      const next = await api<Lesson>(`/api/lessons/${encodeURIComponent(lesson.id)}/assignment`, { method: 'POST', body: pending });
      lesson = next; draft = next.assignment?.draft ?? draft; pending = undefined;
      if (action === 'review') reviewedDraft = draft;
      if (!next.assignment?.review) reviewedDraft = null;
      options.onLesson(next);
      activity = { prepare: 'Requirements and supporting materials are ready.', save: 'Draft saved. Pick up here whenever you’re ready.', help: 'A hint is ready, grounded in your class materials.', review: 'Draft checked. Review the feedback before making your next move.' }[action];
    } catch (e) {
      error = e instanceof Error ? e.message : 'That didn’t complete. Your draft is still here.';
      if (/stale|revision|409|changed in another tab|assignment instructions changed/i.test(error)) {
        try { lesson = await api<Lesson>(`/api/lessons/${encodeURIComponent(lesson.id)}`); options.onLesson(lesson); pending = undefined; }
        catch { /* Keep the original revision and request ID until a retry can reconcile. */ }
      }
      activity = 'Your draft is still here. Retry when you’re ready.';
    } finally { busy = false; render(); }
  }
  let sourcePane: HTMLElement;
  function renderSource() {
    if (!sourcePane) return;
    sourcePane.replaceChildren();
    const source = lesson.sources.find(s => s.id === selectedSource) ?? lesson.sources[0];
    const label = el('label', 'READ ALONGSIDE YOUR WORK', 'study-eyebrow');
    const select = el('select'); select.setAttribute('aria-label', 'Class material');
    for (const s of lesson.sources) { const o = el('option', s.title); o.value = s.id; select.append(o); }
    select.value = source?.id ?? '';
    select.onchange = () => { selectedSource = select.value; selectedPassage = undefined; selectedQuote = undefined; renderSource(); };
    label.append(select); sourcePane.append(label);
    if (!source) { sourcePane.append(el('p', 'No readable class materials are available yet.')); return; }
    const reason = lesson.assignment?.materials.find(m => m.sourceId === source.id)?.reason;
    if (reason) sourcePane.append(el('p', reason, 'assignment-source-reason'));
    const reader = el('div', '', 'assignment-reader');
    for (const p of source.passages) {
      const passage = el('div', '', 'assignment-passage'); passage.tabIndex = -1;
      if (p.id === selectedPassage) { passage.dataset.highlighted = 'true'; }
      if (p.heading || p.page) passage.append(el('small', p.heading ?? `Page ${p.page}`));
      const text = el('p');
      const offset = p.id === selectedPassage && selectedQuote ? p.text.indexOf(selectedQuote) : -1;
      if (offset >= 0 && selectedQuote) text.append(document.createTextNode(p.text.slice(0, offset)), el('mark', selectedQuote), document.createTextNode(p.text.slice(offset + selectedQuote.length)));
      else text.textContent = p.text;
      passage.append(text); reader.append(passage);
    }
    sourcePane.append(reader);
  }
  function render() {
    root.className = 'assignment-workspace'; root.replaceChildren();
    const state = lesson.assignment;
    const post = lesson.classroomPosts?.find(p => p.type === 'courseWork' && p.id === state?.assignmentId);
    const top = el('div', '', 'assignment-top');
    const backButton = btn('← Back to Catch Up', back); backButton.disabled = busy;
    backButton.setAttribute('aria-label', 'Back to Catch Up');
    top.append(backButton, el('span', 'AFTERCLASS / ASSIGNMENT WORKSPACE', 'study-eyebrow'));
    const hero = el('header', '', 'assignment-hero');
    const intro = el('div');
    intro.append(el('p', 'ONE ASSIGNMENT. YOUR NEXT STEP.', 'study-eyebrow'), el('h1', post?.title ?? lesson.title), el('p', state?.goal ?? 'Turn the work in front of you into a clear next step.', 'assignment-deck'));
    const deadline = el('div', '', 'assignment-deadline');
    deadline.append(el('span', 'YOUR FINISH LINE', 'study-eyebrow'));
    deadline.append(el('strong', post?.dueAt && Number.isFinite(Date.parse(post.dueAt)) ? new Date(post.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'At your pace'));
    deadline.append(el('span', post?.dueAt ? 'Assignment due date' : 'No due date provided'));
    hero.append(intro, deadline);
    const workflow = el('nav', '', 'assignment-workflow'); workflow.setAttribute('aria-label', 'Assignment workflow');
    for (const [i, title, id] of [['01', 'Know the requirements', 'assignment-requirements'], ['02', 'Work through blockers', 'assignment-draft'], ['03', 'Check your draft', 'assignment-review'], ['04', 'Return to Classroom', 'assignment-return']]) {
      const step = btn('', () => { const target = root.querySelector<HTMLElement>(`#${id}`); target?.scrollIntoView({ behavior: 'smooth', block: 'start' }); target?.focus({ preventScroll: true }); });
      step.append(el('span', i, 'assignment-step-number'), el('span', title)); workflow.append(step);
    }
    const status = el('div', '', 'assignment-activity'); status.setAttribute('role', 'status');
    status.append(el('span', busy ? '◌' : '✦', 'assignment-activity-icon'), el('span', activity));
    root.append(top, hero, workflow, status);
    if (error) {
      const alert = el('div', '', 'assignment-error'); alert.setAttribute('role', 'alert');
      alert.append(el('p', error));
      if (pending) { const retry = btn('Retry', () => { if (pending) void run(pending.action); }); retry.disabled = busy; alert.append(retry); }
      root.append(alert);
    }
    if (lesson.failures.length) {
      const unavailable = el('details', '', 'assignment-unavailable');
      unavailable.append(el('summary', `${lesson.failures.length} class material${lesson.failures.length === 1 ? '' : 's'} could not be read`));
      const list = el('ul');
      for (const failure of lesson.failures) { const item = el('li'); item.append(el('strong', failure.title), el('span', ` — ${failure.reason}`)); list.append(item); }
      unavailable.append(el('p', 'The workspace can only use the materials it could read. Check these items in Classroom for anything missing.'), list);
      root.append(unavailable);
    }
    if (!state) { const prepare = btn('Understand this assignment →', () => void run('prepare'), 'study-primary'); prepare.disabled = busy; root.append(prepare); return; }

    if (state.requirementsStale) {
      const warning = el('div', '', 'assignment-error'); warning.setAttribute('role', 'alert');
      warning.append(el('p', 'Assignment instructions changed. Refresh requirements to continue. Your draft is preserved.'));
      const refresh = btn('Refresh requirements', () => void run('prepare'), 'study-primary'); refresh.disabled = busy; warning.append(refresh); root.append(warning);
    }
    const overview = el('section', '', 'assignment-overview'); overview.id = 'assignment-requirements'; overview.tabIndex = -1;
    const summary = el('div'); summary.append(el('p', '01 / UNDERSTAND', 'study-eyebrow'), el('h2', 'What you’re working toward'), el('p', state.rubricAvailable ? 'Requirements grounded in the available assignment rubric.' : 'No teacher rubric available. Checks use the assignment instructions only.', 'assignment-rubric-note'));
    const requirements = el('ol', '', 'assignment-requirements');
    state.requirements.forEach((r, i) => { const row = el('li'); const copy = el('div'); copy.append(el('strong', r.text), citations(r.citations)); row.append(el('span', String(i + 1).padStart(2, '0'), 'assignment-requirement-number'), copy); requirements.append(row); });
    if (!state.requirements.length) requirements.append(el('li', 'Requirements could not be established. Read the original assignment before continuing.'));
    overview.append(summary, requirements); root.append(overview);

    const work = el('section', '', 'assignment-work'); work.id = 'assignment-draft'; work.tabIndex = -1;
    sourcePane = el('aside', '', 'assignment-source'); sourcePane.setAttribute('aria-label', 'Source reader');
    const writing = el('div', '', 'assignment-writing');
    const writingHeading = el('div', '', 'assignment-section-heading'); writingHeading.append(el('div', '02 / MAKE PROGRESS', 'study-eyebrow'), el('h2', 'Your thinking goes here.'));
    const draftLabel = el('label', 'Your draft', 'assignment-draft-label'); const editor = el('textarea', '', 'assignment-editor'); editor.id = 'assignment-draft-input'; draftLabel.htmlFor = editor.id;
    editor.value = draft; editor.placeholder = 'Start with what you know. An outline, a first attempt, or a question is enough.'; editor.disabled = busy; editor.maxLength = 20000; editor.setAttribute('aria-label', 'Assignment draft');
    const saveStatus = el('span', dirty() ? 'Unsaved changes' : 'Saved draft', 'assignment-save-status');
    const save = btn('Save draft', () => void run('save')); save.disabled = busy || !dirty();
    const reviewButton = btn('Check my draft →', () => void run('review'), 'study-primary'); reviewButton.setAttribute('aria-label', 'Check my draft'); reviewButton.disabled = busy || Boolean(state.requirementsStale) || !draft.trim();
    const outdated = el('p', 'You’ve edited this draft. Check it again for current feedback.', 'assignment-stale'); outdated.hidden = !state.review || draft === reviewedDraft;
    const reviewIsOld = () => { outdated.hidden = !state.review || draft === reviewedDraft; root.querySelector('.assignment-review-results')?.classList.toggle('assignment-review-outdated', draft !== reviewedDraft); };
    editor.oninput = () => { draft = editor.value; saveStatus.textContent = dirty() ? 'Unsaved changes' : 'Saved draft'; save.disabled = busy || !dirty(); reviewButton.setAttribute('aria-label', 'Check my draft'); reviewButton.disabled = busy || Boolean(state.requirementsStale) || !draft.trim(); reviewIsOld(); };
    const actions = el('div', '', 'assignment-draft-actions'); actions.append(saveStatus, save, reviewButton);
    writing.append(writingHeading, draftLabel, editor, actions, el('p', 'Saved to this lesson. Drafting here does not edit or submit your Classroom assignment.', 'assignment-caption'));
    const help = el('div', '', 'assignment-help');
    help.append(el('h3', 'A blocker? Let’s work through it.'), el('p', state.blocker ?? 'Ask for a hint, an explanation, or help finding the relevant class notes.'));
    const prompt = el('textarea'); prompt.rows = 2; prompt.placeholder = 'What part are you stuck on?'; prompt.setAttribute('aria-label', 'What are you stuck on?'); prompt.value = question; prompt.maxLength = 2000; prompt.disabled = busy; prompt.oninput = () => { question = prompt.value; };
    const hint = btn('Get a hint ↗', () => void run('help')); hint.setAttribute('aria-label', 'Get a hint'); hint.disabled = busy || Boolean(state.requirementsStale);
    help.append(prompt, hint);
    if (state.help) help.append(el('p', state.help.text, 'assignment-hint'), citations(state.help.citations));
    writing.append(help); work.append(sourcePane, writing); root.append(work); renderSource();

    const review = el('section', '', 'assignment-review'); review.id = 'assignment-review'; review.tabIndex = -1;
    const reviewHeading = el('div'); reviewHeading.append(el('p', '03 / CHECK & REFINE', 'study-eyebrow'), el('h2', 'A second look, before you send.'));
    review.append(reviewHeading, outdated);
    if (state.review) {
      const results = el('div', '', 'assignment-review-results');
      const addressed = state.review.criteria.filter(c => c.status === 'addressed').length;
      const meter = el('div', '', 'assignment-review-meter'); meter.append(el('strong', `${addressed} / ${state.requirements.length}`), el('span', 'requirements addressed · guidance, not a grade'));
      results.append(meter, el('p', state.review.summary));
      const cards = el('div', '', 'assignment-review-cards');
      for (const c of state.review.criteria) {
        const card = el('article', '', `assignment-criterion assignment-criterion-${c.status}`);
        card.append(el('span', c.status, 'assignment-assessment'), el('h3', state.requirements.find(r => r.id === c.requirementId)?.text ?? 'Requirement'), el('p', c.feedback));
        if (c.draftQuote && state.draft.includes(c.draftQuote)) card.append(el('small', 'FROM YOUR DRAFT', 'study-eyebrow'), el('blockquote', c.draftQuote));
        else card.append(el('p', 'No matching draft evidence identified.', 'assignment-caption'));
        card.append(citations(c.citations)); cards.append(card);
      }
      results.append(cards); review.append(results);
    } else review.append(el('p', 'Write a first attempt, then choose “Check my draft”. You’ll see what’s addressed, what needs work, and the draft evidence behind each suggestion.', 'assignment-review-empty'));
    root.append(review); reviewIsOld();

    const next = el('footer', '', 'assignment-next'); next.id = 'assignment-return'; next.tabIndex = -1;
    const nextCopy = el('div'); nextCopy.append(el('p', 'YOUR NEXT MOVE', 'study-eyebrow'), el('h2', state.review?.nextAction ?? state.nextAction), el('p', 'You stay in control. Review your work and submit it yourself in Classroom.'));
    next.append(nextCopy);
    try {
      const url = new URL(post?.alternateLink ?? '');
      if (url.protocol === 'https:' && url.hostname === 'classroom.google.com') {
        const link = el('a', 'Open assignment in Classroom ↗', 'assignment-classroom-link'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; next.append(link);
      } else next.append(el('p', 'Open the original assignment in your Classroom tab.'));
    } catch { next.append(el('p', 'Open the original assignment in your Classroom tab.')); }
    root.append(next);
  }
  render();
}
