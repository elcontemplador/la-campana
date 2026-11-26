import {eventConsequences} from './stories.mjs';
import {eventLocalReception} from './local-reception.mjs';

// The campaign engine supplies availability, prices and effects. This view chooses
// which sentence to read first and keeps the full political response in the card.
export function newsDecisionCard(option, story, state, bundle, {esc, fmt, staff, icon, learningText}) {
  const {id, shortLabel, label, effects = [], reserveStaff} = option;
  const availability = option.availability || {available: false, cost: option.cost};
  const {available, cost = {}, requiredReadiness, staffChoices = []} = availability;
  const actors = staffChoices.map(actor => typeof actor === 'string' ? actor : actor.id).filter(Boolean);
  const title = shortLabel || label;
  const speech = story?.optionSpeeches?.[id];
  const intent = story?.optionIntents?.[id];
  const line = story?.newsLines?.[id] || (speech && (speech.length <= 180 || !intent) ? speech : intent) || label;
  const quotes = line === speech;
  const later = story?.optionPlans?.[id];
  const consequence = eventConsequences(option, state, bundle, {omitPreparation: Boolean(requiredReadiness)});
  const reception = eventLocalReception(state, bundle, id);
  const headingId = 'news-title-' + id;
  const infoId = 'news-info-' + id;
  const costId = 'news-cost-' + id;
  const blockId = 'news-block-' + id;

  const prices = [];
  if (cost.budget) prices.push(`${fmt(cost.budget)} de caja`);
  if (cost.energy) prices.push(`${fmt(cost.energy)} de energía`);
  if (requiredReadiness) prices.push(`${fmt(requiredReadiness)} de preparación`);
  if (reserveStaff) prices.push(actors.length === 1 ? `la tarea de ${staff(actors[0])?.name || actors[0]}` : '1 tarea del equipo');
  const price = prices.length ? prices.join(' · ') : 'Sin gastar caja ni energía';

  // The lines can overlap verbatim (in particular the first two headlines).
  // Keep every distinct explanation, with a quotation shown only once.
  const detailParts = [];
  if (speech && !quotes) detailParts.push(`«${speech}»`);
  if (intent && intent !== line) detailParts.push(intent);
  const fullLabel = speech && label.startsWith(speech) ? label.slice(speech.length).trimStart() : label;
  if (fullLabel && ![title, line, intent, speech].includes(fullLabel)) detailParts.push(fullLabel);
  if (option.learning) detailParts.push(learningText(option.learning));
  const poll = reception ? `<p class="local-reception"><strong>${esc(reception.provinceName)}</strong> · ${esc(reception.text)}</p>` : '';
  const detail = detailParts.length || poll ? `<details class="option-more"><summary aria-label="Detalles de ${esc(title)}">Detalles</summary><div class="news-detail-copy">${poll}${detailParts.map(text => `<p>${esc(text)}</p>`).join('')}</div></details>` : '';

  // Costs and likely reactions stay on the face of every choice, including
  // an unfavourable response, a capped gain, and the person this decision uses.
  const noResourceEffect = consequence === 'Sin cambios adicionales de recursos';
  const effect = later || (!noResourceEffect ? consequence : '');
  const signal = later ? 'En el debate' : 'Efectos previstos';
  const glyph = reserveStaff ? 'outreach'
    : effects.some(item => item.type === 'promise_open' || item.type === 'relation') ? 'mediate'
    : effects.some(item => item.type === 'organization') ? 'organize'
    : effects.some(item => ['support', 'topic_support', 'priority_support'].includes(item.type)) ? 'interview'
    : effects.some(item => item.stat === 'readiness') ? 'prepare' : 'rest';
  let staffSelect = '';
  if (reserveStaff && actors.length === 1) {
    staffSelect = `<input type="hidden" id="option-staff-${esc(id)}" value="${esc(actors[0])}">`;
  } else if (reserveStaff && actors.length > 1) {
    staffSelect = `<label class="news-assignment" for="option-staff-${esc(id)}">Quién dedica su tarea<select id="option-staff-${esc(id)}" data-option-staff="${esc(id)}">${actors.map(actor => `<option value="${esc(actor)}">${esc(staff(actor)?.name || actor)}</option>`).join('')}</select></label>`;
  }
  const buttonText = story?.newsVerbs?.[id] || 'Responder';
  return `<article class="option-card news-option${available ? '' : ' blocked'}" aria-labelledby="${esc(headingId)}">
    <div class="option-title"><span class="option-symbol" aria-hidden="true">${icon(glyph)}</span><h3 id="${esc(headingId)}">${esc(title)}</h3></div>
    <div id="${esc(infoId)}">
      ${line && line !== title ? `<p class="news-line${quotes ? ' option-speech' : ''}">${quotes ? '«' : ''}${esc(line)}${quotes ? '»' : ''}</p>` : ''}
      ${effect ? `<p class="option-consequence"><span class="consequence-label${later ? '' : ' sr-only'}">${signal}:</span> ${esc(effect)}</p>` : ''}
    </div>
    <div class="news-price" id="${esc(costId)}">${prices.length ? '<strong>Coste</strong> ' : ''}${esc(price)}</div>
    ${staffSelect}
    ${!available ? `<p class="block-reason" id="${esc(blockId)}">${esc(availability.reason || 'Faltan recursos o personal.')}</p>` : ''}
    <div class="news-card-controls">
      <button type="button" ${available ? 'class="primary"' : 'disabled'} data-option="${esc(id)}" aria-label="${esc(buttonText)} · ${esc(title)}" aria-describedby="${esc(infoId)} ${esc(costId)}${available ? '' : ' ' + esc(blockId)}">${esc(buttonText)} <span aria-hidden="true">→</span></button>
      ${detail}
    </div>
  </article>`;
}
