import {pollJourney,publicCampaignObjective} from './poll-journey.mjs';
import {campaignTactic} from './campaign-tactic.mjs';
import { createGame, dispatch as engineDispatch, getEventView, validatePlan, actionCost, getNegotiationPreview } from '../core/engine.mjs';
import {selectBundle} from '../core/bundles.mjs';
import { exportGame, importGame, saveGame, loadGame } from '../storage/save.mjs';
import { recordCampaign, campaignSummary, previousCampaign, compareCampaigns } from '../storage/history.mjs';
import { resolveCampaignBundle, campaignDefinition, campaignObjective, initialResources, partyIdentityDefinition, campaignCommitments } from '../core/campaign.mjs';
import { idealFor, counterofferOptions, secondBallotOptions } from '../core/negotiation.mjs';
import { canCampaignHere, campaignDestinations, campaignRanking, provinceShortlist, suggestedVisit } from './strategy.mjs';
import { portrait, campaignIllustration, hemicycle, actionScene, actionIcon, boardBackdrop, colorInk, readableColor, TILE_POSITIONS, TILE_NAMES } from './visuals.mjs';
import { suggestCampaignPlan, suggestPactOffers, turnSummary, dialoguePreparation, publicProposalOrder } from './play.mjs';
import { PROVINCE_PATHS, PROVINCE_ANCHORS, MAP_CALLOUTS } from './geography.mjs';
import { actionPreview, campaignOpportunities, electionRevealSteps, featuredRival } from './preview.mjs';
import { newsOutcome } from './news.mjs';
import { newsReaction } from './news-reaction.mjs';
import { rivalStory } from './rival-story.mjs';
import {rivalContest} from './rival-contest.mjs';
import {provinceContest} from './province-contest.mjs';
import { eventStory, eventConsequences } from './stories.mjs';
import {eventLocalReception} from './local-reception.mjs';
import {promiseThreads} from './promises.mjs';
import { finalStory } from './ending.mjs';
import { campaignRecap } from './campaign-recap.mjs';
import { randomQuickSetup } from './setup.mjs';
import { setupIssues, guidedSetupIssues, counterofferAssessment, loadSetupDraft, saveSetupDraft } from './usability.mjs';
import { staffObservations, debateOutcome } from './experience.mjs';
import { staffMemories } from './memory.mjs';
import { debateScene, debateRecap } from './debate.mjs';
import {debateBetStory} from './debate-bet.mjs';
import {debatePreparationText,debateChoiceIntent} from './debate-preparation.mjs';
import { BASIC_TEAM_TASKS, teamTaskLabel, teamTaskPurpose, teamTaskTiming, teamWork } from './team.mjs';
import { teamIntent } from './team-intent.mjs';
import {meetingAgenda} from './meeting-agenda.mjs';
import { pactStory } from './pacts.mjs';
import {pactDecision} from './pact-decision.mjs';
import {turnPulse} from './turn-pulse.mjs';
import {voteRecap} from './vote-recap.mjs';
import { tutorialStep, startTutorial, resumeTutorial, nextTutorial, skipTutorial, loadTutorialProgress, saveTutorialProgress, TUTORIAL_STEP_IDS } from './tutorial.mjs';

import {beginTeamPractice, teamPracticeDraft, submitTeamPractice, teamPracticeResult} from './team-practice.mjs';

