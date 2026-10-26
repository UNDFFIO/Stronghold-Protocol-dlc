import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, roman } from './components.js';
import { Img } from './gameComponents.js';
import { data } from '../data.js';
import { relicIconUrl } from './assetUrls.js';
import { getRelic, RELIC_TIERS } from '../../../shared/relics.js';
import { SCRATCH_TIERS } from '../../../shared/scratchTickets.js';
import { t } from '../../../shared/i18n.js';

const progressKey = (id) => `sp.scratch.${id}`;
export function loadScratchProgress(id) {
  try {
    const value = JSON.parse(localStorage.getItem(progressKey(id)) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const regions = {};
    for (let i = 0; i < 8; i++) {
      const region = value[i];
      if (region?.done === true) regions[i] = { done: true };
      else if (Array.isArray(region?.strokes)) regions[i] = { strokes: region.strokes.filter((line) =>
        Array.isArray(line) && line.length === 4 && line.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) };
    }
    return regions;
  } catch { return {}; }
}
function saveProgress(id, value) {
  try { localStorage.setItem(progressKey(id), JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
}

/** Actual erased alpha coverage, independent of pointer-event count or the number of overlapping strokes. */
export function erasedRatio(pixels) {
  let cleared = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 128) cleared++;
  return pixels.length ? cleared / (pixels.length / 4) : 0;
}

/** One transient layer per ticket, so flakes can fall beyond a cell after its foil is removed. */
function ScratchDebris({ emitRef }) {
  const canvas = useRef(null);
  useEffect(() => {
    const surface = canvas.current, ctx = surface.getContext('2d');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const colors = ['#737981', '#a5abb2', '#d5d9de', '#f0f1f3'];
    let particles = [], frame = 0, width = 0, height = 0;
    const clear = () => {
      cancelAnimationFrame(frame); frame = 0; particles = [];
      ctx.clearRect(0, 0, width, height);
    };
    const paint = (now) => {
      frame = 0;
      ctx.clearRect(0, 0, width, height);
      particles = particles.filter((p) => now - p.born < p.life * 1000);
      for (const p of particles) {
        const age = (now - p.born) / 1000;
        ctx.save();
        ctx.translate(p.x + p.vx * age, p.y + p.vy * age + 240 * age * age);
        ctx.rotate(p.angle + p.spin * age);
        ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(age * 12 + p.angle)));
        ctx.globalAlpha = Math.min(1, (1 - age / p.life) * 2);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.4); ctx.lineTo(p.size * 0.6, -p.size * 0.7);
        ctx.lineTo(p.size, p.size * 0.3); ctx.lineTo(-p.size * 0.5, p.size * 0.7); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (particles.length) frame = requestAnimationFrame(paint);
    };
    emitRef.current = (source, line, area) => {
      if (motion.matches) return;
      const bounds = surface.getBoundingClientRect(), rect = source.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width; height = bounds.height;
      const w = Math.round(width * dpr), h = Math.round(height * dpr);
      if (surface.width !== w || surface.height !== h) {
        surface.width = w; surface.height = h;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const dx = (line[2] - line[0]) * rect.width, dy = (line[3] - line[1]) * rect.height;
      const count = Math.min(18, Math.max(2, Math.ceil(area * 100))), born = performance.now();
      for (let i = 0; i < count; i++) {
        const along = Math.random();
        particles.push({
          x: rect.left - bounds.left + line[0] * rect.width + dx * along + (Math.random() - 0.5) * rect.width * 0.1,
          y: rect.top - bounds.top + line[1] * rect.height + dy * along + (Math.random() - 0.5) * rect.height * 0.25,
          vx: Math.max(-90, Math.min(90, dx * 3)) + (Math.random() - 0.5) * 100,
          vy: Math.max(-40, Math.min(40, dy * 2)) - 30 - Math.random() * 60,
          size: 1.5 + Math.random() * 2.5, angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 18, life: 0.55 + Math.random() * 0.35, born,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
      // Bound both memory and drawing work during rapid mouse / touch strokes.
      if (particles.length > 160) particles.splice(0, particles.length - 160);
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const motionChanged = () => { if (motion.matches) clear(); };
    motion.addEventListener('change', motionChanged);
    return () => { clear(); emitRef.current = null; motion.removeEventListener('change', motionChanged); };
  }, []);
  return html`<canvas ref=${canvas} class="scratch-debris" aria-hidden="true" />`;
}

function ScratchCoating({ tier, region, progress, disabled, revealAll, onChange, onScratch, children }) {
  const canvas = useRef(null), pointer = useRef(null), strokes = useRef([]), coverage = useRef(0);
  const [revealing, setRevealing] = useState(false);
  const animating = useRef(false);
  const done = progress?.done === true;
  useEffect(() => {
    if (done || !canvas.current) return;
    const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
    // Identical edge colours let the adjacent canvases read as one printed foil sheet.
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#c4c8cb'; ctx.fillRect(0, 0, 300, 100);
    ctx.fillStyle = '#a2a8ad';
    for (let x = 0; x < 300; x += 11) for (let y = 0; y < 100; y += 9) ctx.fillRect(x + y % 7, y, 1, 1);
    // The tier's printed marker is decorative; it never discloses the hidden prize symbol.
    const surface = canvas.current, marker = new Image();
    let active = true;
    marker.onload = () => {
      if (!active) return;
      const rect = surface.getBoundingClientRect();
      const width = 54 * 3 * rect.height / rect.width;
      ctx.save();
      // A late image load must not repaint erased foil, including an in-flight reveal sweep.
      ctx.globalCompositeOperation = 'source-atop';
      ctx.drawImage(marker, 150 - width / 2, 8, width, 54);
      ctx.restore();
    };
    marker.src = `/images/scratch-tickets/marker-${tier}.webp`;
    ctx.textAlign = 'center'; ctx.font = '16px sans-serif'; ctx.fillStyle = '#616b73';
    ctx.fillText(t('刮开此处'), 150, 80);
    strokes.current = Array.isArray(progress?.strokes) ? progress.strokes : [];
    for (const line of strokes.current) erase(ctx, line);
    coverage.current = erasedRatio(ctx.getImageData(0, 0, 300, 100).data);
    // Only recreate the foil on mount / language changes, never on every stroke.
    return () => { active = false; marker.onload = null; };
  }, [done, tier, t('刮开此处')]);

  useEffect(() => {
    if (done || (!revealing && !revealAll)) return;
    animating.current = true;
    pointer.current = null;
    const surface = canvas.current, ctx = surface.getContext('2d', { willReadFrequently: true });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const start = performance.now() + (revealing ? 0 : region * 65);
    let frame = 0, previous = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, 300, 100);
      onChange(region, { done: true });
    };
    const paint = (now) => {
      const fraction = Math.max(0, Math.min(1, (now - start) / 450));
      const edge = fraction * 300;
      if (edge > previous) {
        ctx.clearRect(previous, 0, edge - previous, 100);
        const ratio = erasedRatio(ctx.getImageData(0, 0, 300, 100).data);
        if (ratio > coverage.current) onScratch(surface, [fraction, 0, fraction, 1], ratio - coverage.current);
        coverage.current = ratio;
        previous = edge;
      }
      if (fraction === 1) finish();
      else frame = requestAnimationFrame(paint);
    };
    const motionChanged = () => { if (motion.matches) finish(); };
    motion.addEventListener('change', motionChanged);
    if (motion.matches) finish();
    else frame = requestAnimationFrame(paint);
    return () => { cancelAnimationFrame(frame); motion.removeEventListener('change', motionChanged); };
  }, [done, revealing, revealAll]);

  const move = (e) => {
    if (disabled || done || animating.current || revealAll) return;
    if (e.pointerType === 'mouse') {
      if (!(e.buttons & 1)) { pointer.current = null; return; }
      // A held left button may enter from outside this coating or from another region.
      if (pointer.current?.id !== e.pointerId) pointer.current = { id: e.pointerId };
    }
    if (pointer.current?.id !== e.pointerId) return;
    e.preventDefault();
    const rect = canvas.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const line = [pointer.current.x ?? x, pointer.current.y ?? y, x, y];
    pointer.current = { id: e.pointerId, x, y };
    const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
    erase(ctx, line);
    strokes.current.push(line);
    const ratio = erasedRatio(ctx.getImageData(0, 0, 300, 100).data);
    if (ratio > coverage.current) onScratch(canvas.current, line, ratio - coverage.current);
    coverage.current = ratio;
    const revealed = ratio >= 0.6;
    onChange(region, { strokes: strokes.current });
    if (revealed) { animating.current = true; setRevealing(true); }
  };
  return html`<div class=${`scratch-cell${done ? ' is-revealed' : ''}`} data-scratch-region=${region}>
    <div class="scratch-cell__value" aria-hidden=${!done}>${children}</div>
    ${done ? null : html`<canvas ref=${canvas} width="300" height="100" class="scratch-coating" aria-label=${t('按住并拖动刮开涂层')}
      onPointerDown=${(e) => {
        if (disabled || animating.current || revealAll || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (e.pointerType !== 'mouse') e.currentTarget.setPointerCapture(e.pointerId);
        pointer.current = { id: e.pointerId }; move(e);
      }} onPointerMove=${move} onPointerLeave=${(e) => { if (e.pointerType === 'mouse') pointer.current = null; }}
      onPointerUp=${() => { pointer.current = null; }} onPointerCancel=${() => { pointer.current = null; }} />`}
  </div>`;
}

function erase(ctx, line) {
  ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 42; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(line[0] * 300, line[1] * 100); ctx.lineTo(line[2] * 300, line[3] * 100); ctx.stroke();
  // Keep a slightly broken edge on the remaining foil.
  ctx.clearRect(line[2] * 300 + 22, line[3] * 100 - 8, 3, 2);
}

function ScratchFace({ ticket, context, busy, run, result }) {
  const [progress, setProgress] = useState(() => loadScratchProgress(ticket.id));
  const [revealingAll, setRevealingAll] = useState(false);
  const liveProgress = useRef(progress);
  const attempted = useRef(false);
  const debris = useRef(null);
  const scratch = (source, line, area) => debris.current?.(source, line, area);
  const all = Array.from({ length: 8 }, (_, i) => progress[i]?.done === true).every(Boolean);
  useEffect(() => { attempted.current = false; }, [context.canUse]);
  useEffect(() => {
    if (result || !all || !context.canUse || attempted.current) return;
    attempted.current = true;
    void run(() => context.onClaim(ticket.id));
  }, [all, context.canUse, result]);
  const change = (region, value) => {
    const next = { ...liveProgress.current, [region]: value };
    liveProgress.current = next;
    saveProgress(ticket.id, next);
    // Canvas paints strokes directly; only a newly completed area needs a component render.
    if (value.done) setProgress(next);
  };
  const revealAll = () => setRevealingAll(true);
  // Rank distinct values instead of taking number % 9: different numbers must never look like a match.
  const numbers = [...new Set([...ticket.winningNumbers, ...ticket.cells.map((cell) => cell.number)])].sort((a, b) => a - b);
  const symbol = (number, matched = false) => {
    const index = (numbers.indexOf(number) + numbers[0]) % 9;
    return html`<span class=${`scratch-symbol${matched ? ' scratch-match' : ''}`} role="img"
      aria-label=${t('图案 {index}', { index: index + 1 })}
      style=${`background-position: ${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%`} />`;
  };
  return html`<div class=${`scratch-paper relic-tier-${ticket.tier}`}>
    <div class="scratch-paper__header"><b>${t('好运刮刮票')}</b><span>${roman(ticket.tier)} · ${t(RELIC_TIERS[ticket.tier - 1].name)}</span></div>
    <p class="scratch-paper__hint">${t('图案相同，即中得该图案下方的奖金')}</p>
    <h3>${t('中奖图案')}</h3><div class="scratch-winning">
      ${ticket.winningNumbers.map((number, i) => html`<${ScratchCoating} key=${i} tier=${ticket.tier} region=${i} progress=${liveProgress.current[i]}
        disabled=${!context.canUse || busy} revealAll=${revealingAll} onChange=${change} onScratch=${scratch}>${symbol(number)}<//>`)}
    </div>
    <h3>${t('我的图案与奖金')}</h3><div class="scratch-numbers">
      ${ticket.cells.map((cell, i) => html`<${ScratchCoating} key=${i} tier=${ticket.tier} region=${i + 2} progress=${liveProgress.current[i + 2]}
        disabled=${!context.canUse || busy} revealAll=${revealingAll} onChange=${change} onScratch=${scratch}>
        ${symbol(cell.number, all && ticket.winningNumbers.includes(cell.number))}
        <span>${t('{amount}金币', { amount: cell.amount })}</span><//>`)}
    </div>
    <div class="scratch-paper__footer"><span aria-hidden="true" class="scratch-barcode"></span><span>${t('本票仅可兑奖一次')}</span></div>
    ${result ? html`<div class=${`scratch-result${result.amount > 0 ? ' scratch-result--win' : ''}`} role="status" aria-live="polite">
      ${result.amount > 0 ? t('本次获得{amount}金币', { amount: result.amount }) : t('谢谢参与，下次好运')}
    </div>` : html`<div class="scratch-controls">
      <${Button} size="sm" disabled=${!context.canUse || busy || all || revealingAll} onClick=${revealAll}>${t('全部刮开')}<//>
      ${all ? html`<${Button} size="sm" variant="primary" disabled=${!context.canUse || busy}
        onClick=${() => run(() => context.onClaim(ticket.id))}>${busy ? t('兑奖中…') : t('兑奖')}<//>` : null}
    </div>`}
    <${ScratchDebris} emitRef=${debris} />
  </div>`;
}

/** An unlocked shop entry, not a purchase: prices and all action gates stay in ScratchPanel. */
export function ScratchShopCard({ context }) {
  const [open, setOpen] = useState(false);
  const label = t('购买刮刮票');
  return html`<button type="button" class="scratch-shop-card" aria-label=${label} aria-haspopup="dialog" aria-expanded=${open}
    onClick=${() => setOpen(true)}>
    <span class="scratch-shop-card__stack" aria-hidden="true">
      ${SCRATCH_TIERS.map((spec, i) => html`<${Img} key=${spec.tier} src=${relicIconUrl(data.get('assets'), spec.relicId)}
        style=${`--ticket-index: ${i}`} />`)}
    </span>
    <span class="scratch-shop-card__label">${label}</span>
  </button>
  ${open ? html`<${ScratchPanel} context=${context} initialTicketId=${null} onClose=${() => setOpen(false)} />` : null}`;
}

export function ScratchPanel({ context, onClose, initialTicketId }) {
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(null);
  const [selectedId, setSelectedId] = useState(initialTicketId);
  const displayedTicket = useRef(null), close = useRef(onClose);
  close.current = onClose;
  const tickets = context.view?.tickets ?? [];
  const result = context.view?.lastResult;
  const claimed = result?.ticketId === displayedTicket.current?.id ? result : null;
  // Keep the actual claimed face while the server removes it from inventory.
  const ticket = claimed ? displayedTicket.current
    : selectedId === null ? null : tickets.find((t) => t.id === selectedId) ?? tickets.at(-1);
  if (ticket?.opened) displayedTicket.current = ticket;
  useEffect(() => {
    if (!claimed) return;
    const timer = setTimeout(() => close.current(), 2500);
    return () => clearTimeout(timer);
  }, [claimed?.ticketId]);
  useEffect(() => { setArmed(null); }, [context.canUse, context.round, context.view?.seq, ticket?.id]);
  useEffect(() => {
    if (armed == null) return;
    const disarm = (e) => { if (!e.target.closest?.('.scratch-product')) setArmed(null); };
    window.addEventListener('pointerdown', disarm, true);
    return () => window.removeEventListener('pointerdown', disarm, true);
  }, [armed]);
  useEffect(() => {
    if (result?.ticketId) {
      try { localStorage.removeItem(progressKey(result.ticketId)); } catch { /* Storage may be unavailable. */ }
    }
  }, [result?.ticketId]);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  const face = !!ticket?.opened;
  return html`<${Modal} open=${true} title=${face ? null : t('刮刮票')} micro=${face ? null : 'SCRATCH TICKETS'}
    class=${`scratch-panel${face ? ' scratch-panel--face' : ''}`} width="min(8.8rem, 94vw)"
    onClose=${onClose} actions=${face ? null : html`<${Button} size="sm" onClick=${onClose}>${t('关闭')}<//>`}>
    ${!context.canUse ? html`<p role="status">${t('未准备的休整阶段可购买、刮票与兑奖')}</p>` : null}
    ${ticket ? (ticket.opened ? html`<${ScratchFace} key=${ticket.id} ticket=${ticket} context=${context} busy=${busy} run=${run} result=${claimed} />`
      : html`<div class="scratch-unopened"><${Img} src=${relicIconUrl(data.get('assets'), ticket.relicId)} />
        <b>${t(getRelic(ticket.relicId).name)}</b><${Button} variant="primary" disabled=${!context.canUse || busy}
          onClick=${() => run(() => context.onOpen(ticket.id))}>${t('开始刮奖')}<//></div>`)
      : html`<div class="scratch-shop">
        ${SCRATCH_TIERS.map((spec) => html`<button type="button" key=${spec.tier}
          class=${`scratch-product relic-tier-${spec.tier}${armed === spec.tier ? ' is-armed' : ''}`}
          aria-pressed=${armed === spec.tier}
          disabled=${!context.canUse || busy || context.round < spec.unlockRound || context.funds < spec.price}
          onClick=${() => {
            if (armed !== spec.tier) { setArmed(spec.tier); return; }
            setArmed(null);
            void run(async () => { if (await context.onBuy(spec.tier, context.view?.seq ?? 0)) setSelectedId(undefined); });
          }}>
          <${Img} src=${relicIconUrl(data.get('assets'), spec.relicId)} />
          <span class="scratch-product__info"><b>${t(getRelic(spec.relicId).name)}</b><span>${t('中奖率{chance}%，最高{amount}金币', { chance: (10000 - spec.weights[0]) / 100, amount: spec.price * 50 })}</span></span>
          <b class="scratch-product__price">${context.round < spec.unlockRound ? t('R{unlock} 解锁', { unlock: spec.unlockRound }) : t('{amount}金币', { amount: spec.price })}</b>
          ${armed === spec.tier ? html`<span class="scard__confirm" role="status"><b>${t('确认购买')}</b><small>${t('再次点击')}</small></span>` : null}
        </button>`)}
      </div>`}
  <//>`;
}
