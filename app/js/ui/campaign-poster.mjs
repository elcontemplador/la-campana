import {colorInk, portrait} from './visuals.mjs';

const width = 900;
const height = 1125;
const paper = '#fbf5e8';
const ink = '#182831';
const sans = 'Arial, sans-serif';
const serif = 'Georgia, serif';
const posters = new WeakMap();

function linesFor(context, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.trim().split(/\s+/u)) {
    const next = line ? line + ' ' + word : word;
    if (context.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    // A candidate may choose one long name with no spaces.
    for (const char of word) {
      if (line && context.measureText(line + char).width > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(ctx, text, x, y, w, h, size, family, weight = 400) {
  let lines;
  let step;
  for (let chosen = size; chosen >= 12; chosen--) {
    ctx.font = `${weight} ${chosen}px ${family}`;
    lines = linesFor(ctx, text, w);
    step = Math.ceil(chosen * 1.16);
    if (lines.length * step <= h) break;
  }
  for (const [i, line] of lines.entries()) ctx.fillText(line, x, y + i * step);
}

function rule(ctx, y, color = ink) {
  ctx.fillStyle = color;
  ctx.fillRect(50, y, 800, 2);
}

function label(ctx, text, x, y, color = ink) {
  ctx.fillStyle = color;
  ctx.font = `bold 22px ${sans}`;
  ctx.fillText(text, x, y);
}

async function renderPoster(edition, trial) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se ha podido dibujar el cartel.');
  const color = /^#[0-9a-f]{6}$/i.test(edition.color) ? edition.color : '#315b70';
  const partyInk = colorInk(color);
  ctx.textBaseline = 'top';
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = ink;
  ctx.font = `bold 48px ${serif}`;
  ctx.fillText('La campaña', 48, 33);
  ctx.textAlign = 'right';
  label(ctx, 'ESPAÑA EN JUEGO', 850, 54);
  ctx.textAlign = 'left';
  rule(ctx, 104);

  ctx.fillStyle = color;
  ctx.fillRect(0, 124, width, 328);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 124, width, 328);
  ctx.clip();
  ctx.strokeStyle = partyInk;
  ctx.globalAlpha = .15;
  ctx.lineWidth = 2;
  for (let radius = 115; radius <= 315; radius += 24) {
    ctx.beginPath();
    ctx.arc(738, 329, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, edition.partyName.toLocaleUpperCase('es'), 50, 160, partyInk);
  textBlock(ctx, edition.name, 49, 211, 505, 215, 76, serif, 'bold');
  const drawing = portrait(edition.portraitId, 'candidate', edition.type === 'government' ? 'delighted' : 'determined', color, edition.mark)
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="520" ');
  const face = new Image();
  face.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(drawing);
  await face.decode();
  ctx.drawImage(face, 597, 157, 246, 267);

  label(ctx, 'RESULTADO ELECTORAL', 52, 489);
  ctx.fillStyle = ink;
  ctx.font = `bold 150px ${serif}`;
  ctx.fillText(String(edition.seats), 44, 525);
  ctx.font = `28px ${sans}`;
  ctx.fillText(`${edition.seats === 1 ? 'escaño' : 'escaños'} de ${edition.totalSeats}`, 54, 698);
  ctx.fillStyle = color;
  ctx.fillRect(352, 533, 8, 178);
  ctx.fillStyle = ink;
  textBlock(ctx, edition.result, 385, 537, 463, 166, 58, serif, 'bold');
  rule(ctx, 755);
  const memoryLabel = edition.memory ? 'EN CAMPAÑA  /  TURNO ' + edition.memory.turn : 'EN EL CONGRESO';
  label(ctx, memoryLabel, 52, 784);
  textBlock(ctx, edition.memoryText || edition.result, 50, 823, 800, 106, 40, serif);
  rule(ctx, 948, '#938c7e');
  label(ctx, 'TUS PRIORIDADES DE CAMPAÑA', 52, 971);
  const priorities = edition.priorities.map(p => p.status ? p.name + ' (' + p.status.toLocaleLowerCase('es') + ')' : p.name);
  textBlock(ctx, priorities.join('  ·  '), 52, 1008, 795, 58, 27, sans);
  ctx.fillStyle = ink;
  ctx.fillRect(0, 1080, width, 45);
  ctx.fillStyle = paper;
  ctx.font = `bold 18px ${sans}`;
  ctx.fillText(trial ? 'OTRA INVESTIDURA   /   PARTIDA FICTICIA' : 'ELECCIONES GENERALES   /   PARTIDA FICTICIA', 52, 1093);
  return canvas.toDataURL('image/png');
}

// The preview and download use the same locally generated PNG. Preparing it
// before the click lets the native link work with touch and the keyboard.
export async function mountCampaignPoster(figure, edition, trial) {
  if (!figure || !edition) return;
  const link = figure.querySelector('[data-download-poster]');
  const status = figure.querySelector('[role="status"]');
  try {
    if (!posters.has(edition)) posters.set(edition, renderPoster(edition, trial));
    const src = await posters.get(edition);
    if (!figure.isConnected) return;
    const img = figure.querySelector('img');
    img.src = src;
    img.hidden = false;
    link.href = src;
    link.download = trial ? 'la-campana-otra-investidura.png' : 'la-campana-mi-cartel.png';
    link.hidden = false;
    status.hidden = true;
  } catch {
    posters.delete(edition);
    if (!figure.isConnected) return;
    status.textContent = 'El cartel no se ha podido preparar.';
    figure.querySelector('[data-act="retry-poster"]').hidden = false;
  }
}