const app=document.getElementById('app');
const dialog=document.getElementById('panel-dialog');
const fileInput=document.getElementById('import-file');
const announcement=document.getElementById('announcement');
const toast=document.getElementById('toast');
const nf=new Intl.NumberFormat('es-ES');
const RESERVE_STORAGE_KEY='la-campana-v061-reserve';
let sourceBundle, bundle, state=null, resumeState=null, commandCounter=0, toastTimer, dialogReturnFocus;
let ui={reserveForPacts:true,screen:'home',province:'09',table:false,search:'',sort:'name',plan:null,offer:null,vote:'no',saved:false,storageNotice:'',setup:{name:'',portrait:'portrait-1',profile:'preparacion',staff:['S1','S2'],commitments:['T1','T2'],positions:{},province:'09',seed:'primera-campana',campaignScenario:null,difficulty:null,partyIdentity:null}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>nf.format(Number.isFinite(Number(v))?Number(v):0);
const pct=v=>`${fmt(Math.round(Number(v||0)/10)/10)} %`;
const signed=v=>`${Number(v)>0?'+':''}${fmt(v)}`;
const party=id=>bundle.config.parties.find(p=>p.id===id);
const district=id=>bundle.provinces.districts.find(p=>p.id===id);
const staff=id=>bundle.config.staff.find(p=>p.id===id);
const civil=id=>bundle.config.civilActors.find(p=>p.id===id);
const topic=id=>bundle.config.topics.find(p=>p.id===id);
const resourceLabels={budget:'Caja',energy:'Energía',cohesion:'Cohesión',reputation:'Reputación',readiness:'Preparación',organization:'Organización',relation:'Relación'};
const currentPresentation=()=>['0.8.3','0.8.4','0.8.5'].includes(state?.rulesVersion)&&['0.8.3','0.8.4','0.8.5'].includes(state?.contentVersion);
const staffLabels={analysis:'Análisis',organization:'Organización',communication:'Comunicación',relations:'Relaciones'};
const staffVoices={S1:'«¿Qué sabemos y qué estamos suponiendo?»',S2:'«Bien. ¿Quién se encarga y cuándo?»',S3:'«Hay que decirlo sin rodeos.»',S4:'«Escuchemos qué necesitan para acordarlo.»'};
const profileText={preparacion:{bonus:'Cada ensayo del equipo aporta una ficha más de preparación.',drawback:'Las visitas cuestan 2 de energía adicionales.'},conexion:{bonus:'El primer avance civil del turno mejora un punto más.',drawback:'Afinar sondeo cuesta 1 de caja adicional.'},coordinacion:{bonus:'Encargar una noticia al equipo refuerza su cohesión.',drawback:'Medios cuesta 2 de energía adicionales.'}};
const voteLabels={yes:'Sí',no:'No',abstain:'Abstención'};
const promiseLabels={C1_REPLY:'Respuesta a Mesa Abierta',C2_REVIEW:'Aclaración para Taller Cívico'};
const promiseStatus={open:'Pendiente',fulfilled:'Cumplida',reduced:'Alcance renegociado',missed:'Sin entregar'};
const validSeed=v=>typeof v==='string' && v.normalize('NFC').trim().length>0 && v.normalize('NFC').trim().length<=64 && !/[\u0000-\u001f\u007f]/.test(v);

function paletteStyle(color){
  return `--party:${color};--party-ink:${colorInk(color)};--party-readable:${readableColor(color)};--party-outline:${readableColor(color)}`;
}
function partyColor(id){
  const value=party(id)?.color||bundle?.config?.partyColors?.[id];
  return /^#[0-9a-f]{6}$/i.test(value||'')?value:'#666666';
}
function partyPalette(){
  return Object.fromEntries((bundle?.config?.parties||[]).map(p=>[p.id,partyColor(p.id)]));
}
function partyStyle(id){
  return paletteStyle(partyColor(id));
}
function mark(id){
  return `<span class="party-mark" style="${partyStyle(id)}" aria-hidden="true">${esc(partyShort(id))}</span>`;
}
function partyBadge(id,short=false,withIdeology=false){
  const meta=party(id);
  return `<span class="party-badge">${mark(id)}<span>${esc(short?partyShort(id):meta?.name||id)}${withIdeology&&meta?.ideology?`<small class="party-badge-ideology">${esc(meta.ideology)}</small>`:''}</span></span>`;
}
function brand(){return `<div class="brand"><svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect x="2" y="2" width="32" height="32" rx="8" fill="#315b70"/><path d="M10 25V15L18 10L26 15V25M9 25H27M13 25V17H23V25M18 17V25" stroke="#fcfaf4" stroke-width="2" stroke-linecap="round"/></svg><div>La campaña<small>España en juego</small></div></div>`;}
function header(game=false){const wide=!matchMedia('(max-width:760px)').matches;return `<header class="site-header ${game?'game-header':''}">${brand()}<nav class="header-nav" aria-label="Herramientas de campaña">${game?`<details class="tools-menu" ${wide?'open':''} data-wide="${wide}"><summary>Campaña ▾</summary><div class="header-tools"><button type="button" class="text-button" data-act="history">Historial</button><button type="button" class="text-button" data-act="rivals">Rivales</button><button type="button" class="text-button" data-act="team">Equipo</button><button type="button" class="text-button" data-act="export" aria-label="Guardar archivo de partida">Guardar</button></div></details>`:'<span class="edition">Prototipo local</span>'}<button type="button" class="text-button" data-act="help">Cómo jugar</button>${game?'<button type="button" class="text-button" data-act="tutorial-resume">Guía</button>':''}${game?'<button type="button" class="text-button" data-act="home">Inicio</button>':''}</nav></header>`;}
function footer(){return `<footer class="site-footer"><p>Una campaña ficticia en la España de 350 escaños. ${state?ui.saved?'Partida guardada en este navegador.':'Exporta la partida para conservarla.':'Sin cuentas. Tu partida permanece en este navegador.'}</p><a href="./credits.html" target="_blank" rel="noopener noreferrer">Créditos y fuentes ↗</a></footer>`;}
function costLine(cost={},reserved=false,compact=false){return `<div class="cost-line"><span class="cost-chip">${compact?`${fmt(cost.budget||0)} caja`:Number(cost.budget||0)===0?'Sin gasto':`${fmt(cost.budget)} caja`}</span><span class="cost-chip">${compact?`${fmt(cost.energy||0)} energía`:Number(cost.energy||0)===0?'Sin desgaste':`${fmt(cost.energy)} energía`}</span>${reserved?`<span class="cost-chip">${typeof reserved==='string'?esc(reserved):compact?'Ocupa una tarea del equipo':'Ocupa una acción de equipo'}</span>`:''}</div>`;}
function resourceHeader(){const p=state.parties.P1;return `<div class="resource-header"><div class="campaign-person"><div class="mini-portrait">${partyPortrait('P1')}</div><div><strong>${esc(state.candidate.name)}</strong><small>${esc(party('P1')?.name)} · ${esc(bundle.config.candidateProfiles.find(x=>x.id===state.candidate.profile)?.label||'')}</small></div></div><div class="resources" aria-label="Recursos de la campaña">${['budget','energy','cohesion','reputation','readiness'].map(k=>{const max=bundle.config.resources[k].max, val=Number(p[k]||0);return `<div class="resource"${k==='cohesion'&&['0.8.4','0.8.5'].includes(state.rulesVersion)?' title="La coordinación mejora o reduce el alcance de Visitar y Medios; 60 es el nivel habitual."':''}><span class="resource-label">${resourceLabels[k]}</span><strong>${fmt(val)}<small>/${fmt(max)}</small></strong><div class="meter" aria-hidden="true" style="--fill:${Math.max(0,Math.min(100,val/max*100))}%"><span></span></div></div>`;}).join('')}</div></div>`;}
function steps(){const campaign=['event','planning','debrief'].includes(state.phase);return `<div class="steps" aria-label="${campaign?`Turno ${state.turn} de ${bundle.config.turns}`:'Campaña terminada'}">${Array.from({length:bundle.config.turns},(_,i)=>`<span aria-hidden="true" class="step ${i+1<state.turn||!campaign?'passed':i+1===state.turn?'current':''}"></span>`).join('')}<span>${campaign?`Turno ${state.turn} / ${bundle.config.turns}`:state.phase==='election'?'Noche electoral':state.phase==='negotiation'?'Investidura':'Balance de campaña'}</span></div>`;}
function phaseHeading(label,title,body='',extra=''){return `<div class="phase-heading"><div><p class="eyebrow">${esc(label)}</p><h1 class="phase-title" tabindex="-1" id="phase-heading">${esc(title)}</h1>${body?`<p class="lead">${esc(body)}</p>`:''}</div>${extra}</div>`;}
function mountToast(){const host=document.querySelector('#panel-dialog[open]')||document.getElementById('main');if(host)host.prepend(toast);}
function toastMessage(message,error=false){clearTimeout(toastTimer);mountToast();toast.textContent=message;toast.setAttribute('role',error?'alert':'status');toast.hidden=false;if(error)toast.scrollIntoView({block:'nearest',behavior:'instant'});toastTimer=setTimeout(()=>{toast.hidden=true;},error?8500:4800);}
function announce(message){announcement.textContent='';queueMicrotask(()=>{announcement.textContent=message;});}
function focusHeading(){document.querySelector('#phase-heading, #main h1')?.focus({preventScroll:true});}
function render(focus=false){if(sourceBundle)bundle=resolveCampaignBundle(sourceBundle,ui.screen==='setup'?ui.setup:state||ui.setup);document.title=state&&ui.screen==='game'?`Turno ${state.turn} · La campaña`:'La campaña · España en juego';if(ui.screen==='home')app.innerHTML=homeView();else if(ui.screen==='setup')app.innerHTML=setupView();else app.innerHTML=gameView();mountToast();if(ui.screen==='setup'){rememberSetup();applySetupStep();}if(focus)focusHeading();}

function partyShort(id){
  const current=party(id);
  const original=sourceBundle?.config?.parties.find(p=>p.id===id);
  if(current?.short||current?.shortName||current?.abbreviation)return current.short||current.shortName||current.abbreviation;
  if(current?.name&&current.name!==original?.name)return current.name.split(/\s+/).map(word=>word[0]).join('').slice(0,3).toUpperCase();
  return current?.identityId?.slice(0,2).toUpperCase()||id;
}
function scenarioLabel(){return campaignDefinition(sourceBundle,state||ui.setup).label;}
function legacyNoticeView(){return state.rulesVersion!==sourceBundle.config.rulesVersion||state.contentVersion!==sourceBundle.content.version?`<p class="note legacy-notice">Campaña anterior · contenido ${esc(state.contentVersion)}. Conserva sus decisiones y sus reglas. Las nuevas historias se usan al empezar otra partida personalizada.</p>`:'';}
function difficultyLabel(){const id=state?.initialSetup?.difficulty||ui.setup.difficulty;return sourceBundle.config.difficulties.find(x=>x.id===id)?.label||id;}
function objectiveView(){
  const objective=publicCampaignObjective(state,sourceBundle),journey=pollJourney(state,sourceBundle);
  if(journey&&state.phase!=='ending')objective.progress=journey.label;
  if(state.phase==='election'&&Number(ui.revealIndex||0)<electionRevealSteps(state,sourceBundle).length){
    objective.progress='Descubriendo el resultado provincial';
    objective.details=['El resultado completo aparecerá al terminar el recuento o al saltarlo.'];
  }
  const complete=state.phase==='ending',compact=state.phase==='planning'||state.phase==='event';
  return `<section class="campaign-objective ${journey?'has-poll-journey':''} ${complete?'objective-final':''} ${complete&&objective.achieved?'achieved':''}" aria-labelledby="campaign-objective-title">
    <div>${compact?'':`<p class="eyebrow">${esc(scenarioLabel())} · ${esc(difficultyLabel())}</p>`}<h2 id="campaign-objective-title">${esc(objective.title)}</h2><p class="objective-progress">${esc(objective.progress)}</p>${complete&&journey?`<p class="poll-journey-final">${esc(journey.label)}</p>`:''}</div>
    <div class="objective-context"><span class="badge">${complete?objective.achieved?'Objetivo conseguido':'Objetivo pendiente':'Tu reto'}</span><details><summary>${complete?'Ver el balance del objetivo':'Qué necesitas conseguir'}</summary>${compact?`<p class="objective-context-label">${esc(scenarioLabel())} · ${esc(difficultyLabel())}</p>`:''}<p>${esc(objective.description)}</p>${journey?`<p class="poll-journey-note">${esc(journey.note)}</p>`:''}${objective.details.length?`<ul>${objective.details.map(detail=>`<li>${esc(detail)}</li>`).join('')}</ul>`:''}</details></div>
  </section>`;
}
function partyPicker(){
  const identities=sourceBundle.config.partyIdentities||[];
  const selected=partyIdentityDefinition(sourceBundle,ui.setup);
  return `<section class="party-selection" aria-labelledby="party-choice-title"><fieldset><legend id="party-choice-title">Tu partido</legend><div class="party-options">${identities.map(identity=>`<label class="party-choice" style="${paletteStyle(identity.color)}"><input type="radio" name="party-identity" data-setup="partyIdentity" value="${esc(identity.id)}" ${ui.setup.partyIdentity===identity.id?'checked':''}><span class="party-choice-chip" aria-hidden="true">${esc(identity.short)}</span><span class="party-choice-copy"><strong>${esc(identity.name)}</strong><small>${esc(identity.ideology)}</small></span></label>`).join('')}</div></fieldset><p class="party-play-hint">${esc(selected?.playHint||selected?.summary||'Elige una identidad y adapta después tus posturas y prioridades.')}</p></section>`;
}
function applyPartyPreset({resetProvince=false}={}){
  bundle=resolveCampaignBundle(sourceBundle,ui.setup);
  const identity=partyIdentityDefinition(sourceBundle,ui.setup);
  ui.setup.commitments=[...campaignCommitments(sourceBundle,ui.setup)];
  ui.setup.positions={...(identity?.positions||defaultPositions())};
  if(resetProvince)ui.setup.province=campaignDefinition(sourceBundle,ui.setup).initialProvince;
}
function scenarioPicker(){
  return `<section class="campaign-selection" aria-labelledby="scenario-title"><fieldset><legend id="scenario-title">Elige el reto de tu campaña</legend><div class="scenario-options">${sourceBundle.config.campaignScenarios.map(scenario=>`<label class="scenario-choice"><input type="radio" name="campaign-scenario" data-setup="campaignScenario" value="${esc(scenario.id)}" ${ui.setup.campaignScenario===scenario.id?'checked':''}><span><strong>${esc(scenario.label)}</strong>${scenario.id==='abierta'?'<span class="setup-recommendation">Para empezar</span>':''}<small>${esc(scenario.tagline)}</small></span></label>`).join('')}</div></fieldset><fieldset class="difficulty-selection"><legend>Elige la dificultad</legend><div class="difficulty-options">${sourceBundle.config.difficulties.map(difficulty=>`<label class="difficulty-choice"><input type="radio" name="campaign-difficulty" data-setup="difficulty" value="${esc(difficulty.id)}" ${ui.setup.difficulty===difficulty.id?'checked':''}><span><strong>${esc(difficulty.label)}</strong>${difficulty.id==='iniciacion'?'<span class="setup-recommendation">Para empezar</span>':''}<small>${esc(({iniciacion:'Más recursos y tu primera propuesta de investidura. Para conocer el juego.',normal:'Recursos ajustados y rivales que disputan tus provincias.',exigente:'Menos margen de error: rivales con más caja y mejores sondeos.'})[difficulty.id]||difficulty.description)}</small></span></label>`).join('')}</div></fieldset><details class="setup-context"><summary>Tu punto de partida · ${esc(campaignDefinition(sourceBundle,ui.setup).objective.title)}</summary>${scenarioBrief()}</details></section>`;
}
function regionalAgenda(value=state||ui.setup){
  const definition=campaignDefinition(sourceBundle,value);
  const identityId=value?.initialSetup?.partyIdentity||value?.partyIdentity;
  return definition.priorityOverrides?.find(item=>item.partyIdentity===identityId)?.description||'';
}
function scenarioBrief(){
  const definition=campaignDefinition(sourceBundle,ui.setup);
  const player=party('P1');
  const destinations=campaignDestinations(bundle);
  const budget=initialResources(sourceBundle,ui.setup,'P1').budget;
  return `<div class="campaign-brief"><div><p class="eyebrow">Tu posición de partida · ${esc(player.name)}</p><h2>${esc(definition.objective.title)}</h2><p>${esc(definition.description)}</p>${regionalAgenda(ui.setup)?`<p class="regional-agenda">${esc(regionalAgenda(ui.setup))}</p>`:''}<p class="brief-target"><strong>Tu misión:</strong> ${esc(definition.objective.description)}</p></div><dl><div><dt>Caja inicial</dt><dd>${fmt(budget)}</dd></div><div><dt>Ámbito de campaña</dt><dd>${player.eligibility==='all'?'Todo el país':destinations.map(p=>esc(p.name)).join(', ')}</dd></div></dl><p class="small muted">${player.eligibility==='all'?'Puedes hacer campaña en las 52 circunscripciones.':'Puedes inspeccionar todo el mapa. Las visitas, la organización y la publicidad provincial se limitan a tu ámbito.'} Los objetivos electorales se confirman en el recuento; los acuerdos, en la investidura.</p></div>`;
}
function shortlistView(){
  const items=provinceShortlist(state.publishedPolls?.P1,bundle.provinces.districts);
  if(!items.length)return '';
  return `<section class="province-shortlist" aria-labelledby="shortlist-title"><h3 id="shortlist-title">Tres márgenes que conviene mirar</h3><div>${items.map(item=>`<button type="button" data-province="${item.provinceId}" aria-pressed="${ui.province===item.provinceId}" class="shortlist-choice ${item.kind}"><span class="shortlist-kind">${item.kind==='attack'?'Ganar otro escaño':'Defender un escaño'}</span><strong>${esc(item.provinceName)}</strong><span>${fmt(item.votes)} votos estimados · ${esc(party(item.against)?.name||item.against)}</span></button>`).join('')}</div><p class="poll-caption">Los márgenes más estrechos del sondeo propio. Son pistas para decidir, no votos seguros.</p></section>`;
}
function playerOpportunityView(poll){
  const opportunity=poll?.opportunity;
  if(!opportunity?.present)return '<p class="scope-note">Tu candidatura no se presenta en esta circunscripción. Puedes seguir el sondeo y los movimientos de sus partidos.</p>';
  return `<div class="player-opportunity"><strong>Tu candidatura: ${fmt(opportunity.seats)} ${opportunity.seats===1?'escaño estimado':'escaños estimados'}</strong>${opportunity.attack?`<p><span class="opportunity-tag">Ganar</span> El siguiente escaño necesita unos <b>${fmt(opportunity.attack.votesNeeded)} votos más</b> frente a ${esc(party(opportunity.attack.against)?.name||opportunity.attack.against)}.</p>`:''}${opportunity.defense?`<p><span class="opportunity-tag defense">Defender</span> Con unos <b>${fmt(opportunity.defense.votesMargin)} votos propios menos</b>, tu escaño más ajustado pasaría a ${esc(party(opportunity.defense.against)?.name||opportunity.defense.against)}.</p>`:''}<small>Comparación del sondeo manteniendo constante el resto de votos. Las acciones y las jugadas rivales pueden cambiarla.</small></div>`;
}
function proposalOrderView(){
  const projected=publicProposalOrder(state,sourceBundle),seats=projected.seats;
  const firstPlayer=!!bundle.config.negotiation.playerFirstProposal;
  const order=state.negotiation?.proponents||projected.ids;
  return `<div class="proposal-order"><strong>Orden de propuestas en esta partida</strong><ol>${order.map(id=>`<li ${id===state.negotiation?.proponent?'aria-current="step"':''}>${partyBadge(id)}<span>${fmt(seats[id])} esc.</span></li>`).join('')}</ol><p class="small muted">${firstPlayer?'En iniciación, tu candidatura propone primero si tiene escaños; después lo hacen las mayores candidaturas restantes.':'Las candidaturas con más escaños presentan primero. El orden y el límite de tres propuestas son convenciones del juego.'} Este orden no representa el procedimiento legal de designación de candidatos.</p></div>`;
}

function homeView(){return `${header()}<main id="main" tabindex="-1" class="home">${storageNoticeView()}<div class="hero"><div><span class="hero-tag">Tu campaña empieza contigo</span><h1 tabindex="-1">Tu partido.<br>Tu candidato.<br>Tu campaña.</h1><p class="lead">Elige a quién representar, reúne tu equipo y planta cara a tus rivales. ${fmt(sourceBundle.config.turns)} turnos para ganar escaños y buscar un acuerdo.</p><div class="button-row"><button type="button" class="primary play-now" data-act="new">Partida personalizada →</button>${resumeState?'<button type="button" data-act="resume">Continuar partida</button>':''}</div><p class="quick-start-note">Elige partido, candidato y equipo. Para empezar: Campaña abierta · Iniciación.</p><div class="home-secondary"><button type="button" class="text-button" data-act="quick-start">Partida rápida aleatoria</button><button type="button" class="text-button" data-act="import">Importar partida</button></div><p class="random-start-note">La rápida sortea partido, candidato y equipo; juega en Iniciación.</p></div><div class="hero-illustration">${campaignIllustration(sourceBundle.config.partyColors)}</div></div><div class="home-facts"><div><strong>Dale identidad</strong><span>tu color, tu candidato, tus prioridades</span></div><div><strong>Planta cara</strong><span>cinco rivales mueven ficha</span></div><div><strong>Busca el pacto</strong><span>ganar votos es el comienzo</span></div></div></main>${footer()}`;}
function storageNoticeView(){return ui.storageNotice?`<p class="note warning storage-notice" role="status">${esc(ui.storageNotice)} ${state?'<button type="button" data-act="export">Guardar archivo</button>':'<button type="button" data-act="import">Importar partida</button>'}</p>`:'';}
function rememberSetup(){saveSetupDraft(ui.setup,sourceBundle);}
function setupReadinessView(){const issues=guidedSetupIssues(ui.setup,{step:Number(ui.setupStep||0),all:!!ui.setupAll});return issues.length?`<strong>Antes de empezar</strong><ul>${issues.map(i=>`<li><a href="${i.target}" data-setup-issue="${i.target}">${esc(i.message)}</a></li>`).join('')}</ul>`:setupIssues(ui.setup).length?'<p class="setup-ready">Revisa este paso y continúa. Completarás tu candidatura antes de empezar.</p>':`<p class="setup-ready"><strong>${esc(ui.setup.name.trim())}</strong> · ${esc(party('P1')?.name)}<br>${esc(ui.setup.staff.map(id=>staff(id)?.name).join(' y '))} te acompañarán.</p>`;}
function updateSetupReadiness(){const issues=setupIssues(ui.setup),status=document.getElementById('setup-readiness'),button=document.querySelector('[data-act="start"]');if(status)status.innerHTML=setupReadinessView();if(button)button.disabled=issues.length>0;for(const id of ['candidate-name','campaign-seed']){const input=document.getElementById(id);if(input)input.setAttribute('aria-invalid',String(issues.some(i=>i.target==='#'+id)));}rememberSetup();applySetupStep();}
function resetCampaignView(incoming){ui.teamPractice=null;ui.revealIndex=0;ui.counterofferId=null;ui.actorDetails={};ui.staffPalette={};ui.folds={};ui.teamMode='auto';ui.teamChangeNotice='';ui.editingStaff=null;ui.plan=null;ui.offer=null;ui.opportunityKind=null;ui.table=false;ui.search='';ui.sort='name';ui.vote=incoming?.negotiation?.proponent==='P1'?'yes':'no';ui.province=incoming?.focusProvince||ui.setup.province;}
function setupGuide(){return `<aside class="setup-guide" aria-label="Ayuda para crear tu primera campaña"><div><strong>Tu campaña, en cuatro pasos</strong><p>Revisa cada elección. Campaña abierta e Iniciación te dan margen para aprender.</p></div><nav aria-label="Pasos de creación">${['Partido','Candidato','Equipo y programa','Reto y dificultad'].map((label,i)=>`<button type="button" data-act="setup-step" data-step="${i}" aria-current="${!ui.setupAll&&(ui.setupStep||0)===i?'step':'false'}">${i+1}. ${label}</button>`).join('')}<button type="button" class="text-button" data-act="setup-all">${ui.setupAll?'Volver a los pasos':'Ver toda la configuración'}</button></nav></aside>`;}
function applySetupStep(){
  const step=Number(ui.setupStep||0),all=!!ui.setupAll;
  const groups=['.party-selection','.setup-grid>section','.setup-grid>div','.campaign-selection'];
  groups.forEach((selector,i)=>{const el=document.querySelector(selector);if(el)el.hidden=!all&&step!==i;});
  const grid=document.querySelector('.setup-grid');if(grid)grid.hidden=!all&&![1,2].includes(step);
  const start=document.querySelector('[data-act="start"]'),next=document.querySelector('[data-act="setup-next"]');
  if(start)start.hidden=!all&&step!==3;
  if(next){next.hidden=all||step===3;next.textContent=['Siguiente · Candidato →','Siguiente · Equipo y programa →','Siguiente · Reto y dificultad →'][step]||'Siguiente →';next.disabled=step===1&&!ui.setup.name.trim()||step===2&&(ui.setup.staff.length!==2||ui.setup.commitments.length!==2);}
}
function advanceSetup(){
  if(ui.setupAll||Number(ui.setupStep||0)===3)return false;
  const step=Number(ui.setupStep||0);
  if(step===1&&!ui.setup.name.trim()){document.getElementById('candidate-name')?.focus();announce('Pon nombre a tu candidato para seguir.');return true;}
  if(step===2&&(ui.setup.staff.length!==2||ui.setup.commitments.length!==2)){announce('Elige dos colaboradores y dos prioridades para seguir.');return true;}
  ui.setupStep=step+1;render();document.querySelector(`[data-act="setup-step"][data-step="${ui.setupStep}"]`)?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});return true;
}
function defaultPositions(){return Object.fromEntries(bundle.config.topics.map(t=>[t.id,Number(party('P1')?.positions?.[t.id]??t.poles?.[0]?.id??-1)]));}
function setupView(){const s=ui.setup;const valid=setupIssues(s).length===0;return `${header()}<main id="main" tabindex="-1" class="setup"><div class="setup-title"><div><p class="eyebrow">Tu candidatura · ${esc(party('P1')?.name)}</p><h1 tabindex="-1">Dale identidad a tu campaña.</h1><p class="muted">Elige tu partido. Crea tu candidato. Decide con quién vas a ganar.</p></div><div class="setup-preview">${portrait(s.portrait,'candidate','confident',partyColor('P1'),partyShort('P1'))}</div></div>${setupGuide()}<form id="campaign-setup" novalidate><div class="setup-summary"><div id="setup-readiness" aria-live="polite">${setupReadinessView()}</div><div class="button-row"><button type="button" class="secondary" data-act="home">Volver</button><button type="button" class="primary" data-act="setup-next">Siguiente →</button><button type="submit" class="primary" data-act="start" aria-describedby="setup-readiness" ${valid?'':'disabled'}>Abrir la sala de campaña →</button></div></div>${partyPicker()}<div class="setup-grid"><section class="paper-card" aria-labelledby="candidate-title"><h2 id="candidate-title">Dale identidad al candidato</h2><div class="field"><label for="candidate-name">Nombre</label><input id="candidate-name" data-setup="name" value="${esc(s.name)}" maxlength="40" autocomplete="off" placeholder="¿Cómo te llamas?" aria-describedby="setup-readiness" aria-invalid="${!valid&&setupIssues(s).some(i=>i.target==='#candidate-name')}" required><p class="hint">Nombre y retrato dan identidad; el perfil decide tus ventajas.</p></div><fieldset class="field"><legend>Retrato</legend><div class="portraits">${Array.from({length:6},(_,i)=>`<button type="button" class="portrait-choice" data-portrait="portrait-${i+1}" aria-label="Retrato ${i+1}" aria-pressed="${s.portrait===`portrait-${i+1}`}">${portrait(`portrait-${i+1}`,'candidate','confident',partyColor('P1'),partyShort('P1'))}</button>`).join('')}</div></fieldset><fieldset class="field"><legend>Tu forma de trabajar</legend>${bundle.config.candidateProfiles.map(p=>`<label class="choice-card"><input type="radio" name="profile" value="${esc(p.id)}" data-setup="profile" ${s.profile===p.id?'checked':''}><span><strong>${esc(p.label)}</strong><small>${esc(profileText[p.id]?.bonus||'')}<br>${esc(profileText[p.id]?.drawback||'')}</small></span></label>`).join('')}</fieldset><div class="grid-two"><div class="field"><label for="starting-province">Punto de partida</label><select id="starting-province" data-setup="province">${provinceOptions(s.province,true)}</select></div><div class="field"><label for="campaign-seed">Clave de campaña</label><div class="campaign-key-controls"><input id="campaign-seed" data-setup="seed" value="${esc(s.seed)}" maxlength="64" spellcheck="false" aria-describedby="campaign-key-hint setup-readiness"><button type="button" class="secondary" data-act="new-story-key">Generar otra clave</button></div><p id="campaign-key-hint" class="hint">Misma clave y candidatura para comparar estrategias. Otra clave cambia el punto de partida; conserva tu candidato y programa.</p></div></div></section><div><section class="paper-card" aria-labelledby="staff-title"><h2 id="staff-title" tabindex="-1">Elige tu equipo <span class="selection-counter">${s.staff.length} / 2</span></h2><p class="hint">Elige dos. Para cambiar a alguien, desmarca una selección primero.</p><div class="staff-select">${bundle.config.staff.map(p=>`<label class="choice-card staff-choice"><input type="checkbox" data-staff="${esc(p.id)}" ${s.staff.includes(p.id)?'checked':''}><div class="staff-avatar">${portrait(p.id,'staff')}</div><span><strong>${esc(p.name)}</strong><small>${esc(staffLabels[p.specialty]||p.specialty)}</small><small>${esc(staffVoices[p.id]||'')}</small><small>${esc(staffBonus(p))}</small></span></label>`).join('')}</div></section><section class="paper-card section-gap" aria-labelledby="topics-title"><h2 id="topics-title" tabindex="-1">Lo que vas a defender</h2>${bundle.config.topics.some(t=>t.poles)?`<div class="positions">${bundle.config.topics.map(t=>`<fieldset class="position-group"><legend>${esc(t.name)}</legend><div class="position-poles">${(t.poles||[]).map(p=>`<label class="pole-choice"><input type="radio" name="position-${esc(t.id)}" data-position="${esc(t.id)}" value="${esc(p.id)}" ${Number(s.positions[t.id])===Number(p.id)?'checked':''}><span>${esc(p.label)}</span></label>`).join('')}</div></fieldset>`).join('')}</div>`:''}<fieldset><legend>Dos prioridades irrenunciables <span class="selection-counter">${s.commitments.length} / 2</span></legend><p class="hint">Marca dos prioridades. Desmarca una para sustituirla.</p><div class="topic-grid">${bundle.config.topics.map(t=>`<label class="choice-card"><input type="checkbox" data-commitment="${esc(t.id)}" ${s.commitments.includes(t.id)?'checked':''}><span><strong>${esc(t.name)}</strong></span></label>`).join('')}</div><p class="hint small muted section-gap">En la investidura podrás mantenerlas o revisar su alcance. Esa decisión tendrá consecuencias.</p></fieldset></section></div></div>${scenarioPicker()}</form></main>${footer()}`;}
function staffBonus(p){if(p.bonus?.discountBudget)return `${p.bonus.discountBudget} menos de gasto en ${p.bonus.action==='research'?'Afinar sondeo':'Organizar voluntarios'}.`;if(p.bonus?.extraReadiness)return `Ensayar intervención suma ${p.bonus.extraReadiness} ficha extra.`;if(p.bonus?.extraRapport)return `Reunirse con una asociación mejora ${p.bonus.extraRapport} punto extra la relación.`;return '';}
function provinceOptions(selected,onlyCampaign=true){return (onlyCampaign?campaignDestinations(bundle):[...bundle.provinces.districts].sort((a,b)=>a.name.localeCompare(b.name,'es'))).map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)} · ${p.seats} ${p.seats===1?'escaño':'escaños'}</option>`).join('');}
function gameView(){let content;try{content=state.phase==='event'?eventView():state.phase==='planning'?planningView():state.phase==='debrief'?debriefView():state.phase==='election'?electionView():state.phase==='negotiation'?negotiationView():state.phase==='ending'?endingView():`<div class="note error">No se reconoce esta fase. Exporta la partida para conservarla.</div>`;}catch(error){console.error('Interfaz de campaña:',error);content='<div class="note error" role="alert">No se ha podido mostrar esta pantalla. Puedes guardar el archivo de partida y regresar al inicio.</div>';}return `${header(true)}<main id="main" tabindex="-1" class="game-shell phase-${esc(state.phase)} ${state.phase==='event'&&state.activeEvent==='E07'?'debate-live':''}">${storageNoticeView()}${legacyNoticeView()}${resourceHeader()}${['planning','debrief'].includes(state.phase)?`<div class="planning-briefline">${steps()}${objectiveView()}</div>`:`${steps()}${objectiveView()}`}${state.phase==='planning'?'':newsOutcomeView()}${content}${!['planning','debrief'].includes(state.phase)?tutorialView():''}</main>${footer()}`;}
function effectsText(effects=[]){return effects.map(e=>{if(typeof e==='string')return e;if(e.type==='stat')return `${resourceLabels[e.stat]||e.stat} ${signed(e.delta)}`;if(e.type==='rapport')return `${civil(e.target)?.name||e.target} ${signed(e.delta)} relación`;if(e.type==='relation')return `${party(e.target)?.name||e.target} ${signed(e.delta)} relación`;if(e.type==='organization')return 'Organización local +1';if(e.type==='support')return `${e.delta>0?'Más':'Menos'} alcance ${e.target==='national'?'nacional':`en ${district(e.target)?.name||'tu provincia'}`}`;if(e.type==='promise_open')return 'Queda una respuesta pendiente';if(e.type==='promise_close')return e.status==='fulfilled'?'Resuelves las respuestas pendientes':e.status==='reduced'?'Renegocias su alcance':'Cierras la respuesta sin entregarla';return null;}).filter(Boolean).join(' · ');}
function debatePreparationView(){
  const amount=Number(state.parties.P1.readiness||0),max=bundle.config.resources.readiness.max;
  return `<div class="debate-preparation" role="status" aria-label="${amount} de ${max} fichas de preparación"><strong>${amount} ficha${amount===1?'':'s'} de preparación</strong><span aria-hidden="true">${Array.from({length:max},(_,i)=>`<i class="${i<amount?'ready':''}"></i>`).join('')}</span></div>`;
}
function debateMemory(view){
  const debate=debateScene(state,sourceBundle);
  return debate?.previousLine?`<details class="debate-memory"><summary>Tu respuesta anterior</summary><p>${esc(debate.previousLine)}</p></details>`:'';
}
function debateCastView(view){
  return `<div class="debate-cast"><div class="debate-moderator">${portrait('portrait-6','candidate','thinking','#6C7572','TV')}<span>Moderador</span></div><span class="debate-microphone" aria-hidden="true">${actionIcon('interview')}</span><div class="debate-protagonist" style="${partyStyle('P1')}">${partyPortrait('P1')}<strong>${esc(state.candidate.name)}</strong><span>${esc(party('P1')?.name)}</span></div><div class="debate-rival" style="${partyStyle('P2')}">${partyPortrait('P2')}<strong>${esc(party('P2')?.name)}</strong><span>Tu rival en el debate</span></div></div>${debatePreparationView()}${debateMemory(view)}`;
}
function debateOptionPreparation(option){
  return `<p class="debate-option-preparation">${esc(debatePreparationText(option,state,sourceBundle))}</p>`;
}

function eventSpeakerView(story){const speaker=story?.speaker;if(!speaker)return '';const face=speaker.kind==='party'?partyPortrait(speaker.id):speaker.kind==='spokesperson'?portrait('portrait-5','candidate','thinking',partyColor('P1'),'R'):speaker.kind==='team'?portrait(state.selectedStaff[0],'staff'):portrait(speaker.kind==='civil'?speaker.id:speaker.kind==='public'?'portrait-4':'portrait-6','candidate','thinking','#6C7572',speaker.kind==='civil'?'C':speaker.kind==='public'?'?':'TV');return `<div class="story-speaker"><div class="speaker-face" aria-hidden="true">${face}</div><div><strong>${esc(speaker.name)}</strong><small>${esc(speaker.role)}</small></div></div>`;}
function contradictionMessagesView(story){
  return story?.messages?.length ? `<div class="campaign-messages" aria-label="Los mensajes de campaña">${story.messages.map(message=>`<blockquote class="debate-challenge news-public-proposal"${message.partyId?` style="${partyStyle(message.partyId)}" data-message-party="${esc(message.partyId)}"`:''}><strong>${esc(message.label)}</strong><p>«${esc(message.text)}»</p></blockquote>`).join('')}</div>` : '';
}
function eventView(){
  const view=getEventView(state,sourceBundle),story=eventStory(state,sourceBundle);if(story){Object.assign(story.stage&&view.stage?view.stage:view.event,{title:story.title,shortBody:story.shortBody,body:story.body});for(const o of view.options){if(story.optionLabels[o.id])o.shortLabel=story.optionLabels[o.id];if(story.optionDetails?.[o.id])o.label=story.optionDetails[o.id];}}const ev=view.event,scene=view.stage||ev,stages=ev.stages||[],debate=stages.length?debateScene(state,sourceBundle):null,antecedent=debate?.antecedent??story?.antecedent;
  return `${stages.length?'<div class="debate-heading">':''}${phaseHeading(stages.length?`Debate · momento ${view.index+1} de ${stages.length}`:'Algo ha pasado',scene.title||ev.title,'',`<span class="badge">${esc(stages.length?'Debate nacional':district(state.focusProvince)?.name||'Tu campaña')}</span>`)}${stages.length?`<div class="debate-stages" aria-label="Etapas del debate">${stages.map((s,i)=>`<span class="debate-stage ${i===view.index?'active':i<view.index?'done':''}" ${i===view.index?'aria-current="step"':''}>${i+1}. ${esc(debate?.stageTitles[i]||s.title)}${i<view.index?' ✓':''}</span>`).join('')}</div>`:''}${stages.length?'</div>':''}<div class="event-layout compact-event ${stages.length?'debate-event':'choice-event'}"><section class="event-scene ${story?'story-'+story.format:''}${story?.promiseRequests?.length?' has-promises':''}${story?.neighbourDecision||story?.encounter?' has-public-questions':''}" aria-label="Situación">${story?`<div class="story-format"><span aria-hidden="true">${actionIcon(story.icon)}</span>${stages.length?'Debate en directo':esc(({territory:'Territorio',team:'Tu organización',closing:'Recta final',radio:'En antena',politics:'Decisión política'})[story.format])}</div>`:''}<div class="scene-signal">${stages.length?'En directo':'En tu campaña'}</div>${stages.length?debateCastView(view):story?.speaker?eventSpeakerView(story):`<div class="event-portrait-row">${partyPortrait('P1')}<div><strong>${esc(state.candidate.name)}</strong><small>${esc(party('P1')?.name)}</small></div></div>`}<p class="event-short-body">${esc(debate?.moderatorQuestion||(scene.shortBody||ev.shortBody||scene.body||ev.body))}</p>${contradictionMessagesView(story)}${debate?.bet?`<p class="news-context debate-bet-reminder"><strong>Tu apuesta:</strong> ${esc(debate.bet.text)} ${debate.bet.active?'Puedes aprovecharla en esta ronda.':debate.stage<debate.bet.stage?'Puedes seguirla o elegir otra respuesta.':'El momento de su refuerzo ya ha pasado.'}</p>`:''}${debate?`<blockquote class="debate-challenge" style="${partyStyle(debate.rivalId)}"><strong>${esc(debate.rivalName)}</strong><p>${esc(debate.rivalLine)}</p></blockquote>`:''}${story?.contextNote?`<p class="option-intent news-context"><strong>${esc(story.contextNote.label)}:</strong> ${esc(story.contextNote.text)}</p>`:''}${story?.publicProposal?`<blockquote class="debate-challenge news-public-proposal" style="${partyStyle(story.publicProposal.partyId)}"><strong>${esc(party(story.publicProposal.partyId)?.name)} propone</strong><p>${esc(story.publicProposal.request||story.publicProposal.proposal+'.')}</p><small>${story.publicProposal.agreement?'Coincidís en esta propuesta.':'Tu programa plantea otra vía.'}</small></blockquote>`:''}${story?.promiseRequests?.length?`<div class="promise-requests" aria-label="Lo que prometiste contestar">${story.promiseRequests.map(p=>`<p><strong>${esc(p.name)}: ${esc(p.request)}</strong><br>${esc(p.question)}<br><small>Tu propuesta: ${esc(p.proposal)}</small><br><small>Compromiso del turno ${p.openedTurn} · entrega en el turno ${p.dueTurn}</small></p>`).join('')}<p>La entrega se resuelve antes de tu última jugada. Reserva caja o una tarea del equipo.</p></div>`:''}<p class="scene-agenda-note">${stages.length?'Al terminar el debate elegirás tu jugada.':'Elige tu respuesta. Después jugarás en el mapa.'}</p>${antecedent?`<button type="button" class="story-antecedent" data-act="antecedent" data-entry="${esc(antecedent.entryId)}" aria-label="Ver antecedente: ${esc(antecedent.label)}">↶ ${esc(antecedent.label)}</button>`:''}<details class="play-details"><summary>Más detalles</summary><p>${esc(scene.body||ev.body)}</p></details></section><section class="options" aria-label="Decisiones disponibles" style="--option-count:${view.options.length}">${[...view.options].sort((a,b)=>Number(Boolean(b.availability?.available))-Number(Boolean(a.availability?.available))).map(o=>{
    const a=o.availability||{available:false,reason:'Esta opción no está disponible.',cost:o.cost||{},staffChoices:[]};
    const choices=(a.staffChoices||[]).map(x=>typeof x==='string'?x:x.id).filter(Boolean);
    const reception=eventLocalReception(state,sourceBundle,o.id);
    return `<article class="option-card ${a.available?'':'blocked'} ${debate?.bet?.active&&debate.bet.options.includes(o.id)?'has-debate-bet':''}"><div class="option-title"><span class="option-symbol" aria-hidden="true">${actionIcon(o.reserveStaff?'outreach':o.effects?.some(e=>e.type==='relation')?'mediate':o.effects?.some(e=>e.type==='organization')?'organize':o.effects?.some(e=>['support','topic_support'].includes(e.type))?'interview':o.effects?.some(e=>e.stat==='readiness')?'prepare':'rehearse')}</span><h3>${esc(o.shortLabel||o.label)}</h3></div>${(debate?.optionSpeeches?.[o.id]||story?.optionSpeeches?.[o.id])?`<blockquote class="debate-speech option-speech">«${esc(debate?.optionSpeeches?.[o.id]||story.optionSpeeches[o.id])}»</blockquote>`:story?.optionIntents?.[o.id]?`<p class="option-intent">${esc(story.optionIntents[o.id])}</p>`:''}${!debate&&story?.optionSpeeches?.[o.id]&&story?.optionIntents?.[o.id]?`<p class="option-intent news-choice-intent">${esc(story.optionIntents[o.id])}</p>`:''}${debate?.optionIntents?.[o.id]?`<p class="debate-choice-intent">${esc(debateChoiceIntent(o,state,sourceBundle,debate.optionIntents[o.id]))}</p>`:''}${costLine(a.cost,stages.length&&o.reserveStaff&&choices.length===1?`${staff(choices[0])?.name||choices[0]} · ocupa su tarea`:o.reserveStaff,Boolean(stages.length))}<p class="option-consequence"><span class="consequence-label">${story?.optionPlans?.[o.id]?'En el debate:':'Efectos previstos:'}</span> ${esc(story?.optionPlans?.[o.id]||eventConsequences(o,state,sourceBundle,{omitPreparation:Boolean(stages.length)}))}</p>${reception?`<p class="option-intent local-reception"><strong>${esc(reception.provinceName)} · </strong>${esc(reception.text)}</p>`:''}${stages.length?debateOptionPreparation(o):''}${!stages.length&&a.requiredReadiness?`<div class="cost-line"><span class="cost-chip">${fmt(a.requiredReadiness)} de preparación</span></div>`:''}${o.reserveStaff&&choices.length?(stages.length&&choices.length===1?`<input type="hidden" id="option-staff-${esc(o.id)}" value="${esc(choices[0])}">`:`<label class="sr-only" for="option-staff-${esc(o.id)}">Colaborador para ${esc(o.shortLabel||o.label)}</label><select id="option-staff-${esc(o.id)}" data-option-staff="${esc(o.id)}">${choices.map(id=>`<option value="${esc(id)}">${esc(staff(id)?.name||id)} · ocupa su tarea</option>`).join('')}</select>`):''}${!a.available?`<p class="block-reason">${esc(a.reason||'Faltan recursos o personal.')}</p>`:''}<button type="button" class="${a.available?'primary':''}" data-option="${esc(o.id)}" aria-label="Elegir ${esc(o.shortLabel||o.label)}" ${a.available?'':'disabled'}>Responder así →</button><details class="option-more"><summary>Más sobre esta decisión</summary><p>${esc(o.label)}</p>${!stages.length&&o.effects?.length?`<p>${esc(eventConsequences(o,state,sourceBundle))}</p>`:''}${o.learning?`<p>${esc(o.learning)}</p>`:''}</details></article>`;
  }).join('')}</section></div>`;
}
function newsOutcomeView(compact=false){
  if(state?.phase==='event'&&state.activeEvent==='E07')return '';
  const debate=state?.phase==='planning'?debateOutcome(state,sourceBundle):null;
  const recap=debate?debateRecap(state,sourceBundle):null;
  const betStory=debate?debateBetStory(state,sourceBundle):null;
  if(debate)return `<section class="news-outcome debate-result" aria-label="Balance completo del debate"><div class="debate-result-heading"><span class="debate-result-face">${partyPortrait(debate.rivalId)}</span><div><small>Tras las tres intervenciones · frente a ${esc(party(debate.rivalId)?.name)}</small><strong>${esc(recap?.headline||debate.title)}</strong></div></div>${recap?`<p class="debate-recap-summary"${betStory?` data-bet-status="${esc(betStory.status)}"`:""}>${esc((betStory?.summary||recap.summary).replace(' El balance recoge los efectos registrados.',''))}</p>`:''}<div class="news-outcome-effects">${[['benefit',debate.benefits],['tradeoff',debate.tradeoffs]].flatMap(([kind,items])=>items.map(i=>`<span class="news-chip ${kind}">${esc(i.text)}</span>`)).join('')}</div>${recap?`<details class="debate-recap"><summary>Tus tres respuestas</summary><ol>${recap.moments.map(m=>`<li><strong>${esc(m.stage)}</strong><p>${esc(m.label)}</p><button type="button" class="text-button" data-act="antecedent" data-entry="${esc(m.entryId)}">Ver decisión y efectos</button></li>`).join('')}</ol></details>`:''}<small>El próximo sondeo llegará al jugar tu agenda.</small></section>`;
  const outcome=newsOutcome(state,sourceBundle);
  if(!outcome)return '';
  const groups=[['benefit',outcome.benefits],['tradeoff',outcome.tradeoffs],['obligation',outcome.obligations],['unchanged',outcome.unchanged]];
  const story=eventStory(state,sourceBundle);const choice=story?.optionLabels[outcome.optionId]||outcome.choice;
  const reaction=newsReaction(state,sourceBundle);
  if(reaction)return `<section class="news-outcome news-reaction" aria-label="Resultado de tu decisión en la noticia" data-news-entry="${esc(reaction.entryId)}"><strong class="news-reaction-title">${esc(reaction.headline)}</strong>${compact?'':`<p class="news-reaction-summary">${esc(reaction.summary)}</p>`}<div class="news-outcome-effects">${groups.flatMap(([kind,items])=>items.map(item=>`<span class="news-chip ${kind}">${esc(item.text)}</span>`)).join('')||'<span class="news-chip unchanged">Conservaste los recursos para tu agenda</span>'}</div><details class="news-reaction-record"><summary>Tu respuesta y su registro</summary>${compact?`<p>${esc(reaction.summary)}</p>`:''}<p>${esc(choice)}</p><button type="button" class="text-button" data-act="antecedent" data-entry="${esc(reaction.entryId)}">Ver decisión y efectos</button>${reaction.antecedent?`<button type="button" class="text-button" data-act="antecedent" data-entry="${esc(reaction.antecedent.entryId)}">↶ ${esc(reaction.antecedent.label)}</button>`:''}</details></section>`;
  if(!groups.some(([,items])=>items.length))return story?`<section class="news-outcome" aria-label="Resultado de tu decisión en la noticia"><strong>Tras la noticia · ${esc(choice)}</strong><span class="news-chip unchanged">Conservaste los recursos para tu agenda</span></section>`:'';
  return `<section class="news-outcome" aria-label="Resultado de tu decisión en la noticia" data-news-entry="${esc(outcome.entryId)}"><strong><span aria-hidden="true">${actionIcon('research')}</span>Tras la noticia · ${esc(choice)}</strong><div class="news-outcome-effects">${groups.flatMap(([kind,items])=>items.map(item=>`<span class="news-chip ${kind}">${esc(item.text)}</span>`)).join('')}</div></section>`;
}
function candidateMood(){
  const player=state?.parties.P1;
  return player?.energy<30?'strained':player?.reputation>=60?'confident':'focused';
}
function partyPortrait(id,moodOverride=null){
  const face=id==='P1'?state?.candidate.portrait||ui.setup.portrait:({azul:'portrait-1',rojo:'portrait-4',morado:'portrait-5',verde:'portrait-3',naranja:'portrait-2',amarillo:'portrait-6'}[party(id)?.identityId]||'portrait-1');
  const mood=id==='P1'?candidateMood():party(id)?.archetype==='agresivo'?'determined':party(id)?.archetype==='prudente'?'thinking':'confident';
  return portrait(face,'candidate',moodOverride||mood,partyColor(id),partyShort(id));
}
function knownPositions(){
  const playerProvince=state?.lastVisitedProvince||state?.initialSetup.province||state?.focusProvince;
  const known=playerProvince?{P1:{provinceId:playerProvince,turn:state.lastVisitedProvince?[...(state.timeline||[])].reverse().find(t=>t.kind==='plan'&&t.actorId==='candidate'&&t.actionId==='visit')?.turn||1:0}}:{};
  for(const entry of state?.timeline||[])if(entry.kind==='rival'&&entry.actionId==='visit'&&district(entry.target))known[entry.partyId]={provinceId:entry.target,turn:entry.turn};
  return known;
}
function raceRosterView(){
  const rows=campaignRanking(state.publishedPolls?.P1,bundle.config.parties).sort((a,b)=>(a.partyId==='P1'?-1:b.partyId==='P1'?1:a.rank-b.rank));
  const positions=knownPositions();
  return `<section class="campaign-roster" aria-label="Tu candidatura y los cinco rivales">${rows.map(row=>{
    const location=positions[row.partyId];
    return `<button type="button" class="contender-card ${row.partyId==='P1'?'player-card':''}" data-act="character" data-party="${row.partyId}" aria-label="${esc(party(row.partyId)?.name)} · ${esc(party(row.partyId)?.ideology||'')}${location?`; última visita conocida: ${esc(district(location.provinceId)?.name)}`:''}" style="--party:${partyColor(row.partyId)};--party-ink:${colorInk(partyColor(row.partyId))};--party-readable:${readableColor(partyColor(row.partyId))};--party-outline:${readableColor(partyColor(row.partyId))}"><span class="contender-face">${partyPortrait(row.partyId)}<span class="contender-rank">${row.rank}</span></span><span class="contender-info"><strong>${row.partyId==='P1'?'Tu campaña':esc(party(row.partyId)?.name)}</strong><span class="contender-seats">${row.projection?`${fmt(row.projection.min)}–${fmt(row.projection.max)} esc.`:'Sin sondeo'}</span><small class="contender-ideology">${esc(party(row.partyId)?.ideology||'Perfil por definir')}</small></span></button>`;
  }).join('')}</section>`;
}
function characterDialog(id){
  const own=id==='P1',meta=party(id);if(!meta)return;
  const location=knownPositions()[id];
  const cutoff=['debrief','election','negotiation','ending'].includes(state.phase)?state.turn:state.turn-1;
  const latest=(state.timeline||[]).filter(entry=>own?entry.kind==='plan'&&entry.actorId==='candidate':entry.kind==='rival'&&entry.partyId===id&&entry.turn<=cutoff).slice(-2);
  const story=own?null:rivalStory(state,sourceBundle,{partyId:id,provinceId:ui.province});
  openDialog(own?'Tu campaña':meta.name,`<div class="character-panel"><div class="character-portrait">${partyPortrait(id)}</div><div>${partyBadge(id,false,true)}<h3>${own?esc(state.candidate.name):meta.archetype==='agresivo'?'Quiere disputar cada foco':meta.archetype==='territorial'?'Su fuerza está en el territorio':'Prefiere preparar cada paso'}</h3><p>${esc(rivalStanding(id))}</p><p class="small muted">${location?`Última visita conocida: ${esc(district(location.provinceId)?.name)}${location.turn?` en el turno ${location.turn}`:'. Aquí empieza la campaña'}.`:'Todavía no ha revelado una visita provincial.'}</p></div></div>${story?`<section class="character-rival-story" style="${partyStyle(id)}"><small class="rival-turn">Jugada revelada · turno ${story.turn}</small><h3>${esc(story.headline)}</h3><p>${esc(story.summary)}</p>${rivalAntecedentView(story)}</section>`:''}${partyProfileBody(id)}${latest.length?`<details class="rival-register"><summary>Registro de sus jugadas</summary>${changesList(latest,2)}</details>`:'<p class="empty-text">Al cerrar el turno conocerás las nuevas jugadas.</p>'}${!own?`<p class="note">Relación contigo: ${signed(state.parties.P1.relations?.[id])}. Preparar acuerdos puede abrir una puerta; los contrastes pueden enfriarla.</p>`:''}`);
}
function partyProfileBody(id){
  const meta=party(id);
  if(!meta)return '';
  const positions=state.parties[id]?.positions||meta.positions||{};
  const ownPositions=state.parties.P1.positions||{};
  const priorities=id==='P1'?state.commitments:meta.defaultCommitments||[];
  const ownIdeal=idealFor(state,bundle,'P1');
  const ideal=idealFor(state,bundle,id)||[];
  const distance=ownIdeal.reduce((sum,value,index)=>sum+Math.abs(value-Number(ideal[index]||0)),0);
  const disagreements=bundle.config.topics.filter(t=>positions[t.id]!==ownPositions[t.id]).length;
  const maximum=bundle.config.topics.length*bundle.config.negotiation.maxUnitsPerTopic;
  return `<section class="party-profile" aria-label="Perfil político de ${esc(meta.name)}">${meta.summary?`<p class="party-summary">${esc(meta.summary)}</p>`:''}${id==='P1'&&regionalAgenda()?`<p class="regional-agenda">${esc(regionalAgenda())}</p>`:''}${meta.keys?.length?`<ul class="party-keys">${meta.keys.map(key=>`<li>${esc(key)}</li>`).join('')}</ul>`:''}<div class="party-policy-grid"><section><h3>Posturas de campaña</h3><dl class="party-positions">${bundle.config.topics.map(t=>{const pole=t.poles?.find(p=>Number(p.id)===Number(positions[t.id]));return `<div><dt>${esc(t.name)}</dt><dd>${esc(pole?.label||'Sin postura definida')}</dd></div>`;}).join('')}</dl></section><section><h3>Prioridades para el acuerdo</h3><p class="party-priorities">${esc(priorities.map(topicId=>topic(topicId)?.name||topicId).join(' y ')||'Por definir')}</p><dl class="party-programme">${bundle.config.topics.map((t,index)=>`<div><dt>${esc(t.name)}</dt><dd>${fmt(ideal[index]||0)} ${Number(ideal[index])===1?'unidad':'unidades'}</dd></div>`).join('')}</dl></section></div>${id!=='P1'?`<div class="pact-distance"><strong>Distancia contigo: ${fmt(distance)} / ${fmt(maximum)} unidades de prioridades</strong><span>${fmt(disagreements)} de ${bundle.config.topics.length} posturas diferentes · relación ${signed(state.parties.P1.relations?.[id])}</span><p>Una distancia menor acerca las prioridades del acuerdo. La propuesta, la relación y los escaños también pesan en la investidura.</p></div>`:''}</section>`;
}
function actionPalette(actor,actions,selected){
  const short={visit:'Visitar',interview:'Medios',rehearse:'Ensayar',rest:'Descansar',fundraise:'Recaudar',contrast:'Contrastar',organize:'Organizar',research:'Investigar',outreach:'Escuchar',prepare:'Preparar',mediate:'Dialogar',wait:'Reservar',advertise:'Publicidad'};
  return `<div class="action-palette" role="group" aria-label="Elegir acción de ${esc(actor==='candidate'?state.candidate.name:staff(actor)?.name)}">${actions.map(action=>`<button type="button" data-action-actor="${actor}" data-action-id="${esc(action.id)}" aria-pressed="${action.id===selected}" aria-label="${esc(action.label)}">${actionIcon(action.id)}<span>${esc(short[action.id]||action.label)}</span></button>`).join('')}</div>`;
}
function turnHighlights(){
  const entries=(state.lastTransition?.entries||[]).filter(entry=>entry.actionId).sort((a,b)=>(a.actorId==='candidate'?0:1)-(b.actorId==='candidate'?0:1));if(!entries.length)return '';
  return `<div class="turn-highlights">${entries.slice(0,3).map(entry=>{
    const important=(entry.changes||[]).find(change=>change.stat==='modelImpact')||(entry.changes||[]).find(change=>['relation','budget','readiness','rapport','organization'].includes(change.stat)&&Number(change.delta)!==0);
    const label=important?.stat==='modelImpact'?`${Number(important.delta)>0?'+':''}${fmt(important.delta)} puntos de apoyo`:important?`${resourceLabels[important.stat]||'Relación'} ${signed(important.delta)}`:'Jugada preparada';
    const face=entry.actorId==='candidate'?partyPortrait('P1'):staff(entry.actorId)?portrait(entry.actorId,'staff'):actionIcon(entry.actionId);
    return `<article class="turn-highlight"><div class="highlight-portrait">${face}</div><div><strong>${esc(entry.title)}</strong><span class="${Number(important?.delta)<0?'negative':'positive'}">${esc(label)}</span><small>${entry.target&&district(entry.target)?esc(district(entry.target).name):entry.target&&party(entry.target)?esc(party(entry.target).name):'Tu campaña'}</small></div></article>`;
  }).join('')}</div>`;
}
function getPoll(id){return state.publishedPolls?.P1?.districts?.[id]||null;}
function pollValues(p){return p?.values||{};}
function pollLeader(p){return Object.entries(pollValues(p)).sort((a,b)=>Number(b[1]?.center||0)-Number(a[1]?.center||0))[0]?.[0]||'P1';}
function pollBand(v){return v&&Number.isFinite(Number(v.low))&&Number.isFinite(Number(v.high))?`${fmt(v.low)}–${fmt(v.high)} %`:'Sin sondeo';}
function eligibleParties(id){return bundle.config.parties.filter(p=>p.eligibility==='all'||p.eligibility.includes(id));}
function shortAction(item,actor='candidate'){
  if(!item)return 'Disponible';
  const labels={visit:'Visita',interview:'Medios',fundraise:'Recauda',rest:'Descansa',rehearse:'Ensaya',contrast:'Medios · Comparar',organize:'Organiza',prepare:'Prepara',research:'Investiga',mediate:'Acerca',advertise:'Publicidad',outreach:'Atiende',wait:'Disponible'};
  const place=district(item.target)?.name||party(item.target)?.name||civil(item.target)?.name;
  return ((actor==='candidate'?null:teamTaskLabel(item.id||item.actionId))||labels[item.id||item.actionId]||actionDefinition(actor,item.id||item.actionId)?.label||'Campaña')+(place?' · '+place:item.target==='national'?' · nacional':'');
}
function suggestionOptions(options){return {...options,reserveBudget:ui.reserveForPacts?null:0};}
function pactReserveView(check,preview){
  if(state.turn<bundle.config.turns-2)return '';
  const cost=bundle.config.negotiation.counterofferBudgetCost;
  const after=state.parties.P1.budget-Number(check.cost?.budget||0)+Number(preview?.fundraising?.gain||0);
  const warning=check.ok&&after<cost;
  if(currentPresentation())return `<div class="pact-reserve compact-reserve"><label for="reserve-for-pacts"><input type="checkbox" id="reserve-for-pacts" data-ui="reserve-pacts" ${ui.reserveForPacts?'checked':''}>Guardar ${cost} de caja para pactos</label>${check.ok?warning?`<p class="reserve-warning" role="status">Quedan ${fmt(after)} de caja; una contraoferta cuesta ${cost}. Puedes jugar igualmente.</p>`:`<small>Después de jugar: ${fmt(after)} de caja.</small>`:''}</div>`;
  return `<div class="pact-reserve"><label for="reserve-for-pacts"><input type="checkbox" id="reserve-for-pacts" data-ui="reserve-pacts" ${ui.reserveForPacts?'checked':''}>Guardar ${cost} de caja para pactos</label><small>El equipo lo tendrá en cuenta al sugerir tareas; tú puedes gastarlo.</small>${check.ok?warning?`<p class="reserve-warning" role="status">Este plan te deja ${fmt(after)} de caja. Una contraoferta cuesta ${cost}; puedes jugar igualmente.</p>`:`<small>Tras esta jugada: ${fmt(after)} de caja. Reservar dinero no asegura un acuerdo.</small>`:''}</div>`;
}
function pactReserveHelpView(){
  if(!currentPresentation()||state.turn<bundle.config.turns-2)return '';
  return '<details class="play-details reserve-help"><summary>¿Para qué reservar caja?</summary><p>El equipo evita gastar esa cantidad al sugerir tareas. Tú puedes cambiar las tareas y gastarla.</p><p>Sirve para una posible contraoferta después del recuento; no garantiza apoyos ni bloquea Jugar.</p></details>';
}
function bridgePreparationView(){
  const d=dialoguePreparation(state,sourceBundle);if(!d)return '';
  const base=bundle.config.negotiation.dialogueBridge.minPlayerRelation;
  const label=!d.proponent?'sin propuesta prevista':d.outOfTime?'revisar el plazo':d.ready?'confianza preparada':'conversaciones pendientes';
  const condition=d.proponent?`Si ${party(d.proponent)?.name} llega a presentar propuesta, tu sí puede facilitar el diálogo. Programa y apoyos aún deben encajar.`:'';
  return `<details class="planning-pacts" data-ui-fold="pacts" ${ui.folds?.pacts?'open':''}>
    <summary>Preparar pactos · ${esc(label)}</summary>
    <section class="bridge-preparation" aria-label="Preparar un puente de diálogo">
      <div class="bridge-partners">${d.partners.map(p=>`<span style="${partyStyle(p.id)}"><b>${esc(p.name)}</b><span class="bridge-confidence">${fmt(p.current)} / ${fmt(p.targetLevel)}</span></span>`).join('')}</div>
      <p>${esc(d.outOfTime?d.reason:d.proponent?(d.ready?condition:d.reason):d.reason)}</p>
      ${d.proponent&&d.ready&&d.needsDeepening&&!d.outOfTime?`<small>${esc(d.reason)}</small>`:''}
      <small class="bridge-proposal-order">${d.proposalOrder.source==='poll'?'Según el sondeo, podrían proponer':'Propuestas según el recuento'}: ${d.proposalOrder.ids.map(id=>esc(party(id)?.name||id)).join(' → ')}.</small>
      ${d.uncertainty?'<small>Relación entre socios: por confirmar.</small>':''}
      <details><summary>¿Cómo aprovecho este puente?</summary>
        <p>Una de las dos candidaturas debe llegar a presentar propuesta. El juego permite tres propuestas; el orden depende de los escaños. En Iniciación, propones primero si consigues representación. El orden del sondeo puede cambiar hasta el recuento.</p>
        <p>Prepara confianza ${base} con ambos y consigue escaños. La relación entre ellos debe ser al menos −1. Votar sí a la propuesta ajena activa el puente; abstenerte o votar no lo retira. Tus reuniones también pueden facilitar apoyos a tu propio programa.</p>
        ${condition&&!d.ready?`<p>${esc(condition)}</p>`:''}
        ${d.uncertainty?`<p>${esc(d.uncertainty)}</p>`:''}
        ${d.directRelationPublic!==null?`<p>Relación pública entre socios: ${signed(d.directRelationPublic)}.</p>`:''}
      </details>
    </section></details>`;
}
function ensurePlan(){
  if(ui.plan)return;
  const suggestion=suggestCampaignPlan(state,sourceBundle,suggestionOptions({provinceId:ui.province}));
  ui.plan=suggestion.plan;ui.teamMode='auto';ui.planAdvice=suggestion.reason;
}
function visitAvailability(provinceId){
  return validatePlan(state,{candidate:{id:'visit',target:provinceId},staff:Object.fromEntries(state.selectedStaff.filter(id=>!state.reservedStaff.includes(id)).map(id=>[id,{id:'wait',target:null}]))},sourceBundle);
}
function prepareVisit(provinceId){
  const check=visitAvailability(provinceId);
  if(!check.ok)return `Visita no disponible: ${check.message||check.error?.message||'faltan recursos'}. Conservas tu jugada elegida.`;
  prepareCandidate('visit',provinceId);
  return 'Visita preparada. Pulsa Jugar.';
}
function prepareCandidate(id,target=undefined){
  ensurePlan();
  const action={id,target:target===undefined?chooseTarget(actionDefinition('candidate',id)):target};
  if(ui.teamMode!=='manual'){
    const suggestion=suggestCampaignPlan(state,sourceBundle,suggestionOptions({candidate:action,provinceId:ui.province}));
    acceptTeamSuggestion(suggestion,true);
  }else ui.plan.candidate=action;
}
function acceptTeamSuggestion(suggestion,explain=false){
  const before=ui.plan?.staff||{};
  const changed=state.selectedStaff.filter(id=>before[id]&&JSON.stringify(before[id])!==JSON.stringify(suggestion.plan.staff[id]));
  ui.teamChangeNotice=explain&&changed.length?`El equipo adapta sus tareas: ${changed.map(id=>`${staff(id).name.split(' ')[0]} → ${teamTaskSummary(suggestion.plan.staff[id])}`).join('; ')}.`:'';
  ui.plan=suggestion.plan;ui.planAdvice=suggestion.reason;
}
function opportunityHint(provinceId,kind=null){
  const op=getPoll(provinceId)?.opportunity;
  if(!op?.present)return {kind:null,text:'Fuera de tu ámbito de campaña.'};
  const candidates=[{kind:'attack',margin:op.attack,votes:op.attack?.votesNeeded},{kind:'defense',margin:op.defense,votes:op.defense?.votesMargin}].filter(x=>x.margin);
  const chosen=candidates.find(x=>x.kind===kind)||candidates.sort((a,b)=>a.votes-b.votes)[0];
  if(!chosen)return {kind:null,text:`Tu proyección: ${fmt(op.seats)} escaños.`};
  return {...chosen,against:chosen.margin.against,text:chosen.kind==='attack'?`Ganar otro: ~${fmt(chosen.votes)} votos más frente a ${party(chosen.margin.against)?.name||chosen.margin.against}.`:`Defender: ~${fmt(chosen.votes)} votos propios menos darían tu escaño a ${party(chosen.margin.against)?.name||chosen.margin.against}.`};
}
function mapOpportunitiesView(){
  const items=campaignOpportunities(state.publishedPolls?.P1,bundle);
  if(!items.length)return '';
  return `<div class="map-opportunities" role="group" aria-label="Dos destinos que cambian la campaña">${items.map(item=>`<button type="button" class="map-opportunity ${item.kind}" data-province="${item.provinceId}" data-opportunity-kind="${item.kind}" aria-pressed="${ui.province===item.provinceId}" aria-label="${esc(opportunityHint(item.provinceId,item.kind).text)} ${esc(item.provinceName)}"><span class="opportunity-symbol" aria-hidden="true">${item.kind==='attack'?'+':'◆'}</span><span><strong>${item.kind==='attack'?'Ganar':'Defender'} · ${esc(item.provinceName)}</strong><small>~${fmt(item.votes)} ${item.kind==='attack'?'votos más':'votos menos'} · ${esc(party(item.against)?.name||item.against)}</small>${state.phase==='planning'&&!visitAvailability(item.provinceId).ok?'<small class="opportunity-unavailable">Visita sin recursos · puedes consultar</small>':''}</span></button>`).join('')}</div>`;
}
function quickDraft(id){
  const item={id,target:chooseTarget(actionDefinition('candidate',id))};
  return ui.teamMode==='manual'?{candidate:item,staff:ui.plan.staff}:suggestCampaignPlan(state,sourceBundle,suggestionOptions({candidate:item,provinceId:ui.province})).plan;
}
function previewCopy(preview,{compact=false}={}){
  if(!preview)return '';
  if(preview.fundraising){const f=preview.fundraising;return `+${fmt(f.gain)} de caja${f.capped?' · límite de caja':''}${f.abuse?` · reputación ${signed(f.reputationDelta)}`:compact?'':` · sin penalización en esta recaudación`}`;}
  if(preview.rest)return `+${fmt(preview.rest.gain)} energía de descanso${compact?'':` · +${fmt(preview.rest.totalGain)} con la recuperación del turno`}`;
  if(preview.yield){
    const y=preview.yield;
    if(currentPresentation()){
      const reasons=[y.repeatPercent<100?'repetir':null,y.energyPercent<100?'cansancio':null,y.cohesionPercent<100?'descoordinación':null].filter(Boolean);
      const benefit=y.effectivePercent<100
        ? compact?(reasons.length>1?'Menos alcance: '+reasons.join(' y '):y.repeatPercent<100?'Repetir llega a menos gente':y.energyPercent<100?'Cansancio: menos alcance':'Equipo descoordinado: menos alcance')
          : `Menos alcance por ${reasons.join(' y ')}; ${fmt(y.effectivePercent)} % del efecto habitual.`
        : y.readinessConsumed?'Más alcance con preparación':'Gana apoyo '+(ui.plan?.candidate.id==='interview'?'nacional':'local');
      return benefit+(['0.8.4','0.8.5'].includes(state.rulesVersion)&&y.cohesionPercent>100?` · coordinación +${fmt(y.cohesionPercent-100)} %`:'')
        +(y.readinessConsumed?' · usa 1 ficha':'');
    }
    return `${y.effectivePercent<100?`Rendimiento ${fmt(y.effectivePercent)} %`:y.readinessConsumed?'Más alcance con preparación':'Gana apoyo '+(ui.plan?.candidate.id==='interview'?'nacional':'local')}${y.readinessConsumed?' · usa 1 preparación':''}${!compact&&y.effectivePercent<100?`${y.repeatPercent<100?' · repetición':''}${y.energyPercent<100?' · cansancio':''}${y.cohesionPercent<100?' · equipo descoordinado':''}`:''}`;
  }
  return '';
}
function teamTaskConsequence(id,item){
  return item?teamIntent(state,sourceBundle,{staffId:id,task:item,plan:ui.plan}).outcome:'';
}
function campaignSceneView(item,{reward=false,delta=0}={}){
  const actionId=item?.id||item?.actionId||'visit',rival=featuredRival(state,sourceBundle,item?.target||ui.province);
  return actionScene({actionId,face:partyPortrait('P1',reward?(delta<0?'concerned':delta>0?'delighted':null):actionId==='rest'?'thinking':null),color:partyColor('P1'),mark:partyShort('P1'),rivalFace:actionId==='contrast'?partyPortrait(item.target||rival?.partyId||'P2'):null,rivalColor:partyColor(item.target||rival?.partyId||'P2')});
}
function rivalAntecedentView(story){
  const prior=story?.antecedent;
  return prior?`<button type="button" class="text-button rival-antecedent" data-act="antecedent" data-entry="${esc(prior.entryId)}" aria-label="Ver antecedente: ${esc(prior.label)}">${esc(prior.label)}</button>`:'';
}
function featuredRivalView(){
  const rival=featuredRival(state,sourceBundle,ui.province);if(!rival)return '';
  const story=rivalStory(state,sourceBundle,{partyId:rival.partyId,provinceId:ui.province});
  const destination=story?.responseProvince,check=destination?visitAvailability(destination):null;
  const contest=rivalContest(state,sourceBundle,{partyId:rival.partyId,provinceId:ui.province});
  return `<div class="featured-rival" data-rival-party="${rival.partyId}" ${story?`data-rival-turn="${story.turn}"`:''} style="${partyStyle(rival.partyId)}"><button type="button" class="rival-reply-face" data-act="character" data-party="${rival.partyId}" data-tutorial-target="rival" aria-label="Conocer a ${esc(party(rival.partyId)?.name)}">${partyPortrait(rival.partyId)}</button><span><strong>${esc(party(rival.partyId)?.name)}</strong><small class="rival-play">${esc(story?.headline||rival.reason)}</small>${story?`<small class="rival-turn">Jugada revelada · turno ${story.turn}</small>`:''}</span>${dialogueProgressView(rival.partyId)}${contest?`<p class="rival-contest-context">${esc(contest.text)}</p>`:''}${story?`<p class="rival-story-summary">${esc(story.summary)}</p>${rivalAntecedentView(story)}`:''}${destination?`<div class="rival-response-controls"><button type="button" data-act="respond-rival" data-target-province="${destination}" ${check.ok?'':`disabled title="${esc(check.error?.message||'Faltan recursos para visitar esta provincia')}"`}>Responder en ${esc(district(destination)?.name)}</button><button type="button" class="text-button" data-act="keep-route">Mantener ruta</button>${check.ok?'':`<small>${esc(check.error?.message||'Faltan recursos para esta visita')}. Puedes mantener tu jugada.</small>`}</div>`:''}</div>`;
}
function mobileChoiceView(check,total){
  const id=ui.plan.candidate.id==='visit'?ui.plan.candidate.target:ui.province,p=district(id);
  return `<div class="mobile-choice" id="mobile-choice-summary" tabindex="-1" role="group" aria-label="Jugada y equipo antes de jugar"><h2 tabindex="-1">${esc(p?.name||'Tu campaña')}</h2><p>${esc(opportunityHint(id,ui.opportunityKind).text)}</p>${localTeamFootprint(id)}${teamExecutionView()}<div><span><strong>${esc(shortAction(ui.plan.candidate))}</strong><small>Jugada + equipo: ${fmt(total.budget)} caja · ${fmt(total.energy)} energía</small></span><button type="button" class="primary" data-act="confirm-plan-mobile" ${check.ok?'':'disabled'}>Jugar →</button></div>${!check.ok?`<p class="mobile-plan-error" role="status">${esc(check.error?.message||'Revisa los recursos.')}</p>`:''}<button type="button" class="text-button" data-act="focus-agenda">Cambiar mi jugada</button></div>`;
}
function simpleActions(){
  const labels={visit:'Visitar',interview:'Medios',fundraise:'Recaudar',rest:'Descansar'};
  const available=Object.fromEntries(state.selectedStaff.filter(id=>!state.reservedStaff.includes(id)).map(id=>[id,{id:'wait',target:null}]));
  const drafts=Object.fromEntries(['visit','interview','fundraise','rest'].map(id=>[id,id==='interview'&&ui.plan.candidate.id==='contrast'?ui.plan:quickDraft(id)]));
  const tactic=campaignTactic(state,sourceBundle,{plan:ui.plan,mediaPlan:drafts.interview});
  return `<div class="direct-actions" role="group" aria-label="Tu jugada">${['visit','interview','fundraise','rest'].map(id=>{
    const draft=drafts[id],preview=actionPreview(state,sourceBundle,draft.candidate,{plan:draft});
    const check=validatePlan(state,{candidate:draft.candidate,staff:available},sourceBundle);
    const benefit=!validatePlan(state,draft,sourceBundle).ok?'Revisa tareas y coste':preview?.yield?.effectivePercent===100?(id==='visit'?'Gana apoyo local':preview.yield.readinessConsumed?'Más alcance · usa 1 preparación':'Alcance nacional'):previewCopy(preview,{compact:true});
    const prep=id==='interview'?teamWork(state,sourceBundle,{plan:draft}).preparation:null;
    const future=preview?.fundraising&&!preview.fundraising.abuse?`Desde la ${preview.fundraising.abuseAfter+1}ª: ${preview.fundraising.lateBudget} de caja · rep. ${signed(preview.fundraising.abuseReputation)}`:'';
    return `<button type="button" class="direct-action ${tactic?.actionId===id?'has-tactic':''}" data-action-actor="candidate" data-action-id="${id}" ${tactic?.actionId===id?'aria-describedby="campaign-tactic"':''} aria-pressed="${ui.plan.candidate.id===id||(id==='interview'&&ui.plan.candidate.id==='contrast')}" ${check.ok?'':`disabled title="${esc(check.error?.message||'Faltan recursos')}"`}><span class="direct-action-icon" aria-hidden="true">${actionIcon(id)}</span><span><strong>${labels[id]}</strong>${tactic?.actionId===id?'<span class="action-tactic-marker">Respuesta lista</span>':''}<small class="action-preview ${preview?.fundraising?.abuse?'preview-warning':''}">${esc(check.ok?benefit:check.error?.message||'Faltan recursos')}</small>${prep&&(prep.current||prep.proposed)?`<span class="media-ready">${teamPips(prep.current,prep.proposed,prep.max)}</span>`:''}${future?`<small class="action-repeat-note">${esc(future)}</small>`:''}<span class="direct-action-cost">${fmt(preview.cost.budget||0)} caja · ${fmt(preview.cost.energy||0)} energía</span></span></button>`;
  }).join('')}</div>${tactic?`<p class="campaign-tactic" id="campaign-tactic"><strong>${esc(tactic.message)}</strong> <span>${esc(tactic.consequence)}</span></p>`:''}`;
}
function mediaReplyTarget(){
  if(state.phase!=='planning')return null;
  return bundle.config.parties.filter(p=>p.id!=='P1').map(p=>rivalStory(state,sourceBundle,{partyId:p.id}))
    .find(s=>s?.turn===state.turn-1&&s.actionId==='contrast'&&s.target==='P1')||null;
}
function mediaReplyView(){
  const rival=mediaReplyTarget();if(!rival||!['interview','contrast'].includes(ui.plan.candidate.id))return '';
  const contrast=ui.plan.candidate.id==='contrast',readiness=plannedReadiness(),rule=actionDefinition('candidate','contrast').effect;
  const risk=readiness>0?rule.riskPreparedPercent:rule.riskUnpreparedPercent;
  return `<fieldset class="media-reply"><legend>Qué dirás en Medios</legend><p>${esc(party(rival.partyId).name)} te contrastó en el turno ${rival.turn}. Puedes defender tu propuesta o entrar en la comparación.</p><div><button type="button" data-act="media-style" data-style="defend" aria-pressed="${!contrast}">Defender mi prioridad</button><button type="button" data-act="media-style" data-style="compare" aria-pressed="${contrast}">Comparar con ${esc(party(rival.partyId).short||party(rival.partyId).name)}</button></div><small>${contrast?`La comparación enfría la relación ${rule.relation}. Riesgo de efecto contrario: ${risk} %; si ocurre, pierdes alcance y ${Math.abs(rule.boomerangReputation)} de reputación.${readiness?' Usa una ficha de preparación.':''}`:'Das alcance a tu propuesta sin enfriar esta relación.'} Esta es tu única jugada del candidato.</small></fieldset>`;
}
function teamExecutionView(){
  const work=teamWork(state,sourceBundle,{plan:ui.plan});
  return `<div class="team-execution" aria-label="Tareas que se ejecutarán al jugar"><strong>Tu equipo · ${ui.teamMode==='manual'?'a tus órdenes':'ayuda automática'}</strong>${ui.teamChangeNotice?`<p class="team-change-notice" role="status">${esc(ui.teamChangeNotice)}</p>`:''}<ul>${state.selectedStaff.map(id=>{
    const reserved=state.reservedStaff.includes(id),item=ui.plan.staff[id],intent=reserved?null:teamIntent(state,sourceBundle,{staffId:id,task:item,plan:ui.plan});
    const meeting=item?.id==='mediate'?meetingAgenda(state,sourceBundle,item.target):null;
    const effect=work.effects[id],warnedRoutine=intent?.legal&&intent.warning&&['prepare','organize','wait'].includes(item?.id);let routine='';
    if(intent?.legal&&!intent.warning){
      if(item.id==='prepare'&&effect?.gain>0)routine=`${signed(effect.gain)} ${effect.gain===1?'ficha':'fichas'} para ${['interview','contrast'].includes(ui.plan.candidate.id)?ui.plan.candidate.id==='interview'?'reforzar Medios hoy':'preparar la comparación de hoy':'una próxima intervención'}`;
      else if(item.id==='organize'&&effect?.gain>0)routine=`${signed(effect.gain)} equipo local que trabaja ${work.organization.remainingCloses} ${work.organization.remainingCloses===1?'cierre':'cierres'} desde hoy`;
      else if(item.id==='wait')routine='Conserva caja; sin efecto adicional';
    }
    const effectCopy=warnedRoutine&&item.id==='prepare'&&effect?.gain>0?`${signed(effect.gain)} ${effect.gain===1?'ficha':'fichas'} de preparación sin uso`:intent?.badge||intent?.outcome;
    return `<li class="team-execution-task" data-team-intent="${id}"><span class="team-execution-icon" aria-hidden="true">${actionIcon(reserved?'outreach':item?.id||'wait')}</span><div><strong>${esc(staff(id)?.name?.split(' ')[0]||id)} · ${esc(reserved?'Ocupado en la noticia':teamTaskSummary(item))}</strong><small class="team-purpose ${warnedRoutine?'team-intent-warning':''}">${esc(reserved?'Su tarea de este turno ya está utilizada.':warnedRoutine?intent.warning:routine?`${routine} · ${fmt(intent.cost.budget)} de caja`:intent.brief||intent.reason)}</small>${meeting?`<small class="meeting-programmes">${esc(meeting.summary)}</small>`:''}${intent&&!routine?`<small>${esc(effectCopy)} · ${fmt(intent.cost.budget)} de caja</small>`:''}${intent?.warning&&!warnedRoutine?`<small class="team-intent-warning">${esc(intent.warning)}</small>`:''}</div></li>`;
  }).join('')}</ul><button type="button" class="text-button" data-act="change-staff">Cambiar tareas</button></div>`;
}
function teamTaskSummary(item){
  if(!item)return '';
  const place=district(item.target)?.name||party(item.target)?.name||civil(item.target)?.name||(item.target==='national'?'Todo tu ámbito':'');
  return teamTaskLabel(item.id,item.id)+(place?' · '+place:'');
}
function teamTaskButtons(actor,plan){
  const preferences=ui.plan.candidate.id==='interview'?['prepare','organize','mediate','wait']:state.turn===bundle.config.turns?['mediate','organize','wait','prepare']:BASIC_TEAM_TASKS;
  const choices=plan.id==='wait'?[plan.id,...preferences.filter(id=>id!=='wait').slice(0,3)]:[plan.id,...preferences.filter(id=>id!==plan.id&&id!=='wait').slice(0,2),'wait'];
  return `<div class="team-basic-tasks" role="group" aria-label="Tarea de ${esc(staff(actor)?.name)}">${choices.map(id=>{
    const a=actionDefinition(actor,id),target=plan.id===id?plan.target:chooseTarget(a),intent=teamIntent(state,sourceBundle,{staffId:actor,task:{id,target},plan:ui.plan});
    return `<button type="button" data-action-actor="${actor}" data-action-id="${id}" aria-pressed="${plan.id===id}"><span class="team-basic-icon" aria-hidden="true">${actionIcon(id)}</span><strong>${esc(teamTaskLabel(id))}</strong><small>${esc(id==='organize'?district(target)?.name||teamTaskPurpose(id):id==='mediate'?party(target)?.name||teamTaskPurpose(id):teamTaskPurpose(id))}</small><small class="team-choice-outcome ${intent.warning?'team-intent-warning':''}">${esc(intent.badge||intent.warning||intent.outcome)}</small><span>${fmt(intent.cost.budget)} caja</span></button>`;
  }).join('')}</div>`;
}
function teamTaskIntentView(actor,item){
  const intent=teamIntent(state,sourceBundle,{staffId:actor,task:item,plan:ui.plan});
  const meeting=item?.id==='mediate'?meetingAgenda(state,sourceBundle,item.target):null;
  return `<div class="team-intent" data-task-intent="${actor}" role="status"><strong>${esc(intent.title)}</strong><p>${esc(meeting?meeting.situation:intent.reason)}</p>${meeting?`<p class="meeting-programmes"><strong>${esc(meeting.label)} · ${esc(meeting.topicName)}</strong>${esc(meeting.summary)}</p><p>${esc(intent.agreementPurpose||intent.reason)}</p>`:''}<small>${esc(intent.timing)}</small>${intent.warning?`<p class="team-intent-warning">${esc(intent.warning)}</p>`:''}${intent.entryId?`<button type="button" class="text-button" data-act="antecedent" data-entry="${esc(intent.entryId)}">Ver el trabajo anterior</button>`:''}</div>`;
}
function teamPracticeView(){
  if(!ui.tutorial?.enabled)return '';
  const practice=teamPracticeDraft(ui.teamPractice,state,ui.plan,validatePlan(state,ui.plan,sourceBundle));
  if(!practice)return '';
  const change=practice.changes[0];
  const text=change?practice.changes.map(item=>`${staff(item.actorId)?.name.split(' ')[0]}: ${teamTaskSummary(item.before)} → ${teamTaskSummary(item.after)}.`).join(' '):'Cambia una tarea o su destino en el editor y pulsa Listo. También puedes conservar la propuesta.';
  const costs=practice.beforeBudget!==null&&practice.budget!==null?`Coste del plan completo: ${fmt(practice.beforeBudget)} → ${fmt(practice.budget)} de caja (incluye tu jugada).`:'';
  return `<div class="team-practice" id="team-practice" role="status"><strong>${change?'Cambio preparado':'Prueba opcional · tu equipo'}</strong><p>${esc(text)}</p>${change?`<small>${esc(costs)} ${practice.legal?'Aún no se ha ejecutado.':'Faltan recursos: revisa el plan antes de Jugar.'}</small>`:''}<button type="button" class="text-button" data-act="practice-close">Cerrar ejercicio · conservar mi plan</button></div>`;
}
function teamPracticeResultView(){
  if(!ui.tutorial?.enabled)return '';
  const results=teamPracticeResult(ui.teamPractice,state);if(!results.length)return '';
  return `<div class="team-practice"><strong>La tarea que cambiaste ya se ha hecho</strong><p>${results.map(result=>esc(`${staff(result.actorId)?.name.split(' ')[0]}: ${teamTaskSummary(result.before)} → ${teamTaskSummary(result.after)}.`)).join(' ')}</p><small>Su resultado registrado aparece en la ficha del equipo de abajo.</small></div>`;
}
function teamSuggestionView(){
  const active=state.selectedStaff.filter(id=>!state.reservedStaff.includes(id));
  const editing=active.includes(ui.editingStaff)?ui.editingStaff:active[0];ui.editingStaff=editing;
  return `<div class="team-suggestion"><details class="play-details" data-ui-fold="team" ${ui.folds?.team?'open':''}><summary data-tutorial-target="team">Dirigir al equipo</summary><p class="team-how">Una tarea por persona. Elige a quién dar instrucciones; Jugar confirma las dos.</p>${ui.teamPractice&&ui.tutorial?.enabled?'<p class="team-practice-editor">Prueba: cambia una tarea o destino. Listo vuelve al plan para comparar; todavía no gastas nada.</p>':''}<div class="staff-editor-tabs" role="group" aria-label="Elige a quién dirigir">${state.selectedStaff.map(id=>`<button type="button" data-act="edit-staff" data-staff-actor="${id}" aria-pressed="${editing===id}" ${state.reservedStaff.includes(id)?'disabled':''}><span class="staff-editor-face">${portrait(id,'staff')}</span><span><strong>${esc(staff(id).name.split(' ')[0])}</strong><small>${esc(state.reservedStaff.includes(id)?'Ocupado en la noticia':teamTaskSummary(ui.plan.staff[id]))}</small></span></button>`).join('')}</div>${editing?actionCard(editing):'<p>Los dos colaboradores ya han resuelto la noticia de hoy.</p>'}<div class="team-editor-controls"><button type="button" data-act="review-plan">Listo · revisar mi jugada →</button>${active.length?'<button type="button" class="text-button" data-act="suggest-team">Usar la sugerencia del equipo</button>':''}</div></details>${bridgePreparationView()}</div>`;
}
function planningView(){
  ensurePlan();
  const province=district(ui.province)||district(state.focusProvince)||bundle.provinces.districts[0];ui.province=province.id;
  const check=validatePlan(state,ui.plan,sourceBundle),total=check.cost||{budget:0,energy:0},p=state.parties.P1;
  const candidate=ui.plan.candidate;
  const destination=district(candidate.target),preview=actionPreview(state,sourceBundle,candidate,{plan:ui.plan});
  const extraPreview=preview?.yield?.effectivePercent===100?'':previewCopy(preview);
  const cue=candidate.id==='visit'?`${destination?.name||'Una provincia'} te espera.`:candidate.id==='contrast'?`Responde a ${party(candidate.target)?.name}.`:candidate.id==='interview'?'Tienes el micrófono.':candidate.id==='fundraise'?'Dale combustible a la campaña.':candidate.id==='rest'?'Recupera para volver al mapa.':'Prepara tu siguiente movimiento.';
  return `<div class="planning-grid map-turn focused-planning"><div class="planning-consequence">${newsOutcomeView(true)}</div><section class="agenda play-agenda" aria-labelledby="phase-heading"><div class="protagonist" style="${partyStyle('P1')}"><button type="button" class="protagonist-face protagonist-scene" data-act="character" data-party="P1" aria-label="Ver mi personaje y programa">${campaignSceneView(candidate)}</button><div><p class="eyebrow" id="agenda-title" tabindex="-1">Tu próxima jugada</p><h1 id="phase-heading" tabindex="-1">${esc(cue)}</h1></div></div>${simpleActions()}${mediaReplyView()}<div class="play-cost" id="prepared-plan" tabindex="-1" role="group" aria-label="Jugada y equipo antes de jugar"><div><strong>${esc(shortAction(candidate))}</strong><span>Jugada + equipo: <b>${fmt(total.budget)}</b> caja · <b>${fmt(total.energy)}</b> energía</span></div>${candidate.id==='visit'?'<button type="button" class="text-button choose-map-destination" data-act="focus-map">Elegir otra provincia en el mapa ↓</button>':''}${extraPreview?`<p class="selected-preview ${preview?.fundraising?.abuse?'preview-warning':''}">${esc(extraPreview)}</p>`:''}${candidate.id==='rest'&&state.turn===bundle.config.turns?'<p class="team-intent-warning">Es el último turno: ya no habrá otra jugada para aprovechar la energía recuperada.</p>':''}${preparationUseView()}${teamExecutionView()}${teamPracticeView()}${pactReserveView(check,preview)}${!check.ok?`<p class="note warning" id="plan-error">${esc(check.error?.message||'Revisa los recursos de la jugada.')}</p>`:''}<button type="button" class="primary launch-play" data-act="confirm-plan" data-tutorial-target="action" ${check.ok?'':'disabled'} ${!check.ok?'aria-describedby="plan-error"':''}>Jugar →</button>${pactReserveHelpView()}</div></section><section class="paper-card territory-card" aria-labelledby="territory-title"><div class="territory-title"><h2 class="map-phase-title" id="territory-title" tabindex="-1">${currentPresentation()&&candidate.id!=='visit'?'Mapa de campaña':'Elige destino'}</h2><div class="view-switch" aria-label="Vista del territorio"><button type="button" data-view="board" aria-pressed="${!ui.table}">Mapa</button><button type="button" data-view="table" aria-pressed="${ui.table}">Tabla</button></div></div>${currentPresentation()&&candidate.id!=='visit'?'<p class="map-selection-note">Elegir una provincia prepara una visita si tienes recursos. Solo Jugar la realiza.</p>':''}${mapOpportunitiesView()}${mapMissionHint()}${ui.table?territoryTable():territoryBoard()}${provinceContestView(province.id)}<details class="play-details map-insight" data-ui-fold="polls" ${ui.folds?.polls?'open':''}><summary>Mirar sondeos y oportunidades</summary>${shortlistView()}${provinceDetail(province)}${projectionView()}${raceRosterView()}</details></section><aside class="planning-support">${teamSuggestionView()}${featuredRivalView()}${tutorialView()}</aside></div>`;
}
function territoryBoard(){
  const positions=knownPositions(),occupied={};
  const opportunities=campaignOpportunities(state.publishedPolls?.P1,bundle),opportunityById=Object.fromEntries(opportunities.map(item=>[item.provinceId,item]));
  let route='';
  const start=positions.P1?.provinceId||state.initialSetup.province;
  let from=start,to=state.phase==='planning'&&ui.plan?.candidate.id==='visit'?ui.plan.candidate.target:start;
  if(state.phase==='debrief'){
    const visits=(state.timeline||[]).filter(t=>t.kind==='plan'&&t.actorId==='candidate'&&t.actionId==='visit');
    from=visits.length>1?visits.at(-2).target:state.initialSetup.province;
  }
  if(from!==to&&PROVINCE_ANCHORS[from]&&PROVINCE_ANCHORS[to]){
    const [fx,fy]=PROVINCE_ANCHORS[from],[tx,ty]=PROVINCE_ANCHORS[to];
    route=`<svg class="campaign-route" viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="M${fx} ${fy} Q${(fx+tx)/2+55} ${(fy+ty)/2-65} ${tx} ${ty}" fill="none" stroke="${readableColor(partyColor('P1'))}" stroke-width="4" stroke-dasharray="8 9"/><circle cx="${tx}" cy="${ty}" r="9" fill="${partyColor('P1')}" stroke="#fff" stroke-width="3"/></svg>`;
  }
  const pins=Object.entries(positions).map(([id,location])=>{
    const tile=PROVINCE_ANCHORS[location.provinceId];if(!tile)return '';
    const index=occupied[location.provinceId]||0;occupied[location.provinceId]=index+1;
    return `<span class="board-character ${id==='P1'?'player-character':''}" style="--map-x:${tile[0]/10}%;--map-y:${tile[1]/6.2}%;--pin-offset:${index};--party:${partyColor(id)};--party-ink:${colorInk(partyColor(id))};--party-outline:${readableColor(partyColor(id))}" aria-hidden="true">${partyPortrait(id)}<span>${esc(partyShort(id))}</span></span>`;
  }).join('');
  const districts=bundle.provinces.districts.map(p=>{
    const leader=pollLeader(getPoll(p.id)),scope=canCampaignHere(bundle,p.id);
    const selected=ui.province===p.id;
    const destination=state.phase==='planning'&&ui.plan?.candidate.id==='visit'&&ui.plan.candidate.target===p.id;
    return {p,leader,scope,selected,destination,opportunity:opportunityById[p.id]||null};
  });
  const regions=`<svg class="province-regions" viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${districts.map(({p,leader,scope,selected,destination,opportunity})=>`<path id="map-province-${p.id}" class="province-region ${scope?'':'outside-scope'} ${selected?'is-selected':''} ${destination?'visit-target':''} ${opportunity?'opportunity-'+opportunity.kind:''}" data-map-province="${p.id}" d="${PROVINCE_PATHS[p.id]}" fill-rule="evenodd" style="--party:${partyColor(leader)}"><title>${esc(p.name)} · ${p.seats} escaños</title></path>`).join('')}</svg>`;
  const labels=districts.map(({p,leader,scope,selected,destination,opportunity})=>{
    const [x,y]=TILE_POSITIONS[p.id];
    const visitors=Object.entries(positions).filter(([,location])=>location.provinceId===p.id).map(([id])=>party(id)?.name).join(', ');
    return `<button type="button" class="province-tile province-label ${MAP_CALLOUTS.includes(p.id)?'map-callout':''} ${scope?'':'outside-scope'} ${destination?'visit-target':''}" data-province="${p.id}" ${selected?'data-tutorial-target="province"':''} aria-controls="map-province-${p.id}" aria-pressed="${selected}" aria-label="${esc(p.name)}, ${p.seats} escaños; lidera el sondeo ${esc(party(leader)?.name||'sin información')}${opportunity?'; '+esc(opportunityHint(p.id,opportunity.kind).text):''}${visitors?'; última visita conocida: '+esc(visitors):''}" style="--map-x:${x/10}%;--map-y:${y/6.2}%;--party:${partyColor(leader)};--party-outline:${readableColor(partyColor(leader))}"><span>${esc(TILE_NAMES[p.id]||p.name)}</span><span class="tile-meta"><span>${p.seats} esc.</span><span>${esc(partyShort(leader))}</span></span></button>`;
  }).join('');
  const markers=opportunities.map(item=>{const [x,y]=TILE_POSITIONS[item.provinceId];return `<span class="map-opportunity-marker ${item.kind}" style="--map-x:${x/10}%;--map-y:${y/6.2}%" aria-hidden="true">${item.kind==='attack'?'+':'◆'}</span>`;}).join('');
  return `<div class="map-pan-controls"><span>Desliza el mapa para ver toda España.</span><div><button type="button" data-act="map-pan" data-map-direction="west" aria-label="Mostrar el oeste del mapa">← Oeste</button><button type="button" data-act="map-pan" data-map-direction="east" aria-label="Mostrar el este del mapa">Este →</button></div></div><div class="board-wrap" aria-label="Mapa desplazable horizontalmente"><div class="province-board" aria-label="Mapa de España: 52 circunscripciones seleccionables">${boardBackdrop()}${regions}${route}${labels}${markers}${pins}</div></div>${state.phase==='planning'?'':`<div class="board-legend">${bundle.config.parties.map(p=>partyBadge(p.id)).join('')}</div>`}<details class="board-key"><summary>Cómo leer el mapa</summary><p>Pulsa una provincia para preparar la visita. Su color y sus iniciales indican quién lidera el sondeo. Tu pin señala dónde estás; la línea, tu viaje. Los rivales muestran su última visita revelada. Las etiquetas externas permiten pulsar los territorios pequeños; Canarias aparece en un recuadro.</p></details><p class="map-credit">Mapa adaptado del IGN · CC BY 4.0 · <a href="credits.html">Fuentes</a></p>`;
}
function provinceContestView(provinceId){
  const contest=provinceContest(state,sourceBundle,provinceId);if(!contest)return '';
  const chips=contest.parties.map(p=>`<li class="province-party ${p.present?'':'absent'}" style="${partyStyle(p.id)}">${partyBadge(p.id)}<span class="province-party-poll">${!p.present?'No concurre':p.share?`<strong>≈ ${fmt(Math.round(p.share.center*10)/10)} %</strong><small>${fmt(p.share.low)}–${fmt(p.share.high)} %</small>`:'Sin dato'}</span></li>`).join('');
  const last=contest.lastSeat;
  const dispute=last?`<div class="province-last-seat"><strong>Último escaño del sondeo</strong><p>${partyBadge(last.holder)} lo tiene.${last.challenger?` ${partyBadge(last.challenger)} está a unos <b>${fmt(last.votesNeeded)}</b> votos más en ${esc(contest.provinceName)}.`:''}</p></div>`:'';
  return `<section class="province-contest" aria-labelledby="province-contest-title"><div class="province-contest-heading"><h3 id="province-contest-title">${esc(contest.provinceName)} · los seis partidos</h3><span>${contest.totalSeats} ${contest.totalSeats===1?'escaño':'escaños'}</span></div><ul class="province-party-list">${chips}</ul>${dispute}<p class="province-contest-note">${esc(contest.note)} Los porcentajes son estimaciones de voto.</p></section>`;
}
function territoryTable(){const q=ui.search.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();const list=bundle.provinces.districts.filter(p=>p.name.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().includes(q)).sort((a,b)=>ui.sort==='seats'?b.seats-a.seats||a.name.localeCompare(b.name,'es'):ui.sort==='poll'?Number(pollValues(getPoll(b.id)).P1?.center||0)-Number(pollValues(getPoll(a.id)).P1?.center||0):a.name.localeCompare(b.name,'es'));return `<div class="table-controls"><div><label for="province-search">Buscar provincia</label><input id="province-search" data-ui="search" type="search" value="${esc(ui.search)}" placeholder="Nombre de provincia"></div><div><label for="province-sort">Ordenar por</label><select id="province-sort" data-ui="sort"><option value="name" ${ui.sort==='name'?'selected':''}>Nombre</option><option value="seats" ${ui.sort==='seats'?'selected':''}>Escaños</option><option value="poll" ${ui.sort==='poll'?'selected':''}>Sondeo propio</option></select></div></div><div class="table-wrap territory-table"><table class="data-table"><caption>Sondeos estimados. ${list.length} provincias visibles.</caption><thead><tr><th scope="col">Provincia</th><th class="numeric" scope="col">Escaños</th><th scope="col">${esc(party('P1')?.name)}</th><th scope="col">Oportunidad propia</th><th scope="col">Lidera</th></tr></thead><tbody>${list.length?list.map(p=>`<tr class="${ui.province===p.id?'selected-row':''}"><td><button type="button" class="table-province" data-province="${p.id}" ${ui.province===p.id?'data-tutorial-target="province"':''} aria-label="${esc(p.name)}. ${esc(opportunityHint(p.id).text)}" aria-pressed="${ui.province===p.id}">${esc(p.name)}</button></td><td class="numeric">${p.seats}</td><td>${canCampaignHere(bundle,p.id)?pollBand(pollValues(getPoll(p.id)).P1):'Fuera de tu ámbito'}</td><td class="table-opportunity">${esc(opportunityHint(p.id).text)}</td><td>${partyBadge(pollLeader(getPoll(p.id)),true)}</td></tr>`).join(''):'<tr><td colspan="5">No hay provincias con ese nombre.</td></tr>'}</tbody></table></div>`;}
function teamPips(current,proposed,max){
  return `<span class="team-pips" aria-hidden="true">${Array.from({length:max},(_,i)=>`<i class="${i<current?'active':i<proposed?'proposed':''}"></i>`).join('')}</span>`;
}
function localTeamFootprint(id){
  const work=teamWork(state,sourceBundle,{plan:ui.plan,provinceId:id}),org=work.organization;
  if(!org.current&&!org.proposed&&!work.publishedResearch)return '';
  return `<div class="local-team-footprint" data-local-teams="${org.current}" data-proposed-local-teams="${org.proposed}">${org.current||org.proposed?`<span class="local-team-icon" aria-hidden="true">${actionIcon('organize')}</span><span><strong>${org.current} ${org.current===1?'equipo local activo':'equipos locales activos'}</strong>${teamPips(org.current,org.proposed,org.max)}<small>${org.proposed>org.current?`Al jugar: +${org.proposed-org.current} · `:''}${org.current?org.remainingCloses?`${org.remainingCloses} ${org.remainingCloses===1?'cierre más de trabajo':'cierres más de trabajo'}`:'Último cierre realizado':'Voluntarios previstos en esta provincia'}</small></span>`:''}${work.publishedResearch?'<span class="precise-poll-badge">Sondeo afinado</span>':''}</div>`;
}
function preparationUseView(){
  if(!['interview','contrast'].includes(ui.plan?.candidate.id))return '';
  const prep=teamWork(state,sourceBundle,{plan:ui.plan}).preparation;
  const name=ui.plan.candidate.id==='interview'?'Medios':'Contraste';
  return `<div class="preparation-use" data-preparation-current="${prep.current}" data-preparation-proposed="${prep.proposed}"><span class="preparation-use-icon" aria-hidden="true">${actionIcon('prepare')}</span><span><strong>${prep.used?ui.plan.candidate.id==='contrast'?'Ensayo → menor riesgo de contraste':'Ensayo → Medios reforzado':prep.current?'Ensayo disponible · revisa el coste':'Sin ensayo disponible'}</strong>${teamPips(prep.current,prep.proposed,prep.max)}<small>${prep.current} ${prep.current===1?'ficha':'fichas'}${prep.gain?` → ${prep.proposed} con el equipo`:''}${prep.used?` · usa 1 · ${prep.afterAction===1?'queda':'quedan'} ${prep.afterAction}`:prep.proposed?' · revisa la agenda antes de usarlas':' · sin ensayo para esta intervención'}</small></span></div>`;
}
function dialogueProgressView(id){
  const d=teamWork(state,sourceBundle,{plan:ui.plan,rivalId:id}).dialogue;
  return `<span class="featured-relation dialogue-progress" aria-label="Relación para futuros pactos: ${signed(d.current)}"><strong>Diálogo ${signed(d.current)}</strong>${teamPips(Math.max(0,d.current),Math.max(0,d.proposed),d.max)}<small>${d.gain?`Reunión prevista: +${d.gain}`:d.current<0?'Relación enfriada':d.current>=d.bridge?'Buen diálogo':d.current>=d.gate?'Programa por acordar':'Acercamiento pendiente'}</small></span>`;
}
function mapMissionHint(){
  const id=state.phase==='planning'&&ui.plan?.candidate.id==='visit'?ui.plan.candidate.target:ui.province;
  const province=district(id);if(!province)return '';
  const hint=opportunityHint(id,ui.opportunityKind);
  return `<div class="map-mission">${actionIcon('visit')}<div><strong>${esc(province.name)} · ${province.seats} escaños</strong><span>${esc(hint.text)}</span>${localTeamFootprint(id)}</div></div>`;
}
function provinceDetail(p){const poll=getPoll(p.id);const values=pollValues(poll);const org=state.parties.P1.organization?.[p.id]||0;const last=poll?.lastSeat;const issue=poll?.issue;const issueTopic=issue?topic(issue.topicId):null;const position=issueTopic?.poles?.find(x=>Number(x.id)===Number(issue.position));return `<div class="province-detail"><div class="detail-heading"><h3>${esc(p.name)}</h3><span class="badge">${p.seats} ${p.seats===1?'escaño':'escaños'}</span></div><div class="poll-list">${eligibleParties(p.id).map(x=>`<div class="poll-item">${partyBadge(x.id)}<span class="poll-band">${pollBand(values[x.id])}</span></div>`).join('')}</div>${issueTopic?`<p class="issue-focus"><strong>En primer plano: ${esc(issueTopic.name)}</strong>${esc(position?.label||'Prioridad de esta campaña')}${issue.salience!==undefined?` · importancia ${esc(issue.salience)}`:''}</p>`:''}<p class="poll-caption">Organización propia: ${org} / ${bundle.config.resources.organization.max} · ${poll?.researched?'Información contrastada este turno':'Intervalos del sondeo disponible'}.</p>${playerOpportunityView(poll)}${last?`<div class="seat-challenge"><strong>El último escaño está en disputa.</strong><p>${esc(party(last.holder)?.name||last.holder)} lo conserva por ahora. ${esc(party(last.challenger)?.name||last.challenger)} está a unos ${fmt(last.votesNeeded)} votos en esta estimación.</p><small>Estimación del sondeo; el recuento puede cambiarla.</small></div>`:''}${canCampaignHere(bundle,p.id)?'<button type="button" class="text-button" data-act="visit-selected">Programar visita aquí →</button>':''}</div>`;}
function projectionView(){const poll=state.publishedPolls?.P1;const rows=campaignRanking(poll,bundle.config.parties);return `<div class="national-poll"><div class="card-header"><h3>La carrera hacia el Congreso</h3><button type="button" class="text-button" data-act="rivals">Conocer a los rivales</button></div><ol class="race-ranking">${rows.map(row=>`<li class="${row.partyId==='P1'?'player-row':''}"><span class="race-position" aria-label="Posición ${row.rank}">${row.rank}</span>${partyBadge(row.partyId)}<div class="race-score"><strong>${row.projection?`${fmt(row.projection.min)}–${fmt(row.projection.max)} esc.`:'Sin proyección'}</strong><small>${row.national?pollBand(row.national):'Sin sondeo nacional'}</small></div></li>`).join('')}</ol><p class="poll-caption">Orden por la mediana de escaños del sondeo. Las bandas pueden solaparse: el liderazgo estimado puede cambiar. <button type="button" class="text-button" data-act="calculation">Cómo se calcula</button></p></div>`;}
function actionDefinition(actor,id){return (actor==='candidate'?bundle.config.candidateActions:bundle.config.staffActions).find(a=>a.id===id);}
function plannedReadiness(){return teamWork(state,sourceBundle,{plan:ui.plan}).preparation.proposed;}

function fundraiseDescription(a){
  const p=state.parties.P1;
  const abuse=Number(p.repeatCounts?.fundraise||0)>=a.effect.abuseAfter;
  let spending=0;
  if(ui.plan){try{spending=Number(validatePlan(state,ui.plan,sourceBundle).cost?.budget||0);}catch{}}
  const nominal=abuse?a.effect.lateBudget:a.effect.budget;
  const amount=Math.min(nominal,Math.max(0,bundle.config.resources.budget.max-Math.max(0,p.budget-spending)));
  const rep=abuse?Math.max(bundle.config.resources.reputation.min,p.reputation+a.effect.abuseReputation)-p.reputation:0;
  return `Consigue ${amount} de caja${amount<nominal?' (límite de caja)':''}. ${abuse?`Esta recaudación repetida cambia la reputación ${signed(rep)}.`:`Desde la tercera recaudación, la aportación baja a ${a.effect.lateBudget} y cambia la reputación ${signed(a.effect.abuseReputation)}.`}`;
}
function actionDescription(a){
  if(!a)return '';
  if(a.id==='fundraise')return fundraiseDescription(a);
  if(a.id==='contrast'){
    const target=ui.plan?.candidate?.target;const own=state.parties.P1;
    const before=own.relations[target]||0;const after=Math.max(bundle.config.resources.relation.min,before+a.effect.relation);
    const count=own.repeatCounts['contrast:'+target]||0;
    const factor=bundle.config.support.repeatPercent[Math.min(count,bundle.config.support.repeatPercent.length-1)];
    return `Disputa el alcance a ${party(target)?.name||'un rival'}. La relación pasa de ${signed(before)} a ${signed(after)}. ${count?`Repetir contra el mismo rival reduce el alcance al ${factor} %.`:'Repetir contra el mismo rival reduce el alcance en próximos turnos.'}`;
  }
  const notes={visit:'Refuerza tu presencia en la provincia. Repetir visitas reduce su efecto.',interview:'Aumenta el alcance nacional. Consume preparación si la tienes.',rehearse:'Aumenta la preparación para las entrevistas y el debate.',rest:`Recupera ${a.effect.energy} de energía. Conservas la caja.`,organize:'Construye organización provincial, que permanece en la campaña.',research:'Reduce durante dos turnos la incertidumbre de este sondeo.',outreach:'Atiende una relación civil. Puede abrir nuevas situaciones.',prepare:'Prepara intervenciones del candidato.',mediate:'Mejora la relación con un rival para un posible acuerdo.',wait:'Conserva recursos y deja al colaborador disponible.',advertise:'Da alcance a tu campaña en el destino elegido.'};return a.description||notes[a.id]||a.label;
}
function actionCard(actor){
  const isCandidate=actor==='candidate',reserved=!isCandidate&&state.reservedStaff.includes(actor),person=isCandidate?state.candidate:staff(actor);
  if(reserved)return `<article class="action-card reserved"><strong>${esc(person.name)}</strong><span class="badge">Ocupado por la escena de este turno</span></article>`;
  const plan=isCandidate?ui.plan.candidate:ui.plan.staff[actor],actions=isCandidate?bundle.config.candidateActions:bundle.config.staffActions,a=actionDefinition(actor,plan.id);
  const cost=actionCost(state,bundle,'P1',actor,plan.id,plan.target),readiness=plannedReadiness();
  const risk=a?.id==='contrast'?(readiness>0?a.effect.riskPreparedPercent:a.effect.riskUnpreparedPercent):null;
  return `<article class="action-card manual-action"><div class="action-person"><div><strong>${esc(person.name)}</strong><small>${esc(staffLabels[person.specialty])}</small></div></div>${teamTaskButtons(actor,plan)}${targetControl(actor,a,plan.target)}${teamTaskIntentView(actor,plan)}<details class="team-more" data-staff-palette="${actor}" ${ui.staffPalette?.[actor]?'open':''}><summary>Explorar todas las tareas</summary><div class="field action-select"><label for="action-${actor}">Todas las tareas</label><select id="action-${actor}" data-plan-actor="${actor}" data-plan-field="id">${actions.map(x=>`<option value="${esc(x.id)}" ${plan.id===x.id?'selected':''}>${esc(teamTaskLabel(x.id,x.label))}</option>`).join('')}</select></div></details></article>`;
}
function targetControl(actor,a,target){if(!a||['none','national'].includes(a.target))return '';let options;if(a.target==='province')options=provinceOptions(target);else if(a.target==='province_or_national')options=`<option value="national" ${target==='national'?'selected':''}>${party('P1')?.eligibility==='all'?'Todo el país':'Todo tu ámbito de campaña'}</option>${provinceOptions(target)}`;else if(a.target==='civil_actor')options=bundle.config.civilActors.map(p=>`<option value="${p.id}" ${target===p.id?'selected':''}>${esc(p.name)}</option>`).join('');else if(a.target==='rival_party')options=bundle.config.parties.filter(p=>p.id!=='P1').map(p=>`<option value="${p.id}" ${target===p.id?'selected':''}>${esc(p.name)}</option>`).join('');else return '';return `<div class="field"><label for="target-${actor}">${a.target.includes('province')?'Destino':'Interlocutor'}</label><select id="target-${actor}" data-plan-actor="${actor}" data-plan-field="target">${options}</select></div>`;}

function changeText(item){if(item?.requested===0&&item?.delta===0)return '';if(typeof item==='string')return item;if(!item||typeof item!=='object')return '';if(item.stat==='modelImpact')return `Impulso de la jugada (modelo): ${Number(item.delta)>0?'+':''}${fmt(item.delta)} puntos${district(item.target)?` en ${district(item.target).name}`:' a escala nacional'}`;if(item.text)return item.text;if(item.message)return item.message;if(item.body)return item.body;if(currentPresentation()&&item.stat==='budget'&&Number.isFinite(item.delta))return item.delta?`Caja ${signed(item.delta)}`:'Caja sin cambio; límite alcanzado';if(item.label)return item.label;if(item.title)return item.title;const k=item.stat||item.resource||item.type;const who=civil(item.target)?.name||party(item.partyId||item.target)?.name||district(item.target)?.name;const name=resourceLabels[k]||k||'Cambio';if(item.before!==undefined&&item.after!==undefined)return `${name}${who?` · ${who}`:''}: ${item.before} → ${item.after}`;if(item.delta!==undefined)return `${name}${who?` · ${who}`:''}: ${signed(item.delta)}`;return name;}
function changesList(changes=[],limit=8){
  const rows=changes.filter(item=>changeText(item)).slice(0,limit).map(item=>{
    const details=(item?.changes||[]).filter(x=>x.stat!=='support').map(changeText).filter(Boolean);
    if((item?.changes||[]).some(x=>x.stat==='support'&&x.delta!==x.requested))details.push('Parte del alcance previsto se pierde: ya habías concentrado mucho esfuerzo en ese territorio.');
    return `<li>${esc(changeText(item))}${details.length?`<small class="change-detail">${details.map(esc).join(' · ')}</small>`:''}</li>`;
  });
  return rows.length?`<ul class="change-list">${rows.join('')}</ul>`:'';
}
function learningText(value){const text=String(value||'').replace(/^Opcional:\s*/i,'');return 'Opcional: '+text.charAt(0).toUpperCase()+text.slice(1);}
function latestLearning(){return [...(state.timeline||[])].reverse().filter(t=>t.turn===state.turn&&t.learning).slice(0,3);}
function staffMemoryView(){const memories=staffMemories(state,sourceBundle);return staffObservations(state,sourceBundle).map(n=>{const memory=memories.find(m=>m.staffId===n.staffId);return `<div class="team-opinion"><div class="avatar">${portrait(n.staffId,'staff')}</div><div><strong>${esc(staff(n.staffId)?.name)}</strong><p>${esc(memory?.text||n.text)}</p>${memory?`<button type="button" class="story-antecedent" data-act="antecedent" data-entry="${esc(memory.entryId)}">↶ Ver el turno ${memory.turn}</button>`:''}</div></div>`;}).join('');}
function teamComments(){const notes=staffObservations(state,sourceBundle);const changes=(state.lastTransition?.provinceChanges||[]).filter(p=>Number(p.change)!==0).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,3);const regional=changes.length?`<div class="regional-changes"><strong>El tablero cambia con el turno.</strong><div>${changes.map(p=>`<span class="badge">${esc(district(p.provinceId)?.name||p.provinceId)} · ${pct(p.before)} → ${pct(p.after)}</span>`).join('')}</div><small>Movimiento estimado tras tu agenda y las acciones rivales.</small></div>`:'';return regional;}

function teamOutcomeView(summary){
  const returns=state.lastTransition?.organizationReturns||[];
  const candidatePrepared=(summary.candidate?.changes||[]).some(c=>c.stat==='readiness'&&c.delta<0);
  return `<div class="team-outcome">${state.selectedStaff.map(id=>{
    const item=summary.team.find(entry=>entry.actorId===id),change=item?.changes?.find(c=>['readiness','organization','relation','rapport','research'].includes(c.stat)),support=item?.changes?.filter(c=>c.stat==='support').reduce((sum,c)=>sum+Number(c.delta||0),0);
    let consequence='Conservó recursos y disponibilidad.';
    if(state.reservedStaff.includes(id)&&!item)consequence='Se ocupó de la noticia de este turno.';
    if(item?.actionId==='organize'){const ongoing=returns.find(r=>r.provinceId===item.target);consequence=change?.delta>0?`+${change.delta} equipo local en ${district(item.target)?.name}. ${ongoing?.remainingTurns?`Ya trabajó hoy; ${ongoing.remainingTurns===1?'queda':'quedan'} ${ongoing.remainingTurns} ${ongoing.remainingTurns===1?'cierre':'cierres'} más.`:'Trabajó en el último cierre.'}`:'La organización no pudo crecer más; la tarea gastó caja.';}
    if(item?.actionId==='research')consequence=state.turn>=bundle.config.turns?'Precisó el último sondeo; no quedaban nuevas agendas.':'Sondeo más preciso en este cierre y el siguiente.';
    if(item?.actionId==='prepare')consequence=`Preparación ${signed(change?.delta||0)} · ${candidatePrepared?'tu intervención utilizó una ficha.':state.turn>=bundle.config.turns?'no quedó otra intervención.':'reservada para entrevista o debate.'}`;
    if(item?.actionId==='mediate'){const relation=state.parties.P1.relations[item.target]||0;consequence=`Reunión ${signed(change?.delta||0)} · confianza al cierre ${signed(relation)}. ${relation>=bundle.config.negotiation.minRelationForAutomaticSupport?'Falta acordar el programa.':'Queda acercamiento pendiente.'}`;const later=summary.candidate?.actionId==='contrast'&&summary.candidate.target===item.target?summary.candidate.changes.find(c=>c.stat==='relation'&&c.target===item.target&&c.delta<0):null;if(later)consequence+=` Tu comparación posterior cambió la confianza ${signed(later.delta)}.`;}
    if(item?.actionId==='advertise')consequence=support>0?'La publicidad añadió alcance en su ámbito.':'La publicidad gastó caja para desplegar presencia en su ámbito.';
    if(item?.actionId==='outreach')consequence=`Relación con ${civil(item.target)?.name||item.target} ${signed(change?.delta||0)} · ${state.turn>=bundle.config.turns?'no quedan noticias de campaña.':'posibles conversaciones posteriores.'}`;
    const meeting=item?.actionId==='mediate'?meetingAgenda(state,sourceBundle,item.target):null;
    return `<article><span class="team-outcome-icon" aria-hidden="true">${actionIcon(item?.actionId||'wait')}</span><div><strong>${esc(staff(id)?.name?.split(' ')[0]||id)}</strong><small>${esc(item?shortAction(item,id):'Tarea de la noticia')}</small><p>${esc(consequence)}</p>${meeting?`<small class="meeting-programmes">${esc(meeting.topicName)} · ${esc(meeting.summary)}</small>`:''}</div></article>`;
  }).join('')}</div>`;
}
function rivalNews({others=false}={}){
  const moves=turnSummary(state,sourceBundle).rivals;
  if(!moves.length)return '';
  const featured=featuredRival(state,sourceBundle,ui.province);
  const ordered=[...moves].sort((a,b)=>(a.partyId===featured?.partyId?0:1)-(b.partyId===featured?.partyId?0:1));
  const renderMove=(move,highlighted)=>{
    const story=rivalStory(state,sourceBundle,{partyId:move.partyId,provinceId:ui.province});
    const contest=highlighted?rivalContest(state,sourceBundle,{partyId:move.partyId,provinceId:ui.province}):null;
    return `<article class="rival-reply ${highlighted?'rival-featured':''}" data-rival-party="${move.partyId}" style="${partyStyle(move.partyId)}"><button type="button" class="rival-reply-face" data-act="character" data-party="${esc(move.partyId)}" ${highlighted?'data-tutorial-target="rival"':''} aria-label="Ver a ${esc(party(move.partyId)?.name)}">${partyPortrait(move.partyId)}</button><div><strong>${esc(party(move.partyId)?.name)}</strong><span>${esc(story?.headline||shortAction(move))}</span>${highlighted?`${contest?`<small class="rival-contest-context">${esc(contest.text)}</small>`:''}<small class="rival-reason">${esc(story?.summary||featured.reason)}</small>${rivalAntecedentView(story)}`:''}</div><span class="rival-reply-seats">${fmt(state.publishedPolls?.P1?.projection?.[move.partyId]?.median||0)}<small>esc. est.</small></span></article>`;
  };
  if(others)return ordered.length>1?`<details class="play-details other-rival-moves"><summary>Las otras ${ordered.length-1} candidaturas</summary><div>${ordered.slice(1).map(move=>renderMove(move,false)).join('')}</div></details>`:'';
  return `<section class="rival-replies" aria-labelledby="rival-news-title"><h3 id="rival-news-title">El movimiento rival</h3>${renderMove(ordered[0],true)}</section>`;
}
function turnPollReward(pulse,{compact=false}={}){
  if(!pulse)return '';
  const change=pulse.roundedChange>0?`+${fmt(pulse.roundedChange)}`:fmt(pulse.roundedChange);
  return `<div class="turn-poll-reward ${compact?'compact':''} ${pulse.trend}" ${compact?'':`role="status" tabindex="-1" data-tutorial-target="consequence"`}><small>${currentPresentation()?'Sondeo tras todas las campañas':'Sondeo'} · ${esc(pulse.provinceName)}</small><div><span>${pct(pulse.before)}</span><span aria-hidden="true">→</span><strong>${pct(pulse.after)}</strong></div><p>${pulse.roundedChange?`${esc(change)} puntos en este cierre`:'Sin cambio apreciable en este cierre'}${pulse.estimatedSeats!==null?` · ${fmt(pulse.estimatedSeats)} ${pulse.estimatedSeats===1?'escaño estimado':'escaños estimados'}`:''}</p></div>`;
}
function turnActionImpactView(summary){
  const impact=summary.candidate?.changes?.find(c=>c.stat==='modelImpact'&&Number.isFinite(c.delta));
  if(!impact)return '';
  if(!currentPresentation())return `<p class="turn-action-impulse">Impulso de tu jugada: ${signed(impact.delta)} puntos (modelo).</p>`;
  const scope=district(impact.target)?.name||'alcance nacional';
  return `<div class="turn-action-impulse own-action-impact"><strong>Tu acción por separado</strong><span>${signed(impact.delta)} puntos estimados · ${esc(scope)}</span><small>Calculado al resolver tu jugada, antes de los rivales y del sondeo.</small></div>`;
}
function debriefView(){
  const transition=state.lastTransition||{},summary=turnSummary(state,sourceBundle),reward=summary.reward,province=district(ui.province)||district(state.lastVisitedProvince)||bundle.provinces.districts[0];
  const action=summary.candidate?.actionId, pulse=turnPulse(state,sourceBundle,{provinceId:province.id});
  const title=pulse&&action==='visit'?pulse.headline:action==='visit'?'Has dejado huella.':action==='fundraise'?'La campaña tiene combustible.':action==='rest'?'Vuelves con energía.':action==='contrast'?'Los rivales han oído tu mensaje.':action==='interview'?'Tu voz llega más lejos.':'Tu jugada está hecha.';
  const rewardCopy=reward?.stat==='modelImpact'?`puntos de apoyo${district(reward.placeId)?' en '+district(reward.placeId).name:' en el país'}`:resourceLabels[reward?.stat]||'de impulso';
  const learn=latestLearning(),next=state.turn>=bundle.config.turns?'Ver el recuento':'Continuar';
  return `<div class="planning-grid map-turn debrief-grid"><section class="paper-card territory-card" aria-labelledby="phase-heading"><div class="territory-title"><h1 class="map-phase-title" id="phase-heading" tabindex="-1">Así queda el mapa</h1><div class="view-switch" aria-label="Vista del territorio"><button type="button" data-view="board" aria-pressed="${!ui.table}">Mapa</button><button type="button" data-view="table" aria-pressed="${ui.table}">Tabla</button></div></div>${mapMissionHint()}${ui.table?territoryTable():territoryBoard()}<details class="play-details map-insight" data-ui-fold="polls" ${ui.folds?.polls?'open':''}><summary>Mirar sondeos y oportunidades</summary>${provinceDetail(province)}${projectionView()}</details><details class="play-details turn-log"><summary>Ver todos los cambios del turno</summary><p>${esc(transition.body||'Jugada resuelta.')}</p>${changesList(transition.entries||transition.changes||[],16)}${learn.length?`<details><summary>La decisión con perspectiva</summary>${learn.map(t=>`<p>${esc(learningText(t.learning))}</p>`).join('')}</details>`:''}${teamComments()}${relationshipsBody(false)}${promisesBody()}<button type="button" class="text-button" data-act="history">Abrir el registro completo</button></details></section><section class="agenda debrief-agenda"><div class="protagonist" style="${partyStyle('P1')}"><button type="button" class="protagonist-face protagonist-scene" data-act="character" data-party="P1" aria-label="Ver mi personaje y programa">${campaignSceneView(summary.candidate,{reward:true,delta:pulse&&reward?.stat==='modelImpact'?pulse.roundedChange:reward?.delta||0})}</button><div>${partyBadge('P1')}<h2>${esc(title)}</h2><p>${esc(summary.candidate?shortAction(summary.candidate):'Tu campaña avanza')}</p></div></div>${pulse&&reward?.stat==='modelImpact'?turnPollReward(pulse):`<div class="play-reward ${Number(reward?.delta)<0?'negative':'positive'}" role="status" tabindex="-1" data-tutorial-target="consequence">${reward?`<strong>${signed(reward.delta)}</strong><span>${esc(rewardCopy)}</span>`:'<strong>Jugada hecha</strong><span>Tu equipo sigue adelante.</span>'}</div>${turnPollReward(pulse,{compact:true})}`}${reward?.stat==='modelImpact'?turnActionImpactView(summary):''}<p class="debrief-poll-note">${esc(pulse?.note||'El sondeo del turno también incluye jugadas rivales y ruido.')}</p>${teamPracticeResultView()}${teamOutcomeView(summary)}${rivalNews()}<button type="button" class="primary launch-play debrief-next" data-command="CONTINUE">${next} →</button>${rivalNews({others:true})}<details class="play-details"><summary>Lo que comenta tu equipo</summary>${staffMemoryView()}</details>${tutorialView()}</section></div>`;
}
function relationshipsBody(all=true){return `<div>${bundle.config.civilActors.map(p=>`<div class="relationship-row"><span>${esc(p.name)}</span><span class="relationship-score">Relación ${signed(state.rapport?.[p.id])}</span></div>`).join('')}${all?`<p class="small muted section-gap">Para considerar un acuerdo, un rival necesita al menos ${bundle.config.negotiation.minRelationForAutomaticSupport} de relación. Después cuentan las posturas y las prioridades.</p>${bundle.config.parties.filter(p=>p.id!=='P1').map(p=>`<div class="relationship-row">${partyBadge(p.id)}<span class="relationship-score">${signed(state.parties.P1.relations?.[p.id])}</span></div>`).join('')}`:''}</div>`;}
function promisesBody(){const promises=promiseThreads(state,sourceBundle);return `<div class="section-gap"><h3>Respuestas comprometidas</h3>${promises.length?promises.map(p=>`<div class="promise-item"><strong>${esc(p.name)}: ${esc(p.request)}</strong><p>${esc(promiseStatus[p.status]||p.status)}${p.status==='open'?` · turno ${p.dueTurn}`:p.closedTurn?` · turno ${p.closedTurn}`:''}</p><p>${esc(p.status==='fulfilled'?`Entregaste ${p.delivery}.`:p.status==='reduced'?`Acordaste una versión más breve de ${p.delivery}.`:p.status==='missed'?`Quedó sin entregar ${p.delivery}.`:p.delivery+'.')}</p></div>`).join(''):'<p class="empty-text">No hay respuestas civiles comprometidas.</p>'}</div>`;}
function electionResult(){return state.election||state.result||state.electionResult||null;}
function electionProvinceVisual(step){
  const path=PROVINCE_PATHS[step.provinceId]||'',numbers=(path.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number),xs=numbers.filter((_,i)=>i%2===0),ys=numbers.filter((_,i)=>i%2===1);
  const left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top,pad=Math.max(width,height)*.12+2;
  return `<svg class="reveal-province" viewBox="${left-pad} ${top-pad} ${width+pad*2} ${height+pad*2}" aria-hidden="true" focusable="false"><path d="${path}" fill-rule="evenodd" fill="${partyColor(step.leader)}" stroke="#f7f0df" stroke-width="${Math.max(width,height)/85}"/></svg>`;
}
function electionView(){
  const stages=electionRevealSteps(state,sourceBundle),index=Math.max(0,Number(ui.revealIndex||0));
  if(index>=stages.length||!stages.length)return electionSummaryView();
  const step=stages[index],result=electionResult().districts[step.provinceId];
  return `${phaseHeading(`Noche electoral · ${index+1} / ${stages.length}`,step.provinceName,'Tres provincias para descubrir el desenlace. Puedes ver todo el resultado cuando quieras.')}<div class="election-reveal paper-card"><section><div class="reveal-art" style="${partyStyle(step.leader)}">${electionProvinceVisual(step)}<div>${partyPortrait(step.leader)}</div></div><p class="reveal-leader">${partyBadge(step.leader)} encabeza el recuento provincial.</p></section><section><p class="eyebrow">Tu candidatura</p><div class="reveal-own"><strong>${fmt(step.playerSeats)}</strong><span>de ${fmt(step.seats)} escaños<br>${esc(party('P1')?.name)}</span></div><p class="reveal-change ${step.change<0?'negative':step.change===0?'neutral':'positive'}">${step.change>0?`+${step.change} frente a la estimación del sondeo`:step.change<0?`${step.change} frente a la estimación del sondeo`:'Conservas la estimación de escaños del sondeo'}.</p>${step.leaderChanged?`<p class="reveal-change">El sondeo lo encabezaba ${esc(party(step.previousLeader)?.name)}.</p>`:''}<div class="last-seat-winner"><span>Último escaño</span>${step.lastSeatHolder?partyBadge(step.lastSeatHolder):'Reparto confirmado'}</div><div class="reveal-party-seats">${bundle.config.parties.filter(p=>Number(result.seatsByParty[p.id])>0).map(p=>`<span>${partyBadge(p.id,true)}<b>${fmt(result.seatsByParty[p.id])}</b></span>`).join('')}</div><div class="reveal-controls"><button type="button" class="primary" data-act="next-reveal">${index+1===stages.length?'Ver el Congreso':'Siguiente provincia'} →</button><button type="button" class="text-button" data-act="skip-reveal">Saltar al resultado completo</button></div><p class="small muted">Resultado ya cerrado. Avanzar, saltar o recargar conserva votos y escaños.</p></section></div>`;
}
function electionSummaryView(){const result=electionResult();if(!result)return `${phaseHeading('Noche electoral','Los resultados se están preparando.')}<p class="note error">No hay un recuento disponible. Guarda la partida para revisar la incidencia.</p>`;const national=result.national;const seats=national.seatsByParty;const votes=national.votesByParty;const allVotes=Object.values(votes).reduce((a,b)=>a+Number(b),0)+Number(national.blankVotes||0);const player=Number(seats.P1||0);const order=bundle.config.parties.map(p=>p.id).sort((a,b)=>Number(seats[b]||0)-Number(seats[a]||0));return `${phaseHeading('Noche electoral','La campaña ya tiene un resultado.','Los votos se convierten en escaños provincia a provincia. Ahora empieza la conversación parlamentaria.')}<div class="election-grid"><section class="paper-card result-summary"><h2>El Congreso</h2><p class="small muted">Recuento confirmado de esta partida</p>${hemicycle(seats,order,partyPalette())}<div class="majority-note"><span>350 escaños</span><span>Mayoría absoluta: 176</span></div><div class="table-wrap"><table class="data-table result-table"><caption>Resultado nacional. Porcentaje sobre votos válidos, incluido el blanco.</caption><thead><tr><th scope="col">Candidatura</th><th scope="col" class="numeric">Votos</th><th scope="col" class="numeric">%</th><th scope="col" class="numeric">Escaños</th></tr></thead><tbody>${order.map(id=>`<tr class="${id==='P1'?'player-row':''}"><td>${partyBadge(id)}</td><td class="numeric">${fmt(votes[id])}</td><td class="numeric">${allVotes?Math.round(Number(votes[id]||0)/allVotes*100):0} %</td><td class="numeric"><strong>${fmt(seats[id])}</strong></td></tr>`).join('')}</tbody></table></div></section><aside class="paper-card"><p class="eyebrow">${esc(party('P1')?.name)}</p><h2>Tu lugar en el Congreso.</h2><div class="winner-card"><strong>${player}</strong><p class="muted">${player===1?'escaño para tu candidatura':'escaños para tu candidatura'}</p><p>${player>=176?'Puedes alcanzar la primera mayoría con tus propios escaños.':`La mayoría absoluta está a ${176-player} escaños. En la segunda votación basta con más síes que noes.`}</p></div>${proposalOrderView()}<button type="button" class="primary" data-command="BEGIN_NEGOTIATION">Explorar acuerdos →</button><hr class="separator"><h3>El recuento completo</h3><div class="turn-counts"><div><strong>${fmt(national.castVotes)}</strong><small>votos emitidos</small></div><div><strong>${fmt(national.abstentions)}</strong><small>abstenciones</small></div><div><strong>${fmt(national.blankVotes)}</strong><small>votos en blanco</small></div><div><strong>${fmt(national.invalidVotes)}</strong><small>votos nulos</small></div></div><button type="button" class="text-button" data-act="calculation">Entender el reparto</button></aside></div><details class="paper-card election-detail"><summary>Ver votos y escaños por circunscripción</summary>${electionDistrictTable(result)}</details>`;}
function electionDistrictTable(result){return `<div class="table-wrap"><table class="data-table"><caption>Votos de candidatura y escaños confirmados. Cada casilla indica votos · escaños.</caption><thead><tr><th scope="col">Circunscripción</th><th scope="col" class="numeric">Esc.</th>${bundle.config.parties.map(p=>`<th scope="col" class="numeric"><abbr title="${esc(p.name)}">${esc(partyShort(p.id))}</abbr></th>`).join('')}<th scope="col" class="numeric">Blanco</th><th scope="col" class="numeric">Nulos</th></tr></thead><tbody>${[...bundle.provinces.districts].sort((a,b)=>a.name.localeCompare(b.name,'es')).map(p=>{const r=result.districts[p.id];return `<tr><td>${esc(p.name)}</td><td class="numeric">${p.seats}</td>${bundle.config.parties.map(x=>`<td class="numeric">${r.partyVotes[x.id]===undefined?'—':`${fmt(r.partyVotes[x.id])} · <strong>${fmt(r.seatsByParty[x.id])}</strong>`}</td>`).join('')}<td class="numeric">${fmt(r.blankVotes)}</td><td class="numeric">${fmt(r.invalidVotes)}</td></tr>`;}).join('')}</tbody></table></div>`;}
function defaultOffer(){return bundle.config.topics.map(t=>state.commitments.includes(t.id)?2:1);}
function programmeView(offer,editing=false){
  const proposer=state.negotiation.proponent,meta=party(proposer),priorities=proposer==='P1'?state.commitments:meta.defaultCommitments;
  return `${bundle.config.topics.map((t,i)=>{
    const position=t.poles?.find(p=>p.id===(proposer==='P1'?state.parties.P1.positions[t.id]:meta.positions[t.id]))?.label;
    const level=['Fuera del acuerdo','Atención limitada','Prioridad','Máxima prioridad'][offer[i]]||'Revisa el reparto';
    return `<div class="offer-topic"><div class="topic-name">${esc(t.name)}<small>${esc(level)}${priorities.includes(t.id)?` · prioridad de ${esc(meta.name)}`:''}${proposer!=='P1'&&state.commitments.includes(t.id)?' · prioridad de tu campaña':''}</small><span class="pact-topic-position">Postura de ${esc(meta.name)}: ${esc(position||t.name)}</span></div><div class="offer-counter">${editing?`<button type="button" data-offer-index="${i}" data-offer-delta="-1" aria-label="Reducir ${esc(t.name)}" ${ui.offer[i]<=0?'disabled':''}>−</button>`:''}<output aria-label="Unidades para ${esc(t.name)}">${fmt(offer[i])}</output>${editing?`<button type="button" data-offer-index="${i}" data-offer-delta="1" aria-label="Aumentar ${esc(t.name)}" ${ui.offer[i]>=bundle.config.negotiation.maxUnitsPerTopic?'disabled':''}>+</button>`:''}</div></div>`;
  }).join('')}`;
}
function pactContextView(story){
  if(!story)return '';
  return `<section class="pact-context" aria-label="Prioridades y renuncias del acuerdo"><strong>${esc(story.headline)}</strong><div class="pact-focus">${story.focus.map(t=>`<span class="pact-focus-topic ${t.ownPriority&&t.units<bundle.config.negotiation.commitmentMinUnits?'reduced':''}"><b>${esc(t.name)}</b><small>${esc(t.levelLabel)}</small></span>`).join('')}</div><p class="pact-tradeoff" data-reputation-cost="${story.tradeoff.reputationCost}">${esc(story.tradeoff.text)}</p><details class="pact-reading"><summary>Cómo leer este acuerdo</summary><p>Repartes seis unidades de atención política: 0 deja un tema fuera; 1 le da atención limitada; 2 lo convierte en prioridad y 3 en máxima prioridad. Las dos prioridades de campaña se mantienen con al menos 2 cada una.</p><p>El reparto y la postura del proponente son cosas distintas. El acuerdo no cambia las posturas declaradas de los partidos.</p></details></section>`;
}
function pactPartyView(row){
  return `<div class="pact-party-row" data-pact-party="${row.partyId}" style="${partyStyle(row.partyId)}"><div class="pact-party-heading"><button type="button" data-act="character" data-party="${row.partyId}" class="rival-reply-face" aria-label="Ver a ${esc(row.name)}">${partyPortrait(row.partyId)}</button><span><strong>${esc(row.name)}</strong><small>${fmt(row.seats)} escaños · ${esc(row.shortReason||row.reason)}</small></span><b>${voteLabels[row.vote]||'—'}</b></div>${row.seats>0?`<details class="pact-party-reading"><summary>Qué busca este partido</summary><p>${esc(row.ask)}</p>${row.publicAgenda?`<p class="meeting-programmes"><strong>Programas públicos · ${esc(row.publicAgenda.topicName)}</strong>${esc(row.publicAgenda.summary)}</p><small>El reparto asigna atención al tema; no cambia las posturas.</small>`:''}<p class="pact-engine-reason">${esc(row.reason)}</p>${row.antecedent?`<button type="button" class="text-button" data-act="antecedent" data-entry="${esc(row.antecedent.entryId)}">${esc(row.antecedent.label)}</button>`:''}</details>`:''}</div>`;
}
function voteHemicycleView(preview,{actual=false}={}){
  if(!preview?.totals||!preview?.votes)return '';
  const seats=electionResult()?.national.seatsByParty||{},order=bundle.config.parties.map(p=>p.id).sort((a,b)=>Number(seats[b]||0)-Number(seats[a]||0));
  return `<div class="ballot-scene" aria-label="${actual?'Votación celebrada':'Votación prevista'}: ${preview.totals.yes} síes, ${preview.totals.no} noes, ${preview.totals.abstain} abstenciones">${hemicycle(seats,order,partyPalette(),{votes:preview.votes,totals:preview.totals,actual})}<p class="ballot-ring-key"><span class="yes">Aro verde: sí</span><span class="no">Aro rojo: no</span><span class="abstain">Aro discontinuo: abstención</span></p><p class="small muted">El interior identifica al partido. ${actual?'Estos votos ya se han registrado.':'Votar sigue siendo una decisión explícita.'}</p></div>`;
}
function counterofferView(){
  const choices=counterofferOptions(state,sourceBundle);if(!choices.length){const n=state.negotiation,cost=bundle.config.negotiation.counterofferBudgetCost,cash=state.parties.P1.budget;return cash<cost&&n?.stage==='vote'&&n.ballot===1&&!n.exchanges.some(e=>e.proponent===n.proponent)?`<div class="counteroffer-unavailable"><button type="button" disabled aria-describedby="counteroffer-cash-reason">Contraoferta · ${cost} de caja</button><p id="counteroffer-cash-reason">Tienes ${fmt(cash)}; faltan ${fmt(cost-cash)}. Puedes votar sin hacer una contraoferta.</p></div>`:'';}
  const selected=choices.find(c=>c.id===ui.counterofferId);
  const useful=choices.filter(c=>counterofferAssessment(c).kind==='better'),others=choices.filter(c=>counterofferAssessment(c).kind!=='better');
  const cards=items=>items.map(item=>{const assessment=counterofferAssessment(item);return `<button type="button" class="counteroffer-card" data-counteroffer-choice="${esc(item.id)}" aria-pressed="${selected?.id===item.id}" style="${partyStyle(item.target)}"><strong>${esc(party(item.target)?.name)} · ${esc(assessment.title)}</strong><span>Recortar ${esc(bundle.config.topics[item.from]?.name)} para reforzar ${esc(bundle.config.topics[item.to]?.name)}</span><small>${fmt(item.cost)} de caja${item.accepted||item.cost===0?'':' aunque la rechace'} · Sí ${fmt(item.before.totals.yes)} → ${fmt(item.after.totals.yes)} · No ${fmt(item.before.totals.no)} → ${fmt(item.after.totals.no)}</small>${assessment.warning?`<small class="counteroffer-warning">${esc(assessment.warning)}</small>`:''}</button>`;}).join('');
  const hypothetical=state.negotiation.proponent!=='P1';
  return `<details class="play-details counteroffers" data-ui-fold="counteroffer" ${ui.folds?.counteroffer?'open':''}><summary>Explorar un intercambio de prioridades</summary>${hypothetical?'<p class="counteroffer-basis">Apoyos de estas tarjetas <strong>si tú votas sí</strong>. Tu voto seleccionado se conserva hasta que lo cambies.</p>':''}${useful.length?`<div class="counteroffer-choices">${cards(useful)}</div>`:'<p>No hay un intercambio que mejore ahora los apoyos previstos. Puedes votar directamente.</p>'}${others.length?`<details class="counteroffer-secondary" ${selected&&others.includes(selected)?'open':''}><summary>Otros intercambios · sin mejora de apoyos</summary><div class="counteroffer-choices">${cards(others)}</div></details>`:''}${selected?`<div class="counteroffer-confirm">${counterofferAssessment(selected).warning?`<p class="note warning counteroffer-warning" role="status">${esc(counterofferAssessment(selected).warning)}</p>`:''}<p>${esc(selected.reason)}</p>${selected.reviewedCommitments.length?`<p class="note warning">${selected.accepted?'Revisa':'Si se aceptara, revisaría'} ${esc(selected.reviewedCommitments.map(id=>topic(id)?.name||id).join(' y '))}. ${state.negotiation.proponent==='P1'?'Si tu candidatura logra la investidura, revisar prioridades tiene coste en reputación.':'Este recorte no añade una penalización de reputación por votar la propuesta ajena.'}</p>`:''}${!selected.accepted&&selected.cost===0?'<p>La respuesta prevista es no. Puedes consultar el motivo sin gastar ni agotar un intercambio.</p>':`<button type="button" class="primary" data-act="confirm-counteroffer">Gastar ${fmt(selected.cost)} y plantear la contraoferta →</button>`}</div>`:'<p class="small muted">Elige una tarjeta y confirma el gasto. Hay un intercambio por propuesta; también puedes votar directamente.</p>'}</details>`;
}
function tutorialPresentation(){
  const view=tutorialStep(state,ui.tutorial);
  if(view&&state?.phase==='election'&&Number(ui.revealIndex||0)<electionRevealSteps(state,sourceBundle).length)
    return {...view,id:'recount',title:'Sigue la noche electoral',body:'Descubre el resultado de estas provincias o salta al Congreso completo. Después podrás negociar los apoyos.',targetSelector:'[data-act="next-reveal"]',canAdvance:false,teamTips:null};
  return view;
}
function tutorialView(){
  const view=tutorialPresentation();if(!view)return '';
  const index=TUTORIAL_STEP_IDS.indexOf(view.id)+1;const initialComplete=view.chapter==='initial-complete';const count=initialComplete?'Primer turno · listo':view.id==='recount'?'Noche electoral':view.id==='pact'?'Pactos · 1 / 1':`Guía del turno · ${index} / 4`;
  return `<section class="tutorial-coach" aria-labelledby="tutorial-title"><div><span class="tutorial-count">${esc(count)}</span><h3 id="tutorial-title" tabindex="-1">${esc(view.title)}</h3></div><p>${esc(view.body)}</p>${view.teamTips?`<details class="tutorial-team-tips"><summary>¿Para qué sirve cada tarea?</summary><ul>${view.teamTips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><p>El coste total aparece junto a Jugar. Puedes conservar la sugerencia del equipo.</p></details>`:''}<div class="tutorial-controls">${view.teamTips?'<button type="button" data-act="tutorial-team">Probar una tarea (opcional)</button>':''}<button type="button" data-act="tutorial-focus">Ir al control</button>${!initialComplete&&view.id!=='recount'?`<button type="button" data-act="tutorial-next" ${view.canAdvance?'':'disabled'}>${index===TUTORIAL_STEP_IDS.length?'Terminar guía':'Siguiente'}</button>`:''}<button type="button" class="text-button" data-act="tutorial-skip">Ocultar guía</button></div></section>`;
}
function rememberTutorial(){saveTutorialProgress(ui.tutorial);}
function focusTutorialControl(){
  const view=tutorialPresentation();if(!view)return;
  let targets=[...document.querySelectorAll(view.targetSelector)].filter(el=>el.getClientRects().length);
  if(view.id==='action'&&matchMedia('(max-width:760px)').matches){const mobile=document.querySelector('[data-act="confirm-plan-mobile"]');if(mobile&&!mobile.disabled)targets=[mobile];}
  const target=targets.find(el=>!el.disabled);
  if(!target&&state.phase==='planning'&&view.id==='action'){
    const check=validatePlan(state,ui.plan,sourceBundle),summary=document.getElementById('prepared-plan');
    summary?.focus();summary?.scrollIntoView({block:'nearest',behavior:'instant'});
    announce(`${check.error?.message||'Revisa tu agenda.'} Puedes cambiar la jugada o las tareas; el coste del equipo también cuenta.`);return;
  }
  if(!target){toastMessage('El control llegará al avanzar la partida. Puedes ocultar la guía y continuar.');return;}
  target.focus();target.scrollIntoView({block:'nearest',behavior:'instant'});announce(view.body);
}
function agreementCopy(agreement){
  return agreement?`${party(agreement.winner)?.name||agreement.winner}: ${agreement.offer.map((units,index)=>`${topic(bundle.config.topics[index]?.id)?.name||'Prioridad'} ${units}`).join(' · ')}`:'Sin investidura';
}
function endingMomentView(moment){
  return `<div class="moment-heading"><span aria-hidden="true">${actionIcon(moment.icon)}</span><div><small>${moment.coveredTurns?`Turnos ${moment.coveredTurns.join(" y ")}`:`Turno ${moment.turn}`}</small><h3>${esc(moment.title)}</h3></div></div>${moment.context?`<p class="moment-context">${esc(moment.context)}</p>`:''}${moment.messages?`<div class="moment-messages">${moment.messages.map(m=>`<p><strong>${esc(m.label)}:</strong> ${esc(m.text)}</p>`).join('')}</div>`:''}${moment.question?`<p class="moment-question"><strong>La pregunta:</strong> ${esc(moment.question)}</p>`:''}<p>${esc(moment.summary)}</p>${moment.effects?`<p class="moment-effects">${esc(moment.effects)}</p>`:''}${moment.followup?`<p class="moment-followup"><strong>Después:</strong> ${esc(moment.followup)}</p>`:''}<div class="moment-references">${moment.references.map(ref=>`<button type="button" class="text-button" data-act="antecedent" data-entry="${esc(ref.entryId)}">${esc(ref.label)}</button>`).join('')}</div>`;
}
function endingMomentsView(){
  const moments=campaignRecap(state,sourceBundle);if(!moments.length)return '';
  const featured=moments.find(m=>m.featured),others=featured?moments.filter(m=>m!==featured):moments;
  const spotlight=featured?`<section class="ending-memory" aria-label="Una decisión que marcó tu campaña"><p class="eyebrow">Una decisión para recordar</p>${endingMomentView(featured)}</section>`:'';
  return spotlight+(others.length?`<details class="ending-moments"><summary>${featured?'Otras decisiones de tu campaña':moments.length===1?'Una decisión de tu campaña':`Tu campaña en ${moments.length} decisiones`}</summary><ol>${others.map(moment=>`<li>${endingMomentView(moment)}</li>`).join('')}</ol></details>`:'');
}
function campaignComparisonView(story=finalStory(state,sourceBundle)){
  const retry=story?.retry;
  const alternative=retry&&(retry.title!==story?.retryAdvice?.title||retry.text!==story?.retryAdvice?.text);
  const challenge=alternative?`<details class="comparison-retry alternative-retry"><summary>Explorar otra estrategia</summary><strong>${esc(retry.title)}</strong><p>${esc(retry.text)}</p>${retry.entryId?`<button type="button" class="text-button" data-act="antecedent" data-entry="${esc(retry.entryId)}">Ver la tarea que podrías cambiar</button>`:''}</details>`:'';
  const previous=previousCampaign(state);
  if(!previous)return `<section class="campaign-comparison"><h2>Comparar tus campañas</h2><p>Al terminar otra campaña con la misma clave y configuración podrás comparar sus resultados.</p>${challenge}</section>`;
  const comparison=compareCampaigns(state,previous);
  if(!comparison.compatible)return `<section class="campaign-comparison"><h2>Tu campaña anterior</h2><p>${esc(comparison.reason)}</p><p>${fmt(previous.seats)} escaños en aquella partida. La comparación requiere la misma clave, configuración y reglas.</p>${challenge}</section>`;
  const difference=comparison.decisions[0];
  return `<section class="campaign-comparison comparison-${comparison.seatDelta<0?'negative':comparison.seatDelta>0?'positive':'neutral'}"><h2>Esta vez: ${signed(comparison.seatDelta)} ${Math.abs(comparison.seatDelta)===1?'escaño':'escaños'}</h2><p>Misma clave y configuración. Antes ${fmt(comparison.beforeSeats)}; ahora ${fmt(comparison.afterSeats)}.</p><div class="comparison-territories">${comparison.territories.slice(0,3).map(item=>`<span><strong>${esc(district(item.provinceId)?.name)}</strong> ${fmt(item.before)} → ${fmt(item.after)} <b>${signed(item.delta)}</b></span>`).join('')||'<span>Se mantiene el reparto de tus escaños por provincia.</span>'}</div>${difference?`<p><strong>Primer cambio, turno ${difference.turn}:</strong> ${esc(shortAction({id:difference.before.action,target:difference.before.target}))} → ${esc(shortAction({id:difference.after.action,target:difference.after.target}))}.</p>`:''}<details class="play-details"><summary>Comparar acuerdos</summary><p>Antes: ${esc(agreementCopy(comparison.beforeAgreement))}.</p><p>Ahora: ${esc(agreementCopy(comparison.afterAgreement))}.</p></details>${challenge}</section>`;
}
function influenceView(){
  const objective=campaignObjective(state,sourceBundle),influence=objective.influence;
  const contacts=Object.keys(state.outcome?.votes?.bridges||{});
  if((objective.kind!=='territorial'&&!contacts.length)||!influence)return '';
  return `<div class="influence-result"><strong>${esc(influence.bonus)}</strong>${contacts.length?`<p>El diálogo que preparaste acercó a ${esc(contacts.map(id=>party(id)?.name||id).join(' y '))} a esta mesa.</p>`:''}${influence.pivotal?'<p>Abstenerte habría impedido esta investidura.</p>':influence.blockingPower?'<p>Podías bloquearla con un no; tus síes no eran imprescindibles.</p>':''}${influence.concession?'<p>Una contraoferta logró una concesión verificable a tus prioridades.</p>':''}</div>`;
}
function dialogueBridgeView(proposer,offer){
 if(proposer==='P1')return '';
 const yes=getNegotiationPreview(state,sourceBundle,offer,'yes'),withdrawn=getNegotiationPreview(state,sourceBundle,offer,'abstain');
 const contacts=Object.entries(yes?.details||{}).filter(([id,d])=>d.bridge&&yes.votes[id]!==withdrawn.votes[id]).map(([id])=>id);
 if(!contacts.length)return '';
 return `<div class="note bridge-choice"><strong>Tu campaña puede abrir el acuerdo.</strong><p>Si votas sí, el diálogo que preparaste acerca a ${esc(contacts.map(id=>party(id)?.name||id).join(' y '))} a la propuesta de ${esc(party(proposer)?.name||proposer)}.</p><p>Si te abstienes: ${fmt(withdrawn.totals.yes)} síes · ${fmt(withdrawn.totals.no)} noes. Tú decides.</p></div>`;
}
function pactStatus(preview){
  if(!preview)return '';
  const {yes,no}=preview.totals;
  return preview.ballot===2?yes>no?'Puede ganar la segunda votación':'Faltan apoyos para superar los noes':yes>=176?'Puede ganar en primera votación':yes>no?'Necesita segunda votación':'Todavía faltan apoyos';
}
function negotiationView(){
  const recorded=voteRecap(state,sourceBundle);
  // The first-ballot context already appears in pactDecision. Surface the
  // otherwise hidden loss when a different candidature takes the floor.
  const recap=recorded?.kind==='next-proponent'?`<section class="recorded-vote-recap" role="status" aria-label="Resultado confirmado de la votación anterior"><span class="recorded-vote-face" aria-hidden="true">${partyPortrait(recorded.proponent,'concerned')}</span><div><small>Resultado confirmado · segunda votación</small><strong>${esc(recorded.title)}</strong><p class="recorded-vote-totals">${fmt(recorded.totals.yes)} síes · ${fmt(recorded.totals.no)} noes · ${fmt(recorded.totals.abstain)} abstenciones</p><p>${esc(recorded.context.text)}</p></div></section>`:'';
  return recap+pactDecision({state,sourceBundle,bundle,ui,h:{esc,fmt,party,partyBadge,phaseHeading,programmeView,pactPartyView,previewBody,voteHemicycleView,counterofferView,proposalOrderView,dialogueBridgeView,partyPortrait}});
}
function closingCastView(vote){
  if(!vote?.votes)return '';
  return `<div class="closing-cast" aria-label="El voto de cada partido">${bundle.config.parties.filter(p=>state.electionResult.national.seatsByParty[p.id]>0).map(p=>`<div class="closing-party" style="${partyStyle(p.id)}"><span class="closing-face">${partyPortrait(p.id)}</span><strong>${esc(p.short||p.name)}</strong><span class="closing-vote vote-${vote.votes[p.id]}">${esc(voteLabels[vote.votes[p.id]])}</span></div>`).join('')}</div>`;
}
function previewBody(p){const totals=p.totals;return `<div class="vote-totals"><div><strong>${fmt(totals.yes)}</strong><small>Síes</small></div><div><strong>${fmt(totals.no)}</strong><small>Noes</small></div><div><strong>${fmt(totals.abstain)}</strong><small>Abstenciones</small></div></div><div class="vote-bar" aria-hidden="true"><span class="yes" style="width:${Number(totals.yes)/350*100}%"></span><span class="no" style="width:${Number(totals.no)/350*100}%"></span><span class="abstain" style="width:${Number(totals.abstain)/350*100}%"></span></div><p class="note section-gap">${p.ballot===2?totals.yes>totals.no?'La propuesta reúne más síes que noes.':totals.yes===totals.no?'Hay empate. La segunda votación exige más síes que noes.':`Los noes superan a los síes en ${fmt(totals.no-totals.yes)}. Necesitas que cambie ese balance.`:totals.yes>=176?'La propuesta reúne mayoría absoluta.':`Faltan ${Math.max(0,176-totals.yes)} síes para alcanzar la mayoría absoluta.`}</p><div class="section-gap">${bundle.config.parties.map(x=>`<details class="vote-party"><summary>${partyBadge(x.id)}<span class="vote-chip">${voteLabels[p.votes[x.id]]||'—'} · ${fmt(electionResult()?.national.seatsByParty[x.id])}</span></summary><p>${esc(p.details?.[x.id]?.reason||'El voto depende de la propuesta y las relaciones de esta partida.')}</p></details>`).join('')}</div>`;}
function endingView(){const o=state.outcome||{},objective=campaignObjective(state,sourceBundle),lastVote=o.votes||state.negotiation?.history?.at(-1);const result=electionResult();const story=finalStory(state,sourceBundle);const headline=story?.headline||(o.type==='government'?'Tu campaña llega al Gobierno.':o.type==='support'?objective.pivotal?'Tu apoyo decide el acuerdo.':'Tu campaña participa en el acuerdo.':o.type==='opposition'?'Tu campaña abre una oposición.':'El Congreso queda sin acuerdo.');const body=o.type==='government'?`La propuesta de ${party('P1')?.name} ha sido investida. Los compromisos que has construido ahora forman parte del resultado.`:o.type==='support'?`La propuesta de ${party(o.winner)?.name||'otra candidatura'} ha sido investida con tu apoyo.`:o.type==='opposition'?`La propuesta de ${party(o.winner)?.name||'otra candidatura'} ha sido investida. ${party('P1')?.name} conserva sus escaños desde la oposición.`:'Ninguna de las propuestas de este desenlace breve ha reunido la mayoría. La partida termina con el acuerdo pendiente.';return `<p class="eyebrow">El resultado de tu campaña</p><h1 class="ending-headline" id="phase-heading" tabindex="-1">${esc(headline)}</h1><div class="outcome-grid"><section><p class="lead">${esc(story?.lead||body)}</p>${story?.retryAdvice?`<div class="ending-retry-story"><strong>${esc(story.retryAdvice.title)}</strong><p>${esc(story.retryAdvice.text)}</p></div>`:""}<div class="ending-controls"><button type="button" class="primary" data-act="replay">Repetir esta campaña →</button><button type="button" data-act="export">Guardar archivo</button><button type="button" class="secondary" data-act="new" data-new-story="true">Nueva campaña personalizada</button></div><p class="replay-note">Al repetir conservas escenario, dificultad, clave, candidato y equipo. Tus nuevas decisiones pueden cambiar el recorrido.</p>${influenceView()}<div class="ending-decisions"><h2>Las claves del desenlace</h2>${story?.details.length?story.details.map(text=>`<p>${esc(text)}</p>`).join(''):'<p class="empty-text">Consulta el historial para recorrer la campaña.</p>'}<button type="button" class="text-button" data-act="history">Abrir el historial completo</button></div><div class="ending-result"><strong>${fmt(result?.national.seatsByParty.P1)}</strong><span>escaños de ${esc(party('P1')?.name)}</span></div>${campaignComparisonView(story)}${endingMomentsView()}</section><aside class="paper-card">${lastVote?.totals?`<h2>${o.type==='deadlock'?'La última votación registrada':'La votación que cerró el acuerdo'}</h2><p class="small">Propuesta de ${esc(party(lastVote.proponent||o.winner)?.name||'otra candidatura')}</p>${closingCastView(lastVote)}${voteHemicycleView(lastVote,{actual:true})}<div class="vote-totals"><div><strong>${fmt(lastVote.totals.yes)}</strong><small>Síes</small></div><div><strong>${fmt(lastVote.totals.no)}</strong><small>Noes</small></div><div><strong>${fmt(lastVote.totals.abstain)}</strong><small>Abstenciones</small></div></div>`:''}<h2>Lo que te llevas.</h2><h3>Tus prioridades iniciales</h3>${state.commitments.map(id=>{const revised=(o.reviewedCommitments||[]).some(x=>(typeof x==='string'?x:x.id)===id);const fulfilled=lastVote?.offer?.[bundle.config.topics.findIndex(t=>t.id===id)]>=bundle.config.negotiation.commitmentMinUnits;return `<div class="relationship-row"><span>${esc(topic(id)?.name||id)}</span><span class="badge">${lastVote&&['government','support'].includes(o.type)?fulfilled?'En el acuerdo':'Reducida':revised?'Alcance revisado':'Registrada'}</span></div>`;}).join('')}${promisesBody()}<hr class="separator">${relationshipsBody(false)}<details class="turn-review"><summary>Repasar la campaña con perspectiva</summary><p>¿Qué decisión cambió tu recorrido? ¿En qué provincia invertiste demasiado o demasiado poco? ¿Qué relación te abrió una posibilidad de acuerdo?</p><p>El historial permite seguir los efectos de cada decisión. Repetir con la misma clave te deja probar otra estrategia.</p></details></aside></div>`;}

function openDialog(title,content){if(!dialog.open)dialogReturnFocus=document.activeElement;dialog.innerHTML=`<div class="dialog-heading"><h2 id="dialog-title">${esc(title)}</h2><button type="button" data-act="close-dialog" aria-label="Cerrar panel">×</button></div><div class="dialog-body">${content}</div>`;if(!dialog.open)dialog.showModal();dialog.querySelector('button')?.focus();}
function closeDialog(){dialog.close();}
dialog.addEventListener('close',()=>{if(dialogReturnFocus?.isConnected)dialogReturnFocus.focus({preventScroll:true});else focusHeading();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
function rivalStanding(id){
  const row=campaignRanking(state.publishedPolls?.P1,bundle.config.parties).find(r=>r.partyId===id);
  return row?.projection?`Posición ${row.rank} · ${fmt(row.projection.min)}–${fmt(row.projection.max)} escaños estimados`:'Sin proyección disponible';
}
function rivalsDialog(){
  const voices={
    agresivo:{label:'Busca el contraste',line:'«Si el debate cambia, el mapa también puede cambiar.»'},
    territorial:{label:'Cuida el territorio',line:'«La campaña nacional pasa por aquí. Quiero que se note.»'},
    prudente:{label:'Construye con paciencia',line:'«Antes de prometer un acuerdo, hagamos las cuentas.»'},
  };
  openDialog('Cinco rivales. Cinco campañas.',`${projectionView()}<div class="rival-profiles">${bundle.config.parties.filter(p=>p.id!=='P1').map(p=>{
    const voice=voices[p.archetype]||{label:'Tiene su propia agenda',line:'«El siguiente turno también cuenta.»'};
    const relation=Number(state.parties.P1.relations?.[p.id]||0);
    return `<article class="rival-profile">${partyBadge(p.id)}<span class="rival-trait">${esc(voice.label)}</span><blockquote>${esc(voice.line)}</blockquote><p class="small">${esc(rivalStanding(p.id))}</p><p class="small muted">Relación contigo: ${signed(relation)}. ${relation>=bundle.config.negotiation.minRelationForAutomaticSupport?'La conversación está abierta; aún cuentan las diferencias de programa.':`Para considerar un acuerdo necesita ${bundle.config.negotiation.minRelationForAutomaticSupport} de relación.`}</p></article>`;
  }).join('')}</div><p class="small muted">El ranking usa tu sondeo, no la información privada de los rivales. Sus jugadas se revelan al cerrar cada turno.</p>`);
}

function helpDialog(){openDialog('Tu campaña, paso a paso.',`<ol class="help-list"><li><div><strong>Empieza jugando.</strong><p>Partida personalizada te permite elegir partido, crear candidato y preparar equipo y programa. Para la primera partida recomendamos Campaña abierta e Iniciación. Partida rápida aleatoria sortea la configuración si prefieres empezar enseguida. También eliges tu primer titular político.</p></div></li><li><div><strong>Resuelve lo que sucede.</strong><p>Cada turno empieza con una escena. Las decisiones muestran su coste y quién queda ocupado. El debate tiene tres momentos.</p></div></li><li><div><strong>Elige tu agenda.</strong><p>Elige tu jugada; el equipo propone hasta dos tareas que se harán a la vez. Puedes dejarlas o pulsar Cambiar tareas. Gastan presupuesto, no energía. El total aparece junto a Jugar.</p></div></li><li><div><strong>Da una tarea clara a cada persona.</strong><p>Organizar voluntarios deja un equipo local que da apoyo cada turno. Ensayar intervención mejora Medios incluso hoy y ayuda en el debate. Reunirse para pactar mejora la relación con el rival que elijas sin asegurar su voto. Ahorrar cuesta cero. En Explorar todas las tareas quedan publicidad, sondeos y asociaciones.</p></div></li><li><div><strong>Lee la campaña que cambia.</strong><p>El ranking y los márgenes propios sirven para buscar un escaño o defenderlo. Los sondeos son intervalos y los rivales actúan al cerrar el turno. Contrastar información mejora la precisión. Una relación civil puede abrir escenas; no transfiere votos automáticamente.</p></div></li><li><div><strong>Convierte escaños en acuerdos.</strong><p>Tras ${fmt(bundle.config.turns)} turnos llegan el recuento y hasta ${fmt(bundle.config.negotiation.rounds)} propuestas de investidura. Primera votación: 176 síes. Segunda: más síes que noes.${['0.7.0','0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(bundle.config.rulesVersion)?' Entre tus dos votaciones puedes revisar una prioridad por 2 de caja, una sola vez, o votar directamente.':''}</p></div></li><li><div><strong>Vuelve con otra idea.</strong><p>Guarda la partida como archivo, consulta el historial y repite la campaña con la misma clave para probar decisiones diferentes.</p></div></li></ol><div class="note">Si te quedas sin caja, puedes reservar tiempo y mantener disponible al equipo. Cada escena conserva una alternativa gratuita.</div>${state?'<div class="button-row"><button type="button" data-act="tutorial-resume">Retomar guía jugando</button><button type="button" data-act="tutorial-start">Reiniciar guía</button></div>':''}<p class="small muted section-gap">Puedes recorrer todos los controles con <span class="key">Tab</span>, marcar opciones con <span class="key">Espacio</span>, activar botones con <span class="key">Enter</span> y cerrar este panel con <span class="key">Esc</span>.</p>`);}
function calculationDialog(){openDialog('Votos, sondeos y escaños.',`<p>Los sondeos muestran bandas estimadas de apoyo. La organización, la reputación y las acciones influyen en el atractivo de cada candidatura dentro del simulador. Los rivales trabajan con su propia información.</p><p>En el recuento, el censo sintético y la participación del escenario producen votos enteros. En las provincias, las candidaturas necesitan un 3 % de los votos válidos —incluido el voto en blanco— para participar en el reparto D’Hondt. Los nulos no entran en ese umbral.</p><p>El reparto ordena los cocientes de cada candidatura hasta asignar todos los escaños provinciales. Ceuta y Melilla atribuyen su único escaño a la candidatura más votada. Los desempates reproducibles están registrados en el resultado.</p><p>El reparto provincial está fijado en el anexo de 2023: 52 circunscripciones y 350 escaños. Los votos, electores y partidos de esta campaña son ficticios.</p><p>Al cerrar el turno, la tarjeta Sondeo compara la estimación provincial anterior con la nueva, después de todas las agendas. Incluye tu campaña, las jugadas rivales y el margen de error. El Impulso de tu jugada muestra por separado el efecto individual calculado por el modelo: puede ser positivo aunque el sondeo baje.</p><p>Las oportunidades propias muestran cuánto te separa de ganar el siguiente escaño o el margen que protege el último de tu candidatura. Usan la estimación publicada; no garantizan un resultado.</p><p>En la investidura, la primera votación exige 176 síes; la segunda, más síes que noes. Una abstención es distinta de un voto negativo.</p><a href="./credits.html" target="_blank" rel="noopener noreferrer">Consultar créditos y fuentes institucionales ↗</a>`);}
function teamDialog(){const memories=staffMemories(state,sourceBundle,{beforeTurn:state.turn+1});openDialog('Tu equipo y tus relaciones.',`<div class="grid-two">${state.selectedStaff.map(id=>{const p=staff(id),memory=memories.find(m=>m.staffId===id);return `<article class="paper-card"><div class="action-person"><div class="avatar">${portrait(id,'staff')}</div><div><strong>${esc(p.name)}</strong><small>${esc(staffLabels[p.specialty])}</small></div></div><p class="small">${esc(memory?.text||staffVoices[id])}</p>${memory?`<button type="button" class="story-antecedent" data-act="antecedent" data-entry="${esc(memory.entryId)}">↶ Ver el turno ${memory.turn}</button>`:''}<p class="small muted">${esc(staffBonus(p))}</p>${state.reservedStaff.includes(id)?'<span class="badge">Ocupado por la escena de este turno</span>':''}</article>`;}).join('')}</div><div class="section-gap"><h3>Relaciones</h3>${relationshipsBody(true)}${promisesBody()}</div>`);}
function recordedPoliticalChoiceView(entry){
  if(currentPresentation()&&entry.kind==='event'&&['E13','E15','E22','E25','E27','E28','E30','E36'].includes(entry.eventId)){
    const story=eventStory(state,sourceBundle,{eventId:entry.eventId,turn:entry.turn});
    const speech=story?.optionSpeeches?.[entry.optionId];
    return speech?`<p><strong>Tu respuesta:</strong> «${esc(speech)}»</p>`:'';
  }
  if(['0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)&&entry.kind==='event'&&entry.eventId==='E31'){const story=eventStory(state,sourceBundle,{eventId:entry.eventId,turn:entry.turn});return story?.optionSpeeches?.[entry.optionId]?`<p><strong>Tu apuesta antes del debate:</strong> «${esc(story.optionSpeeches[entry.optionId])}»</p><p>${esc(story.optionPlans[entry.optionId])}</p>`:'';}
  if(!['0.7.1','0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)||entry.kind!=='event'||!(['0.8.0','0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)?['E01','E06','E09','E29','E32','E35','E38',...(['0.8.1','0.8.2', '0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)?['E04','E10','E11']:[]),...(['0.8.2','0.8.3','0.8.4','0.8.5'].includes(state.contentVersion)?['E05','E08','E34','E14','E23','E02','E03']:[])]:['E06','E09']).includes(entry.eventId))return '';
  const story=eventStory(state,sourceBundle,{eventId:entry.eventId,turn:entry.turn});
  const speech=story?.optionSpeeches?.[entry.optionId];
  return `${story?.briefingDecision?`<p><strong>El borrador:</strong> ${esc(story.briefingDecision.draft)}</p><p><strong>Lo que ocurre:</strong> ${esc(story.briefingDecision.fact)}</p>`:''}${story?.discipline?`<p><strong>El anuncio de Rafa:</strong> «${esc(story.discipline.announcement)}»</p><p><strong>Tu programa:</strong> «${esc(story.discipline.proposal)}»</p>`:''}${contradictionMessagesView(story)}${story?.economicDecision?`<p><strong>La pregunta:</strong> ${esc(story.economicDecision.question)}</p>`:''}${story?.call?`<p><strong>${esc(party(story.call.target)?.name)}:</strong> «${esc(story.call.request)}»</p>`:''}${speech?`<p><strong>Tu respuesta:</strong> «${esc(speech)}»</p>`:''}`;
}
function historyDialog(){openDialog('El recorrido de tu campaña.',`<ol class="history-list">${(state.timeline||[]).length?state.timeline.map(t=>`<li><small>Turno ${fmt(t.turn)} · ${esc(t.kind==='event'||t.kind==='choice'?'Decisión':t.kind==='rival'?'Movimiento rival':t.kind==='plan'?'Agenda':'Campaña')}</small><h3>${esc(t.title||'Movimiento de campaña')}</h3>${t.body?`<p>${esc(t.body)}</p>`:''}${recordedPoliticalChoiceView(t)}${changesList(t.changes||t.entries||[],10)}${t.learning?`<details><summary>La decisión con perspectiva</summary><p>${esc(learningText(t.learning))}</p></details>`:''}</li>`).join(''):'<li>No hay decisiones registradas todavía.</li>'}</ol><div class="button-row section-gap"><button type="button" data-act="export">Guardar archivo de partida</button></div>`);}
function persist(){try{const result=saveGame(state,sourceBundle);ui.saved=!!result.ok;ui.storageNotice=result.ok?'':'No se pudo autoguardar. Guarda un archivo para conservar esta partida.';if(!result.ok)toastMessage('No se pudo guardar en el navegador. Usa «Guardar archivo» para conservar la partida.',true);}catch{ui.saved=false;ui.storageNotice='El guardado local no está disponible. Guarda un archivo para conservar esta partida.';toastMessage('Este navegador no permite guardar aquí. Puedes exportar la partida como archivo.',true);}if(state.phase==='ending')recordCampaign(state);resumeState=state;}
function send(command){
  if(!state)return {ok:false,error:{code:'NO_GAME',message:'No hay una partida abierta.'}};
  const oldPhase=state.phase,oldTurn=state.turn,oldProponent=state.negotiation?.proponent;
  const cmd={...command,id:command.id||`ui-${state.revision+1}-${++commandCounter}`,expectedRevision:command.expectedRevision??state.revision};
  let result;try{result=engineDispatch(state,cmd,sourceBundle);}catch(e){toastMessage(e.message||'No se pudo aplicar la decisión.',true);return {ok:false,error:{code:'UI_COMMAND_ERROR',message:e.message}};}
  if(!result.ok){toastMessage(result.error?.message||'Revisa esta decisión.',true);return result;}
  if(command.type==='CONFIRM_PLAN'&&ui.teamPractice)ui.teamPractice=submitTeamPractice(ui.teamPractice,state,command.plan,validatePlan(state,command.plan,sourceBundle));
  else if(oldPhase!==result.state.phase||oldTurn!==result.state.turn)ui.teamPractice=null;
  state=result.state;ui.screen='game';
  if(oldPhase!==state.phase||oldTurn!==state.turn){
    ui.plan=null;ui.teamMode='auto';ui.teamChangeNotice='';ui.editingStaff=null;ui.folds={};if(state.phase==='election')ui.revealIndex=0;
    if(state.phase==='planning'&&state.turn>1)ui.province=suggestedVisit(state.publishedPolls.P1,resolveCampaignBundle(sourceBundle,state),state.lastVisitedProvince||state.focusProvince)?.provinceId||state.focusProvince;
  }
  if(state.phase==='negotiation'&&(oldPhase!==state.phase||oldProponent!==state.negotiation?.proponent)){
    ui.offer=null;ui.counterofferId=null;ui.vote=state.negotiation?.proponent==='P1'?'yes':'no';
  }
  if(command.type==='COUNTEROFFER'){ui.counterofferId=null;ui.folds.counteroffer=false;}
  persist();render(true);announce(state.lastTransition?.title||`Turno ${state.turn}. ${state.phase==='event'?'Nueva situación.':state.phase==='planning'?'Elige tu jugada.':state.phase==='debrief'?'Turno resuelto.':'Decisión registrada.'}`);
  window.scrollTo({top:0,behavior:'instant'});return result;
}
function startCampaign({quick=false}={}){ui.teamPractice=null;ui.revealIndex=0;ui.counterofferId=null;ui.actorDetails={};ui.staffPalette={};ui.folds={};ui.teamMode='auto';const s=ui.setup;try{state=createGame(sourceBundle,s.seed.normalize('NFC').trim(),{name:s.name.trim(),portrait:s.portrait,profile:s.profile,staff:[...s.staff],commitments:[...s.commitments],positions:{...s.positions},province:s.province,campaignScenario:s.campaignScenario,difficulty:s.difficulty,partyIdentity:s.partyIdentity});if(!ui.tutorial){ui.tutorial=startTutorial(state);rememberTutorial();}ui.screen='game';ui.province=quick?suggestedVisit(state.publishedPolls.P1,bundle,s.province)?.provinceId||s.province:s.province;ui.plan=null;ui.offer=null;persist();render(true);announce('La sala de campaña está abierta. Primera decisión.');window.scrollTo({top:0,behavior:'instant'});}catch(e){toastMessage(e.message||'Revisa las elecciones de candidato y equipo.',true);}}
function quickStart(){
  const values=crypto.getRandomValues(new Uint32Array(4));
  const seed='rapida-'+Array.from(values,n=>n.toString(36)).join('-');
  ui.actorDetails={};ui.staffPalette={};
  ui.setup=randomQuickSetup(sourceBundle,seed);
  bundle=resolveCampaignBundle(sourceBundle,ui.setup);
  startCampaign({quick:true});
}
function exportCurrent(){if(!state){toastMessage('Abre una partida para poder guardarla.',true);return;}try{const text=exportGame(state,sourceBundle);const blob=new Blob([text],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`la-campana-turno-${state.turn}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toastMessage('El archivo de partida está listo para conservarlo o importarlo.');}catch(e){toastMessage(e.message||'No se pudo exportar la partida.',true);}}
function refreshKeepingFocus(id){rememberFolds();const el=document.getElementById(id);const range=el&&typeof el.selectionStart==='number'?[el.selectionStart,el.selectionEnd]:null;render();const next=document.getElementById(id);if(next){next.focus({preventScroll:true});if(range&&typeof next.setSelectionRange==='function'){try{next.setSelectionRange(...range);}catch{}}}}

function rememberFolds(){ui.folds??={};ui.staffPalette??={};document.querySelectorAll('details[data-ui-fold]').forEach(details=>{ui.folds[details.dataset.uiFold]=details.open;});document.querySelectorAll('details[data-staff-palette]').forEach(details=>{ui.staffPalette[details.dataset.staffPalette]=details.open;});}
function chooseTarget(action){if(!action)return null;if(action.target==='province'||action.target==='province_or_national')return canCampaignHere(bundle,ui.province)?ui.province:campaignDestinations(bundle)[0]?.id||null;if(action.target==='civil_actor')return 'C1';if(action.target==='rival_party')return 'P2';return null;}
function handlePlanChange(el){
  ensurePlan();
  const actor=el.dataset.planActor;
  if(actor==='candidate'){
    const action=ui.plan.candidate;
    const id=el.dataset.planField==='id'?el.value:action.id;
    const target=el.dataset.planField==='id'?chooseTarget(actionDefinition(actor,id)):el.value;
    prepareCandidate(id,target);
  }else{
    const plan=ui.plan.staff[actor];if(!plan)return;
    if(el.dataset.planField==='id'){plan.id=el.value;plan.target=chooseTarget(actionDefinition(actor,plan.id));}
    else plan.target=el.value;
    ui.teamMode='manual';ui.teamChangeNotice='';
  }
  refreshKeepingFocus(el.id);
}
function newStoryKey(){return 'campana-'+Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(36)).join('-');}
function newSetup({differentStory=false}={}){try{const seed=differentStory?newStoryKey():ui.setup.seed;const setup=differentStory&&state?structuredClone(state.initialSetup):ui.setup;ui.setup={...setup,seed,name:setup.name||'',partyIdentity:setup.partyIdentity||sourceBundle.config.defaultPartyIdentity,positions:Object.keys(setup.positions).length?{...setup.positions}:defaultPositions()};ui.screen='setup';ui.setupStep=0;ui.setupAll=false;render(true);window.scrollTo({top:0,behavior:'instant'});}catch{toastMessage('No se pudo generar una clave. Puedes escribirla en la configuración.',true);}}

document.addEventListener('click',e=>{
  const issue=e.target.closest('[data-setup-issue]');if(issue){e.preventDefault();const selector=issue.dataset.setupIssue;ui.setupAll=true;render();const target=document.querySelector(selector);target?.focus();target?.scrollIntoView({block:'center',behavior:'instant'});return;}
  const button=e.target.closest('button,[data-map-province]');if(!button||button.disabled)return;
  rememberFolds();
  if(button.dataset.actionActor){const actor=button.dataset.actionActor;if(actor==='candidate')prepareCandidate(button.dataset.actionId);else{ensurePlan();const plan=ui.plan.staff[actor];if(!plan)return;if(plan.id!==button.dataset.actionId){plan.id=button.dataset.actionId;plan.target=chooseTarget(actionDefinition(actor,plan.id));}ui.teamMode='manual';ui.teamChangeNotice='';}render();document.querySelector(`[data-action-actor="${actor}"][data-action-id="${button.dataset.actionId}"]`)?.focus({preventScroll:true});announce(`${shortAction(actor==='candidate'?ui.plan.candidate:ui.plan.staff[actor],actor)}. Pulsa Jugar para ejecutar.`);return;}
  if(button.dataset.option){const selector=document.getElementById(`option-staff-${button.dataset.option}`);const feedback=getEventView(state,sourceBundle).options.find(o=>o.id===button.dataset.option)?.shortFeedback;const result=send({type:'CHOOSE_OPTION',optionId:button.dataset.option,staffId:selector?.value||null});if(result.ok&&feedback)toastMessage(feedback);return;}
  if(button.dataset.command){send({type:button.dataset.command});return;}
  if(button.dataset.province||button.dataset.mapProvince){ui.opportunityKind=button.dataset.opportunityKind||null;ui.province=button.dataset.province||button.dataset.mapProvince;const visitMessage=state?.phase==='planning'&&canCampaignHere(bundle,ui.province)?prepareVisit(ui.province):'Provincia seleccionada.';render();const chosen=document.querySelector(`.province-label[data-province="${ui.province}"],.table-province[data-province="${ui.province}"]`);if(matchMedia('(max-width:760px)').matches&&e.detail>0){const summary=document.querySelector('#prepared-plan');if(summary){summary.focus({preventScroll:true});summary.scrollIntoView({block:'nearest',behavior:'instant'});}else chosen?.focus({preventScroll:true});}else chosen?.focus({preventScroll:true});announce(`${district(ui.province)?.name}: ${visitMessage}`);if(visitMessage.startsWith('Visita no disponible'))toastMessage(visitMessage);return;}
  if(button.dataset.view){ui.table=button.dataset.view==='table';render();document.querySelector(`[data-view="${button.dataset.view}"]`)?.focus({preventScroll:true});return;}
  if(button.dataset.portrait){ui.setup.portrait=button.dataset.portrait;render();document.querySelector(`[data-portrait="${button.dataset.portrait}"]`)?.focus({preventScroll:true});return;}
  if(button.dataset.offerIndex!==undefined){const i=Number(button.dataset.offerIndex);ui.offer[i]=Math.max(0,Math.min(bundle.config.negotiation.maxUnitsPerTopic,ui.offer[i]+Number(button.dataset.offerDelta)));render();const preferred=document.querySelector(`[data-offer-index="${i}"][data-offer-delta="${button.dataset.offerDelta}"]`);(preferred&&!preferred.disabled?preferred:document.querySelector(`[data-offer-index="${i}"][data-offer-delta="${-Number(button.dataset.offerDelta)}"]`))?.focus({preventScroll:true});return;}
  if(button.dataset.counterofferChoice){ui.counterofferId=button.dataset.counterofferChoice;ui.folds.counteroffer=true;render();document.querySelector(`[data-counteroffer-choice="${ui.counterofferId}"]`)?.focus({preventScroll:true});announce('Contraoferta elegida. Revisa la concesión y confirma el gasto.');return;}
  if(button.dataset.offerChoice){const option=suggestPactOffers(state,sourceBundle).find(item=>item.id===button.dataset.offerChoice);if(!option)return;ui.offer=[...option.offer];render();document.querySelector(`[data-offer-choice="${option.id}"]`)?.focus({preventScroll:true});announce(`${option.label}. Presenta la propuesta para pasar a la votación.`);return;}
  if(button.dataset.vote){ui.vote=button.dataset.vote;render();document.querySelector(`[data-vote="${ui.vote}"]`)?.focus({preventScroll:true});return;}
  if(button.dataset.revisionChoice){const choice=secondBallotOptions(state,sourceBundle).find(item=>item.offer.join('-')===button.dataset.revisionChoice);if(choice){ui.revisionOffer=[...choice.offer];ui.folds['last-negotiation']=true;render();document.querySelector(`[data-revision-choice="${button.dataset.revisionChoice}"]`)?.focus({preventScroll:true});announce('Revisión preparada. Comprueba la renuncia y confirma el coste.');}return;}
  switch(button.dataset.act){
    case 'next-reveal':ui.revealIndex=Number(ui.revealIndex||0)+1;render(true);announce('Siguiente resultado provincial confirmado.');break;
    case 'skip-reveal':ui.revealIndex=electionRevealSteps(state,sourceBundle).length;render(true);announce(`Resultado completo: ${electionResult().national.seatsByParty.P1} escaños para tu candidatura.`);break;
    case 'tutorial-start':ui.teamPractice=null;ui.tutorial=startTutorial(state);rememberTutorial();if(dialog.open)closeDialog();render();document.getElementById('tutorial-title')?.focus();break;
    case 'tutorial-resume':ui.tutorial=resumeTutorial(ui.tutorial,state);rememberTutorial();if(dialog.open)closeDialog();render();document.getElementById('tutorial-title')?.focus();break;
    case 'tutorial-focus':focusTutorialControl();break;
    case 'tutorial-next':ui.tutorial=nextTutorial(ui.tutorial,state);rememberTutorial();render();if(ui.tutorial.completed){focusHeading();announce('Guía completada. La campaña sigue en tus manos.');}else document.getElementById('tutorial-title')?.focus({preventScroll:true});break;
    case 'practice-close':ui.teamPractice=null;render();document.getElementById('prepared-plan')?.focus({preventScroll:true});announce('Ejercicio cerrado. Tu plan se conserva; solo Jugar lo ejecuta.');break;
    case 'tutorial-skip':ui.teamPractice=null;ui.tutorial=skipTutorial(ui.tutorial);rememberTutorial();render();focusHeading();announce('Guía oculta. Puedes retomarla desde Guía.');break;
    case 'confirm-counteroffer':{const option=counterofferOptions(state,sourceBundle).find(item=>item.id===ui.counterofferId);if(option)send({type:'COUNTEROFFER',offer:[...option.offer],target:option.target});break;}
    case 'new':newSetup({differentStory:button.dataset.newStory==='true'});break;
    case 'setup-step':ui.setupStep=Number(button.dataset.step);ui.setupAll=false;render();document.querySelector(`[data-act="setup-step"][data-step="${ui.setupStep}"]`)?.focus({preventScroll:true});break;
    case 'setup-next':advanceSetup();break;
    case 'setup-all':ui.setupAll=!ui.setupAll;render();document.querySelector('[data-act="setup-all"]')?.focus({preventScroll:true});break;
    case 'new-story-key':if(ui.screen==='setup')try{ui.setup.seed=newStoryKey();const input=document.getElementById('campaign-seed');if(input){input.value=ui.setup.seed;input.focus({preventScroll:true});}updateSetupReadiness();announce('Clave nueva. Candidato, equipo y programa conservados. Pulsa Abrir la sala de campaña para empezar.');}catch{toastMessage('No se pudo generar una clave. Puedes escribirla en el campo.',true);}break;
    case 'quick-start':quickStart();break;
    case 'character':if(state)characterDialog(button.dataset.party);break;
    case 'respond-rival':{ui.province=button.dataset.targetProvince;ui.opportunityKind=null;const message=prepareVisit(ui.province);render();document.querySelector('[data-act="confirm-plan"]')?.focus({preventScroll:true});announce(`${district(ui.province)?.name}: ${message}`);if(message.startsWith('Visita no disponible'))toastMessage(message);break;}
    case 'keep-route':announce('Tu jugada y las tareas del equipo se mantienen.');break;
    case 'media-style':{const rival=mediaReplyTarget();if(!rival)break;prepareCandidate(button.dataset.style==='compare'?'contrast':'interview',button.dataset.style==='compare'?rival.partyId:'national');render();document.querySelector(`[data-act="media-style"][data-style="${button.dataset.style}"]`)?.focus({preventScroll:true});announce('Respuesta preparada. Revisa coste, equipo y relación antes de Jugar.');break;}
    case 'focus-agenda':{document.getElementById('agenda-title')?.scrollIntoView({block:'start',behavior:'instant'});document.querySelector('.direct-action[aria-pressed="true"], .direct-action:not(:disabled)')?.focus({preventScroll:true});break;}
    case 'focus-map':{const target=document.getElementById('territory-title');target?.scrollIntoView({block:'start',behavior:'instant'});target?.focus({preventScroll:true});break;}
    case 'review-plan':{ui.folds.team=false;render();const target=document.getElementById('prepared-plan');target?.scrollIntoView({block:'center',behavior:'instant'});target?.focus({preventScroll:true});announce('Revisa tu jugada y el coste del equipo. Pulsa Jugar para ejecutarlos.');break;}
    case 'start':if(button.closest('#campaign-setup'))return;startCampaign();break;
    case 'resume':if(resumeState){state=resumeState;resetCampaignView(state);ui.screen='game';render(true);}break;
    case 'home':if(state)resumeState=state;ui.screen='home';render(true);break;
    case 'help':helpDialog();break;
    case 'history':if(state)historyDialog();break;
    case 'antecedent':{const entry=state?.timeline.find(e=>e.id===button.dataset.entry);if(entry)openDialog(`Tu campaña · turno ${entry.turn}`,`<h3>${esc(entry.title)}</h3><p>${esc(entry.body||'Decisión registrada.')}</p>${recordedPoliticalChoiceView(entry)}${changesList(entry.changes||[],10)}`);break;}
    case 'team':if(state)teamDialog();break;
    case 'rivals':if(state)rivalsDialog();break;
    case 'relations':if(state)openDialog('Relaciones y respuestas.',`${relationshipsBody(true)}${promisesBody()}`);break;
    case 'calculation':calculationDialog();break;
    case 'export':exportCurrent();break;
    case 'map-pan':{const map=document.querySelector('.board-wrap');if(map)map.scrollLeft=button.dataset.mapDirection==='east'?map.scrollWidth-map.clientWidth:0;break;}
    case 'import':fileInput.value='';fileInput.click();break;
    case 'close-dialog':closeDialog();break;
    case 'reload':location.reload();break;
    case 'confirm-plan-mobile':
    case 'confirm-plan':send({type:'CONFIRM_PLAN',plan:structuredClone(ui.plan)});break;
    case 'visit-selected':{if(!canCampaignHere(bundle,ui.province)){toastMessage('Tu candidatura no se presenta aquí.');break;}const message=prepareVisit(ui.province);render();document.querySelector('[data-action-id="visit"]')?.focus({preventScroll:true});announce(`${district(ui.province)?.name}: ${message}`);if(message.startsWith('Visita no disponible'))toastMessage(message);break;}
    case 'edit-staff':case 'tutorial-team':case 'change-staff':{if(button.dataset.act==='tutorial-team')ui.teamPractice=beginTeamPractice(state,ui.plan,validatePlan(state,ui.plan,sourceBundle));ui.folds??={};ui.folds.team=true;const actor=button.dataset.staffActor||state.selectedStaff.find(id=>!state.reservedStaff.includes(id));ui.editingStaff=actor;render();const control=actor&&(document.querySelector(`[data-action-actor="${actor}"][aria-pressed="true"]`)||document.getElementById('action-'+actor));(control||document.querySelector('[data-tutorial-target="team"]'))?.focus({preventScroll:true});(control||document.querySelector('[data-tutorial-target="team"]'))?.scrollIntoView({block:'center',behavior:'instant'});break;}
    case 'suggest-team':{ui.teamMode='auto';const suggestion=suggestCampaignPlan(state,sourceBundle,suggestionOptions({candidate:ui.plan.candidate,provinceId:ui.province}));acceptTeamSuggestion(suggestion,true);render();document.querySelector('[data-act="suggest-team"]')?.focus({preventScroll:true});break;}
    case 'propose':send({type:'PROPOSE',offer:[...ui.offer]});break;
    case 'confirm-revision':if(ui.revisionOffer){const result=send({type:'REVISE_OFFER',offer:[...ui.revisionOffer]});if(result.ok)ui.revisionOffer=null;}break;
    case 'vote':send({type:'VOTE',vote:ui.vote});break;
    case 'replay':try{ui.revealIndex=0;ui.counterofferId=null;state=createGame(selectBundle(sourceBundle,state),state.seed,state.initialSetup);resetCampaignView(state);ui.screen='game';persist();render(true);announce('La campaña empieza de nuevo con la misma clave.');window.scrollTo({top:0,behavior:'instant'});}catch(error){toastMessage(error.message||'No se pudo repetir esta campaña.',true);}break;
  }
});
document.addEventListener('submit',e=>{if(e.target.id!=='campaign-setup')return;e.preventDefault();if(advanceSetup())return;const issues=setupIssues(ui.setup);if(issues.length){updateSetupReadiness();document.querySelector(issues[0].target)?.focus();announce(issues[0].message);return;}startCampaign();});
document.addEventListener('toggle',e=>{const details=e.target;if(!details.isConnected)return;if(details.dataset.uiFold){ui.folds??={};ui.folds[details.dataset.uiFold]=details.open;}if(details.dataset.actorDetails){ui.actorDetails??={};ui.actorDetails[details.dataset.actorDetails]=details.open;}if(details.dataset.staffPalette){ui.staffPalette??={};ui.staffPalette[details.dataset.staffPalette]=details.open;}},true);
document.addEventListener('change',e=>{
  const el=e.target;if(el.dataset.planActor){handlePlanChange(el);return;}
  if(el.dataset.ui==='reserve-pacts'){ui.reserveForPacts=el.checked;try{localStorage.setItem(RESERVE_STORAGE_KEY,el.checked?'on':'off');}catch{}if(ui.teamMode!=='manual'){const suggestion=suggestCampaignPlan(state,sourceBundle,suggestionOptions({candidate:ui.plan.candidate,provinceId:ui.province}));acceptTeamSuggestion(suggestion,true);}refreshKeepingFocus(el.id);return;}
  if(el.dataset.ui){ui[el.dataset.ui]=el.value;if(el.dataset.ui!=='search')refreshKeepingFocus(el.id);return;}
  if(el.dataset.setup){const previousSetup={...ui.setup,commitments:[...ui.setup.commitments]};ui.setup[el.dataset.setup]=el.value;if(el.dataset.setup==='campaignScenario'||el.dataset.setup==='partyIdentity'){if(el.dataset.setup==='campaignScenario'){const previousPriorities=campaignCommitments(sourceBundle,previousSetup);if([...previousSetup.commitments].sort().join(',')===[...previousPriorities].sort().join(','))ui.setup.commitments=campaignCommitments(sourceBundle,ui.setup);ui.setup.province=campaignDefinition(sourceBundle,ui.setup).initialProvince;bundle=resolveCampaignBundle(sourceBundle,ui.setup);}else applyPartyPreset();const selected=campaignDefinition(sourceBundle,ui.setup);const identity=partyIdentityDefinition(sourceBundle,ui.setup);render();document.querySelector(`[name="${el.dataset.setup==='campaignScenario'?'campaign-scenario':'party-identity'}"][value="${el.value}"]`)?.focus({preventScroll:true});announce(el.dataset.setup==='campaignScenario'?`${selected.label} seleccionado. ${selected.objective.title}. Tus posturas se conservan; el punto de partida se adapta al reto.`:`${identity.name}. ${identity.ideology}. Posturas y prioridades preparadas.`);return;}if(!['name','seed'].includes(el.dataset.setup)){if(el.dataset.setup==='profile'||el.dataset.setup==='difficulty'){render();document.querySelector(`[name="${el.dataset.setup==='profile'?'profile':'campaign-difficulty'}"][value="${el.value}"]`)?.focus({preventScroll:true});}else refreshKeepingFocus(el.id);}return;}
  if(el.dataset.position){ui.setup.positions[el.dataset.position]=Number(el.value);render();document.querySelector(`[data-position="${el.dataset.position}"][value="${el.value}"]`)?.focus({preventScroll:true});return;}
  if(el.dataset.staff||el.dataset.commitment){const k=el.dataset.staff?'staff':'commitments';const id=el.dataset.staff||el.dataset.commitment;const list=ui.setup[k];if(el.checked){if(list.length>=2){el.checked=false;toastMessage(`Elige dos ${k==='staff'?'colaboradores':'prioridades'}. Retira una selección para cambiarla.`);return;}if(!list.includes(id))list.push(id);}else ui.setup[k]=list.filter(x=>x!==id);render();document.querySelector(`[data-${k==='staff'?'staff':'commitment'}="${id}"]`)?.focus({preventScroll:true});}
});
document.addEventListener('input',e=>{const el=e.target;if(el.dataset.setup&&['name','seed'].includes(el.dataset.setup)){ui.setup[el.dataset.setup]=el.value;updateSetupReadiness();}if(el.dataset.ui==='search'){ui.search=el.value;refreshKeepingFocus(el.id);}});
fileInput.addEventListener('change',async()=>{const file=fileInput.files?.[0];if(!file)return;if(file.size>bundle.config.runtime.maxImportBytes){toastMessage('El archivo supera el tamaño máximo admitido para una partida.',true);return;}try{const text=await file.text();const result=importGame(text,sourceBundle);if(!result.ok){toastMessage(result.error?.message||'La partida no es compatible. Tu partida actual sigue disponible.',true);return;}state=result.state;resetCampaignView(state);ui.screen='game';persist();render(true);announce('Partida importada correctamente.');toastMessage('Partida importada. Puedes continuar desde este punto.');}catch(error){toastMessage(error.message||'No se ha podido abrir el archivo. Tu partida actual sigue disponible.',true);}});

async function boot(){try{try{ui.reserveForPacts=localStorage.getItem(RESERVE_STORAGE_KEY)!=='off';}catch{}ui.tutorial=loadTutorialProgress();const paths=['game_config.json','provinces_2023.json','events.json'];const data=await Promise.all(paths.map(async name=>{const r=await fetch(`./data/${name}`,{cache:'no-store'});if(!r.ok)throw new Error(`No se ha podido abrir ${name}.`);return r.json();}));sourceBundle={config:data[0],provinces:data[1],content:data[2]};ui.setup.campaignScenario=sourceBundle.config.defaultCampaignScenario;ui.setup.difficulty='iniciacion';ui.setup.partyIdentity=sourceBundle.config.defaultPartyIdentity;bundle=resolveCampaignBundle(sourceBundle,ui.setup);const definition=campaignDefinition(sourceBundle,ui.setup);applyPartyPreset({resetProvince:true});const draft=loadSetupDraft(sourceBundle);if(draft)ui.setup={...ui.setup,...draft,positions:{...ui.setup.positions,...draft.positions}};try{const saved=loadGame(sourceBundle);if(saved.ok){resumeState=saved.state;ui.saved=true;if(saved.recovered)ui.storageNotice='Se recuperó una copia anterior de la partida. Comprueba el turno al continuar.';}else if(saved.error?.code==='NO_VALID_SAVE')ui.storageNotice='Las copias locales no se han podido abrir. Puedes importar un archivo de partida; las copias siguen conservadas.';else if(saved.error?.code==='STORAGE_UNAVAILABLE')ui.storageNotice='El guardado local no está disponible en este navegador.';}catch{ui.storageNotice='No se ha podido acceder al guardado local.';}if(['localhost','127.0.0.1','::1'].includes(location.hostname)){Object.defineProperty(window,'__campaign',{value:{getState:()=>state,bundle:sourceBundle,dispatch:send},configurable:true});}render();}catch(error){app.innerHTML=`${header()}<main id="main" tabindex="-1" class="loading-view"><p class="eyebrow">La campaña</p><h1 tabindex="-1">La sala no se ha podido abrir.</h1><p>${esc(error.message||'Revisa los archivos locales del prototipo.')}</p><p class="note">Abre el juego desde su servidor local. Si la ventana ya estaba abierta, recárgala después de iniciar el servidor.</p><button type="button" data-act="reload">Volver a intentarlo</button></main>`;}}
window.addEventListener('resize',()=>{
  const menu=document.querySelector('.tools-menu');if(!menu)return;
  const wide=!matchMedia('(max-width:760px)').matches;
  if(wide||menu.dataset.wide==='true')menu.open=wide;
  menu.dataset.wide=String(wide);
});
boot();
