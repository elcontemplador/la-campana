// Describe effective resource/support gains without turning internal weights into polls.
import {resolveCampaignBundle} from '../core/campaign.mjs';
import {districtIssues} from '../core/polls.mjs';
import {present} from '../core/utils.mjs';

const names = {budget: 'Presupuesto', energy: 'Energía', readiness: 'Preparación', cohesion: 'Cohesión', reputation: 'Reputación'};
const described = new Set(['stat', 'rapport', 'relation', 'organization', 'support', 'topic_support', 'promise_open', 'promise_close']);
const bonusLabels = new Set(['Tu perfil añade +1 cohesión', 'Tu perfil añade +1 relación civil']);
const clamp = (n, bounds) => Math.min(bounds.max, Math.max(bounds.min, n));
const signed = n => n > 0 ? `+${n}` : String(n);

function description(label, before, requested, actual, bounds, {organization = false, profileGain = 0} = {}) {
  const separator = label.includes(':') ? ' ' : ': ';
  if (actual === 0) {
    if (requested > 0 && before >= bounds.max) return organization ? `${label}: ya al máximo (${bounds.max})`
      : `${label}${separator}sin cambio (máximo ${bounds.max})`;
    if (requested < 0 && before <= bounds.min) return `${label}${separator}sin cambio (mínimo ${bounds.min})`;
    return `${label}${separator}sin cambio`;
  }
  const notes = [];
  if (actual !== requested) notes.push(`límite ${requested > 0 ? bounds.max : bounds.min}`);
  if (profileGain > 0) notes.push('incluye perfil');
  return `${label} ${signed(actual)}${notes.length ? ` (${notes.join('; ')})` : ''}`;
}

