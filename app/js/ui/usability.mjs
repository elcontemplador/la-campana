import {resolveCampaignBundle} from '../core/campaign.mjs';
import {present} from '../core/utils.mjs';

export const SETUP_DRAFT_KEY = 'la-campana-v061-setup';
const controls = /[\u0000-\u001f\u007f]/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = (value, max, empty = false) => typeof value === 'string' && !controls.test(value)
  && value.normalize('NFC').trim().length <= max && (empty || value.normalize('NFC').trim().length > 0);
const pair = value => Array.isArray(value) && value.length === 2 && new Set(value).size === 2;

// UI guidance only. This never changes a setup or substitutes an engine check.
export function setupIssues(setup = {}) {
  const issues = [];
  if (!text(setup?.name, 40)) issues.push({target: '#candidate-name', message: 'Pon un nombre al candidato, de hasta 40 caracteres.'});
  if (!text(setup?.seed, 64)) issues.push({target: '#campaign-seed', message: 'Escribe una clave de campaña de 1 a 64 caracteres, sin saltos de línea.'});
  if (!pair(setup?.staff)) issues.push({target: '#staff-title', message: 'Elige exactamente dos personas para tu equipo.'});
  if (!pair(setup?.commitments)) issues.push({target: '#topics-title', message: 'Elige exactamente dos prioridades para tu programa.'});
  return issues;
}

// Show only questions that belong to the current creation step; final validation
// still uses setupIssues in full before a campaign is created.
export function guidedSetupIssues(setup, {step = 0, all = false} = {}) {
  const issues = setupIssues(setup);
  if(all || step === 3) return issues;
  const targets = step === 1 ? ['#candidate-name','#campaign-seed']
    : step === 2 ? ['#staff-title','#topics-title'] : [];
  return issues.filter(issue => targets.includes(issue.target));
}

function forecast(preview) {
  const totals = preview?.totals;
  if (!totals || !Number.isFinite(totals.yes) || !Number.isFinite(totals.no)
    || totals.yes < 0 || totals.no < 0) return null;
  const margin = totals.yes - totals.no;
  return {margin, rank: totals.yes >= 176 ? 2 : margin > 0 ? 1 : 0};
}

export function counterofferAssessment(choice) {
  const before = forecast(choice?.before), after = forecast(choice?.after);
  const margins = {marginBefore: before?.margin ?? null, marginAfter: after?.margin ?? null};
  const cost = Number.isFinite(choice?.cost) && choice.cost > 0 ? ` Gastas ${choice.cost} de caja.` : '';
  if (choice?.accepted !== true) return {kind: 'rejected', title: 'Prevé rechazar', ...margins,
    warning: 'La propuesta no será aceptada.' + cost};
  if (!before || !after) return {kind: 'same', title: 'Sin previsión comparable', ...margins,
    warning: 'No se pueden comparar los apoyos de esta propuesta.' + cost};
  const difference = after.rank - before.rank || after.margin - before.margin;
  const kind = difference > 0 ? 'better' : difference < 0 ? 'worse' : 'same';
  const title = {better: 'Mejora los apoyos', worse: 'Empeora los apoyos', same: 'Mantiene los apoyos'}[kind];
  const warning = {better: '', worse: 'Puede aceptar y aun así empeorar tu votación.' + cost,
    same: 'La votación prevista no mejora.' + cost}[kind];
  return {kind, title, ...margins, warning};
}

const draftFields = new Set(['name', 'seed', 'portrait', 'profile', 'staff', 'commitments', 'positions',
  'province', 'campaignScenario', 'difficulty', 'partyIdentity']);

function checkedDraft(setup, bundle) {
  if (!plain(setup) || Object.keys(setup).some(key => !draftFields.has(key))) return null;
  const source = bundle.campaignBase ?? bundle, config = source.config;
  const result = {};
  for (const key of ['name', 'seed']) if (Object.hasOwn(setup, key)) {
    if (!text(setup[key], key === 'name' ? 40 : 64, true) || setup[key].length > 256) return null;
    result[key] = setup[key].normalize('NFC');
  }
  for (const [key, catalog] of [['profile', config.candidateProfiles], ['campaignScenario', config.campaignScenarios],
    ['difficulty', config.difficulties], ['partyIdentity', config.partyIdentities]]) {
    if (!Object.hasOwn(setup, key)) continue;
    if (typeof setup[key] !== 'string' || !catalog.some(item => item.id === setup[key])) return null;
    result[key] = setup[key];
  }
  if (Object.hasOwn(setup, 'portrait')) {
    if (typeof setup.portrait !== 'string' || !/^portrait-[1-6]$/.test(setup.portrait)) return null;
    result.portrait = setup.portrait;
  }
  for (const [key, catalog] of [['staff', config.staff], ['commitments', config.topics]]) {
    if (!Object.hasOwn(setup, key)) continue;
    const selected = setup[key];
    if (!Array.isArray(selected) || selected.length > 2 || new Set(selected).size !== selected.length
      || selected.some(id => typeof id !== 'string' || !catalog.some(item => item.id === id))) return null;
    result[key] = [...selected];
  }
  if (Object.hasOwn(setup, 'positions')) {
    if (!plain(setup.positions)) return null;
    result.positions = {};
    for (const [id, value] of Object.entries(setup.positions)) {
      const topic = config.topics.find(item => item.id === id);
      if (!topic || typeof value !== 'number' || !(topic.poles || []).some(pole => pole.id === value)) return null;
      result.positions[id] = value;
    }
  }
  if (Object.hasOwn(setup, 'province')) {
    const effective = resolveCampaignBundle(source, result);
    if (typeof setup.province !== 'string' || !source.provinces.districts.some(p => p.id === setup.province)
      || !present(effective.config.parties.find(p => p.id === 'P1'), setup.province)) return null;
    result.province = setup.province;
  }
  return result;
}

export function loadSetupDraft(bundle, storage) {
  try {
    const stored = (storage ?? globalThis.localStorage)?.getItem(SETUP_DRAFT_KEY);
    if (typeof stored !== 'string' || stored.length > 4096) return null;
    const record = JSON.parse(stored);
    if (!plain(record) || Object.keys(record).length !== 3 || record.format !== 'la-campana-setup'
      || record.version !== 1 || !Object.hasOwn(record, 'setup')) return null;
    return checkedDraft(record.setup, bundle);
  } catch { return null; }
}

export function saveSetupDraft(setup, bundle, storage) {
  try {
    const draft = checkedDraft(setup, bundle);
    if (!draft) return {ok: false};
    const destination = storage ?? globalThis.localStorage;
    if (!destination?.setItem) return {ok: false};
    destination.setItem(SETUP_DRAFT_KEY, JSON.stringify({format: 'la-campana-setup', version: 1, setup: draft}));
    return {ok: true};
  } catch { return {ok: false}; }
}
