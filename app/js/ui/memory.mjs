// Brief memories of confirmed entries. No new campaign state or hidden data.
import {resolveCampaignBundle} from '../core/campaign.mjs';
import {promiseThreads} from './promises.mjs';

const gain = (entry, stat) => (entry?.changes || []).some(c => c.stat === stat && Number.isFinite(c.delta) && c.delta > 0);
const loss = (entry, stat) => (entry?.changes || []).some(c => c.stat === stat && Number.isFinite(c.delta) && c.delta < 0);
const voices = {
  S1: {start: 'Lo tenemos anotado:', end: 'Hechos, antes que conjeturas.'},
  S2: {start: 'Quedó hecho:', end: 'Las tareas también tienen memoria.'},
  S3: {start: 'Me acuerdo:', end: 'Una frase, sin rodeos.'},
  S4: {start: 'Lo hablamos:', end: 'Hablar también necesita agenda.'},
};

// One political concern on alternate turns. The line comes from a recorded
// decision, never from a relationship score, a poll or an invented reaction.
function conflictMemory(state, config, past, threads) {
  if (state.turn < 3 || state.turn % 2 === 0) return null;
  const selected = state.selectedStaff || [];
  const person = preferred => preferred.find(id => selected.includes(id));
  const candidates = [];
  const add = (entry, preferred, kind, text, priority) => {
    const staffId = person(preferred);
    if (entry && staffId) candidates.push({staffId, kind, text, priority,
      entryId: entry.id, turn: entry.turn});
  };
  for (const promise of threads) {
    const entry = past.find(e => e.id === promise.entryId && e.kind === 'event');
    if (!entry || promise.status !== 'open' || !Number.isSafeInteger(promise.dueTurn)
      || promise.dueTurn < state.turn) continue;
    if (entry.turn < state.turn - 2 && promise.dueTurn - state.turn > 2) continue;
    const name = promise.name;
    if (!name) continue;
    add(entry, ['S4','S2','S1','S3'], 'pending-promise',
      `${name} espera tu respuesta sobre ${promise.request} (T${entry.turn} → T${promise.dueTurn}).${promise.dueTurn-state.turn<=2?' Reserva caja o una tarea: se entrega antes de la última jugada.':''}`, 4);
  }
  for (const entry of past.filter(e => e.turn >= state.turn - 2 && (!e.partyId || e.partyId === 'P1'))) {
    if (entry.kind === 'event' && entry.eventId === 'E07' && entry.optionId === 'open_dialogue'
      && gain(entry, 'relation')) {
      const names=(entry.changes||[]).filter(c=>c.stat==='relation'&&c.delta>0)
        .map(c=>config.parties.find(p=>p.id===c.target)?.name).filter(Boolean);
      add(entry, ['S4','S3','S1','S2'], 'debate-dialogue',
        `Abriste diálogo con ${names.join(' y ')} en el debate de T${entry.turn}. Preparaste confianza; el programa seguirá pesando en el acuerdo.`, 3);
    } else if (entry.kind === 'event' && entry.eventId === 'E07' && entry.optionId === 'compare_programmes'
      && loss(entry,'relation')) {
      const target=(entry.changes||[]).find(c=>c.stat==='relation'&&c.delta<0)?.target;
      const name=config.parties.find(p=>p.id===target)?.name;
      if(name)add(entry,['S4','S3','S1','S2'],'debate-conflict',
        `La comparación del debate de T${entry.turn} enfrió la relación con ${name}. Tener más foco y preparar un acuerdo son decisiones distintas.`, 3);
    } else if (entry.kind === 'event' && ['E09','E19'].includes(entry.eventId) && loss(entry,'reputation')) {
      add(entry,['S3','S1','S4','S2'],'public-error',
        `${entry.eventId==='E19'?'La cifra equivocada':'Los anuncios incompatibles'} de T${entry.turn} ${entry.eventId==='E19'?'costó':'costaron'} reputación. Antes del próximo titular, cuidemos lo que podemos sostener.`, 3);
    } else if (entry.kind === 'plan' && entry.actorId === 'candidate' && entry.actionId === 'fundraise'
      && loss(entry,'reputation')) {
      const amount=(entry.changes||[]).filter(c=>c.stat==='reputation'&&c.delta<0)
        .reduce((sum,c)=>sum-c.delta,0);
      add(entry,['S2','S3','S1','S4'],'fundraising-wear',
        `La recaudación de T${entry.turn} ${gain(entry,'budget')?'añadió caja, pero ':''}costó ${amount} de reputación. El siguiente gasto merece una prioridad clara.`, 2);
    } else if (entry.kind === 'event' && loss(entry,'cohesion')) {
      add(entry,['S2','S3','S4','S1'],'team-wear',
        `La decisión de T${entry.turn} redujo la cohesión. Antes de forzar otra tarea, revisemos qué esfuerzo puede sostener el equipo.`, 1);
    }
  }
  candidates.sort((a,b)=>b.priority-a.priority||b.turn-a.turn||a.entryId.localeCompare(b.entryId));
  const chosen=candidates[0];
  if(!chosen)return null;
  const {priority,...memory}=chosen;
  return memory.text.length<=180?memory:null;
}