export function eventLimitDescriptions(option, state, sourceBundle) {
  const original = [...(option?.availability?.effects || [])];
  if (!state || !Array.isArray(option?.effects)) return original;
  const {config, provinces} = resolveCampaignBundle(sourceBundle, state);
  const own = state.parties.P1;
  const values = Object.fromEntries(Object.keys(names).map(key => [key, own[key]]));
  const relations = {...own.relations}, organization = {...own.organization}, rapport = {...state.rapport};
  // Read the player's accumulated campaign only for a support effect. Never inspect
  // opponents' weights, private resources, polls or future entries for this preview.
  let campaignDelta = null;
  const supportDescription = (effect, originalText) => {
    campaignDelta ??= {...own.campaignDelta};
    const national = effect.type === 'support' && effect.target !== 'focus';
    const party = config.parties.find(p => p.id === 'P1');
    const targets = national ? provinces.districts.filter(d => present(party, d.id)).map(d => d.id)
      : present(party, state.focusProvince) ? [state.focusProvince] : [];
    const place = provinces.districts.find(d => d.id === state.focusProvince)?.name || 'tu provincia';
    const scope = national ? 'nacional' : `en ${place}`;
    if (!targets.length) return `Sin cambio de alcance ${scope} (tu partido no se presenta)`;
    let delta = effect.delta;
    if (effect.type === 'topic_support') {
      const issue = districtIssues({config}, state.seed, state.focusProvince)[effect.topicId];
      delta = effect.base * issue.salience * (own.positions[effect.topicId] === issue.position ? 1 : -1);
    }
    let total = 0, limited = 0;
    for (const id of targets) {
      const before = campaignDelta[id];
      campaignDelta[id] = Math.max(config.support.campaignDeltaMin,
        Math.min(config.support.campaignDeltaMax, before + delta));
      const actual = campaignDelta[id] - before;
      total += actual;
      if (actual !== delta) limited++;
    }
    if (!limited) return originalText;
    if (!total) return `Sin cambio de alcance ${scope} (límite alcanzado)`;
    // Keep the non-rounded total: a gain in just one province is still a gain,
    // even when the motor's rounded national mean is zero.
    return `${total > 0 ? 'Más' : 'Menos'} alcance ${scope} (${national ? 'efecto limitado en algunas provincias' : 'efecto limitado'})`;
  };
  const texts = [...original];
  const promises = new Map((state.promises || []).map(promise => [promise.id, {...promise}]));
  const change = (values, key, delta, bounds) => {
    const before = values[key], after = clamp(before + delta, bounds);
    values[key] = after;
    return {before, actual: after - before};
  };
  // Payment precedes a recovery and must never be cancelled against it.
  for (const key of ['budget', 'energy']) change(values, key, -(option.availability?.cost?.[key] || 0), config.resources[key]);
  let coordination = null;
  if (state.candidate.profile === 'coordinacion' && option.reserveStaff && !state.profileUsed.delegation) {
    const effect = change(values, 'cohesion', 1, config.resources.cohesion);
    coordination = description('Perfil Coordinación: cohesión', effect.before, 1, effect.actual, config.resources.cohesion);
  }
  let connectionUsed = Boolean(state.profileUsed.rapport), index = 0;
  for (const effect of option.effects) {
    if (!described.has(effect.type)) continue;
    if (effect.type === 'support' || effect.type === 'topic_support') {
      texts[index] = supportDescription(effect, texts[index]);
    } else if (effect.type === 'stat' && names[effect.stat]) {
      const bounded = change(values, effect.stat, effect.delta, config.resources[effect.stat]);
      texts[index] = description(names[effect.stat], bounded.before, effect.delta, bounded.actual, config.resources[effect.stat]);
    } else if (effect.type === 'relation') {
      const bounded = change(relations, effect.target, effect.delta, config.resources.relation);
      const label = `${config.parties.find(p => p.id === effect.target)?.name || effect.target}: relación`;
      texts[index] = description(label, bounded.before, effect.delta, bounded.actual, config.resources.relation);
    } else if (effect.type === 'organization') {
      // The engine uses focusProvince for this effect, regardless of its stored target label.
      const target = state.focusProvince, bounded = change(organization, target, effect.delta, config.resources.organization);
      const label = `Voluntarios en ${provinces.districts.find(p => p.id === target)?.name || target}`;
      texts[index] = description(label, bounded.before, effect.delta, bounded.actual, config.resources.organization, {organization: true});
    } else if (effect.type === 'rapport') {
      const before = rapport[effect.target], baseGain = clamp(before + effect.delta, config.resources.rapport) - before;
      const bonus = state.candidate.profile === 'conexion' && !connectionUsed && effect.delta > 0 ? 1 : 0;
      if (bonus) connectionUsed = true; // A saturated first contact still uses the one-per-turn bonus.
      const bounded = change(rapport, effect.target, effect.delta + bonus, config.resources.rapport);
      const label = `${config.civilActors.find(a => a.id === effect.target)?.name || effect.target}: relación`;
      texts[index] = description(label, bounded.before, effect.delta + bonus, bounded.actual, config.resources.rapport,
        {profileGain: Math.max(0, bounded.actual - baseGain)});
    } else if (effect.type === 'promise_open') {
      const previous = promises.get(effect.id);
      if (previous) {
        const actor = config.civilActors.find(actor => actor.id === previous.target)?.name || previous.target;
        texts[index] = previous.status === 'open'
          ? `${actor}: ratificas la respuesta pendiente para el turno ${previous.dueTurn}`
          : `${actor}: obligación ya cerrada; no se abre otra`;
      } else promises.set(effect.id, {...effect, status: 'open'});
    } else if (effect.type === 'promise_close') {
      for (const promise of promises.values()) if (promise.status === 'open' && (effect.id === 'ALL_OPEN' || promise.id === effect.id)) promise.status = effect.status;
    }
    index += 1;
  }
  // Conexión is integrated into its first positive contact; never repeat a nominal +1.
  // Coordinación happens before effects, so describe that bounded bonus separately.
  return [...(coordination ? [coordination] : []), ...texts.filter(text => !bonusLabels.has(text))];
}
