// Optional, transient UI exercise. Never executes commands or writes game/preferences.
const copyTask = task => task ? {id: task.id, target: task.target ?? null} : null;
const sameTask = (a, b) => !!a && !!b && a.id === b.id && (a.target ?? null) === (b.target ?? null);

export function beginTeamPractice(state, plan, check) {
  if (state?.phase !== 'planning' || !plan) return null;
  const actors = (state.selectedStaff || []).filter(id => !(state.reservedStaff || []).includes(id) && plan.staff?.[id]);
  if (!actors.length) return null;
  return {turn: state.turn, revision: state.revision,
    before: Object.fromEntries(actors.map(id => [id, copyTask(plan.staff[id])])),
    budget: Number.isFinite(check?.cost?.budget) ? check.cost.budget : null};
}

export function teamPracticeDraft(practice, state, plan, check) {
  if (!practice || state?.phase !== 'planning' || state.turn !== practice.turn || state.revision !== practice.revision) return null;
  const changes = Object.entries(practice.before).filter(([id, task]) => plan?.staff?.[id] && !sameTask(task, plan.staff[id]))
    .map(([actorId, before]) => ({actorId, before: copyTask(before), after: copyTask(plan.staff[actorId])}));
  return {changes, beforeBudget: practice.budget,
    budget: Number.isFinite(check?.cost?.budget) ? check.cost.budget : null, legal: check?.ok === true};
}

export function submitTeamPractice(practice, state, plan, check) {
  const draft = teamPracticeDraft(practice, state, plan, check);
  return draft?.legal && draft.changes.length ? {...practice, submitted: draft.changes} : null;
}

export function teamPracticeResult(practice, state) {
  if (!practice?.submitted || state?.phase !== 'debrief' || state.turn !== practice.turn || state.revision !== practice.revision + 1) return [];
  return practice.submitted.flatMap(change => {
    const entry = (state.lastTransition?.entries || []).find(item => item.actorId === change.actorId
      && (!item.partyId || item.partyId === 'P1') && item.actionId === change.after.id && (item.target ?? null) === change.after.target);
    return entry ? [{...change, entry}] : [];
  });
}