export function staffMemories(state, originalBundle, {beforeTurn = state?.turn} = {}) {
  if (!state || !Number.isSafeInteger(beforeTurn) || beforeTurn < 1) return [];
  const {config, provinces} = resolveCampaignBundle(originalBundle, state);
  const timeline = state.timeline || [];
  // An event decision is confirmed immediately, but its turn is not closed yet.
  const closed = new Set(timeline.filter(e => e.kind === 'plan' && e.actorId === 'candidate'
    && e.turn <= state.turn && (e.turn < state.turn || !['event', 'planning'].includes(state.phase))).map(e => e.turn));
  const past = timeline.filter(e => Number.isSafeInteger(e.turn) && e.turn < beforeTurn && closed.has(e.turn));
  const current = state.phase === 'debrief' ? timeline.filter(e => e.kind === 'plan' && e.turn === state.turn) : [];
  const candidate = current.findLast(e => e.actorId === 'candidate');
  const province = id => provinces.districts.find(p => p.id === id)?.name;
  const party = id => config.parties.find(p => p.id === id)?.name;
  const actor = id => config.civilActors.find(p => p.id === id)?.name;
  const used = new Set();
  const results = [];
  const dialog = beforeTurn === state.turn + 1;
  const conflict = conflictMemory(state, config, past, promiseThreads(state, originalBundle));
  if (conflict) used.add(conflict.entryId);

  for (const staffId of state.selectedStaff || []) {
    if (!config.staff.some(s => s.id === staffId)) continue;
    if (conflict?.staffId === staffId) {
      results.push(conflict); used.add(conflict.entryId); continue;
    }
    const own = current.findLast(e => e.actorId === staffId);
    const choices = [];
    for (const entry of past) {
      if (used.has(entry.id)) continue;
      let fact, continuation = '', kind, related = false;
      const previous = entry.turn < state.turn;
      if (entry.kind === 'event' && entry.reservedStaff === staffId) {
        kind = 'delegation'; fact = `atendí la noticia en el turno ${entry.turn}.`;
        related = previous && own && own.actionId !== 'wait';
        if (related) continuation = ' Hoy vuelvo a mi tarea de campaña.';
      } else if (entry.kind === 'plan' && entry.actorId === staffId) {
        if (entry.actionId === 'research' && province(entry.target)
          && (entry.changes || []).some(c => c.stat === 'research' && c.target === entry.target)) {
          kind = 'research'; fact = `afiné el sondeo de ${province(entry.target)} en el turno ${entry.turn}.`;
          related = previous && candidate?.actionId === 'visit' && candidate.target === entry.target;
          if (related) continuation = ' Hoy has vuelto allí. Datos, luego botas.';
        } else if (entry.actionId === 'organize' && province(entry.target) && gain(entry, 'organization')) {
          kind = 'organization'; fact = `dejé voluntarios en ${province(entry.target)} en el turno ${entry.turn}.`;
          related = previous && ((candidate?.actionId === 'visit' && candidate.target === entry.target)
            || (own?.actionId === 'organize' && own.target === entry.target));
          if (related) continuation = own?.actionId === 'organize' && own.target === entry.target && gain(own, 'organization')
            ? ' Hoy amplié aquel equipo.' : candidate?.actionId === 'visit' ? ' Hoy has vuelto allí.' : ' Hoy volví a trabajar allí.';
        } else if (entry.actionId === 'prepare' && gain(entry, 'readiness')) {
          kind = 'preparation'; fact = `ensayamos en el turno ${entry.turn}.`;
          related = previous && ['interview', 'contrast'].includes(candidate?.actionId) && loss(candidate, 'readiness');
          if (related) continuation = ' Hoy tu intervención usó preparación.';
        } else if (entry.actionId === 'mediate' && party(entry.target) && gain(entry, 'relation')) {
          kind = 'mediation'; fact = `la reunión con ${party(entry.target)} mejoró la relación en el turno ${entry.turn}.`;
          related = previous && ((own?.actionId === 'mediate' && own.target === entry.target)
            || (candidate?.actionId === 'contrast' && candidate.target === entry.target && loss(candidate, 'relation')));
          if (related) continuation = candidate?.actionId === 'contrast' && candidate.target === entry.target && loss(candidate, 'relation')
            ? ' El contraste de hoy la redujo.' : ' Hoy volvimos a reunirnos.';
        } else if (entry.actionId === 'outreach' && actor(entry.target) && gain(entry, 'rapport')) {
          kind = 'outreach'; fact = `el contacto con ${actor(entry.target)} mejoró la relación en el turno ${entry.turn}.`;
          related = previous && own?.actionId === 'outreach' && own.target === entry.target;
          if (related) continuation = ' Hoy retomé la conversación.';
        }
      } else if (staffId === 'S4' && entry.kind === 'plan' && entry.actorId === 'candidate'
        && entry.actionId === 'contrast' && party(entry.target) && loss(entry, 'relation')) {
        kind = 'contrast'; fact = `el contraste con ${party(entry.target)} redujo la relación en el turno ${entry.turn}.`;
        related = previous && own?.actionId === 'mediate' && own.target === entry.target;
        if (related) continuation = ' Hoy volví a abrir la conversación.';
      }
      if (!fact) continue;
      if (!dialog && !related) continue;
      if (dialog && !related && entry.turn < state.turn - 1) continue;
      // Derive prior use from confirmed activity; there is no persisted memory log.
      const alreadyContinued = past.some(e => e.turn > entry.turn && e.turn < state.turn && e.kind === 'plan' && (
        kind === 'research' ? e.actorId === 'candidate' && e.actionId === 'visit' && e.target === entry.target
          : kind === 'organization' ? e.target === entry.target && ((e.actorId === 'candidate' && e.actionId === 'visit') || (e.actorId === staffId && e.actionId === 'organize'))
          : kind === 'preparation' ? e.actorId === 'candidate' && ['interview', 'contrast'].includes(e.actionId) && loss(e, 'readiness')
          : kind === 'mediation' ? e.target === entry.target && ((e.actorId === staffId && e.actionId === 'mediate') || (e.actorId === 'candidate' && e.actionId === 'contrast' && loss(e, 'relation')))
          : kind === 'outreach' ? e.actorId === staffId && e.actionId === 'outreach' && e.target === entry.target
          : kind === 'contrast' ? e.actorId === staffId && e.actionId === 'mediate' && e.target === entry.target
          : kind === 'delegation' ? e.actorId === staffId && e.actionId !== 'wait' : false));
      if (related && alreadyContinued) continue;
      const voice = voices[staffId];
      let text = `${voice.start} ${fact}${continuation || ` ${voice.end}`}`;
      // Keep complete names: drop the flourish instead of cutting a reference.
      if (text.length > 180) text = `${voice.start} ${fact}`;
      choices.push({staffId, text, entryId: entry.id, turn: entry.turn, kind,
        related: !!related, index: timeline.indexOf(entry)});
    }
    choices.sort((a, b) => Number(b.related) - Number(a.related) || b.index - a.index);
    const best = choices[0];
    if (best) {
      used.add(best.entryId);
      const {related, index, ...memory} = best;
      results.push(memory);
    }
  }
  return results;
}
