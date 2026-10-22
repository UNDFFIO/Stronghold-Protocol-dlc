import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, roman } from './components.js';
import { Img } from './gameComponents.js';
import { data } from '../data.js';
import { relicIconUrl } from './assetUrls.js';
import { getRelic, RELIC_TIERS } from '../../../shared/relics.js';
import { SCRATCH_TIERS, SCRATCH_MULTIPLIERS } from '../../../shared/scratchTickets.js';
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

function ScratchCoating({ region, progress, disabled, onChange, children }) {
  const canvas = useRef(null), pointer = useRef(null), strokes = useRef([]);
  const done = progress?.done === true;
  useEffect(() => {
    if (done || !canvas.current) return;
    const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
    const gradient = ctx.createLinearGradient(0, 0, 300, 100);
    gradient.addColorStop(0, '#b3b7bc'); gradient.addColorStop(0.45, '#e2e4e6'); gradient.addColorStop(1, '#8d929a');
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = gradient; ctx.fillRect(0, 0, 300, 100);
    ctx.fillStyle = '#81868c';
    for (let x = 0; x < 300; x += 11) for (let y = 0; y < 100; y += 9) ctx.fillRect(x + y % 7, y, 1, 1);
    ctx.textAlign = 'center'; ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#61656b';
    ctx.fillText(t('刮开此处'), 150, 57);
    strokes.current = Array.isArray(progress?.strokes) ? progress.strokes : [];
    for (const line of strokes.current) erase(ctx, line);
    // Only recreate the foil on mount / language changes, never on every stroke.
  }, [done, t('刮开此处')]);

  const move = (e) => {
    if (disabled || done || pointer.current?.id !== e.pointerId) return;
    e.preventDefault();
    const rect = canvas.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const line = [pointer.current.x ?? x, pointer.current.y ?? y, x, y];
    pointer.current = { id: e.pointerId, x, y };
    const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
    erase(ctx, line);
    strokes.current.push(line);
    const revealed = erasedRatio(ctx.getImageData(0, 0, 300, 100).data) >= 0.6;
    onChange(region, revealed ? { done: true } : { strokes: strokes.current });
  };
  return html`<div class=${`scratch-cell${done ? ' is-revealed' : ''}`} data-scratch-region=${region}>
    <div class="scratch-cell__value" aria-hidden=${!done}>${children}</div>
    ${done ? null : html`<canvas ref=${canvas} width="300" height="100" class="scratch-coating" aria-label=${t('按住并拖动刮开涂层')}
      onPointerDown=${(e) => {
        if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.currentTarget.setPointerCapture(e.pointerId); pointer.current = { id: e.pointerId }; move(e);
      }} onPointerMove=${move} onPointerUp=${() => { pointer.current = null; }} onPointerCancel=${() => { pointer.current = null; }} />`}
  </div>`;
}

function erase(ctx, line) {
  ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 28; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(line[0] * 300, line[1] * 100); ctx.lineTo(line[2] * 300, line[3] * 100); ctx.stroke();
  // Small broken edges suggest foil fragments without adding an animation loop.
  ctx.clearRect(line[2] * 300 + 15, line[3] * 100 - 8, 3, 2);
}

function ScratchFace({ ticket, context, busy, run }) {
  const [progress, setProgress] = useState(() => loadScratchProgress(ticket.id));
  const liveProgress = useRef(progress);
  const attempted = useRef(false);
  const all = Array.from({ length: 8 }, (_, i) => progress[i]?.done === true).every(Boolean);
  useEffect(() => { attempted.current = false; }, [context.canUse]);
  useEffect(() => {
    if (!all || !context.canUse || attempted.current) return;
    attempted.current = true;
    void run(() => context.onClaim(ticket.id));
  }, [all, context.canUse]);
  const change = (region, value) => {
    const next = { ...liveProgress.current, [region]: value };
    liveProgress.current = next;
    saveProgress(ticket.id, next);
    // Canvas paints strokes directly; only a newly completed area needs a component render.
    if (value.done) setProgress(next);
  };
  const revealAll = () => {
    const next = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, { done: true }]));
    liveProgress.current = next; saveProgress(ticket.id, next); setProgress(next);
  };
  return html`<div class=${`scratch-paper relic-tier-${ticket.tier}`}>
    <div class="scratch-paper__header"><b>${t('好运刮刮票')}</b><span>${roman(ticket.tier)} · ${t(RELIC_TIERS[ticket.tier - 1].name)}</span></div>
    <p class="scratch-paper__hint">${t('号码相同，即中得该号码下方的奖金')}</p>
    <h3>${t('中奖号码')}</h3><div class="scratch-winning">
      ${ticket.winningNumbers.map((number, i) => html`<${ScratchCoating} key=${i} region=${i} progress=${liveProgress.current[i]}
        disabled=${!context.canUse || busy} onChange=${change}><b class="num">${number}</b><//>`)}
    </div>
    <h3>${t('我的号码与奖金')}</h3><div class="scratch-numbers">
      ${ticket.cells.map((cell, i) => html`<${ScratchCoating} key=${i} region=${i + 2} progress=${liveProgress.current[i + 2]}
        disabled=${!context.canUse || busy} onChange=${change}>
        <b class=${`num${all && ticket.winningNumbers.includes(cell.number) ? ' scratch-match' : ''}`}>${cell.number}</b>
        <span>${t('{amount}金币', { amount: cell.amount })}</span><//>`)}
    </div>
    <div class="scratch-paper__footer"><span aria-hidden="true" class="scratch-barcode"></span><span>${t('本票仅可兑奖一次')}</span></div>
    <div class="scratch-controls">
      <${Button} size="sm" disabled=${!context.canUse || busy || all} onClick=${revealAll}>${t('全部刮开')}<//>
      ${all ? html`<${Button} size="sm" variant="primary" disabled=${!context.canUse || busy}
        onClick=${() => run(() => context.onClaim(ticket.id))}>${busy ? t('兑奖中…') : t('兑奖')}<//>` : null}
    </div>
  </div>`;
}

export function ScratchPanel({ context, onClose }) {
  const [busy, setBusy] = useState(false);
  const ticket = context.view?.ticket;
  const result = context.view?.lastResult;
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
  return html`<${Modal} open=${true} title=${t('刮刮票')} micro="SCRATCH TICKETS" class="scratch-panel" width="min(8.8rem, 94vw)"
    onClose=${onClose} actions=${html`<${Button} size="sm" onClick=${onClose}>${t('关闭')}<//>`}>
    <p>${t('当前金币：{amount}', { amount: context.funds })}</p>
    ${!context.canUse ? html`<p role="status">${t('未准备的休整阶段可购买、刮票与兑奖')}</p>` : null}
    ${ticket ? (ticket.opened ? html`<${ScratchFace} key=${ticket.id} ticket=${ticket} context=${context} busy=${busy} run=${run} />`
      : html`<div class="scratch-unopened"><${Img} src=${relicIconUrl(data.get('assets'), ticket.relicId)} />
        <b>${t(getRelic(ticket.relicId).name)}</b><${Button} variant="primary" disabled=${!context.canUse || busy}
          onClick=${() => run(() => context.onOpen(ticket.id))}>${t('开始刮奖')}<//></div>`)
      : html`<div class="scratch-shop">
        ${result ? html`<p class="scratch-result" role="status">${result.amount > 0 ? t('本次获得{amount}金币', { amount: result.amount }) : t('谢谢参与，下次好运')}</p>` : null}
        ${SCRATCH_TIERS.map((spec) => html`<div key=${spec.tier} class=${`scratch-product relic-tier-${spec.tier}`}>
          <${Img} src=${relicIconUrl(data.get('assets'), spec.relicId)} />
          <div><b>${t(getRelic(spec.relicId).name)}</b><span>${t('中奖率{chance}%，最高{amount}金币', { chance: (10000 - spec.weights[0]) / 100, amount: spec.price * 50 })}</span></div>
          <${Button} size="sm" disabled=${!context.canUse || busy || context.round < spec.unlockRound || context.funds < spec.price}
            onClick=${() => run(() => context.onBuy(spec.tier, context.view?.seq ?? 0))}>
            ${context.round < spec.unlockRound ? t('R{unlock} 解锁', { unlock: spec.unlockRound }) : t('{amount}金币', { amount: spec.price })}<//>
        </div>`)}
      </div>`}
    <p class="scratch-note">${t('最多保留1张未兑奖票，可跨回合保留；刮完兑奖后可继续购买。奖金包含本金。')}</p>
    <details class="scratch-odds"><summary>${t('查看完整奖表')}</summary><div class="scratch-odds__scroll"><table>
      <thead><tr><th>${t('品质')}</th><th>${t('奖金')}</th><th>${t('概率')}</th></tr></thead>
      <tbody>${SCRATCH_TIERS.map((spec) => SCRATCH_MULTIPLIERS.map((multiplier, i) => html`<tr key=${`${spec.tier}:${i}`}>
        <td>${t(RELIC_TIERS[spec.tier - 1].name)}</td><td>${t('{amount}金币', { amount: multiplier * spec.price })}</td><td>${spec.weights[i] / 100}%</td></tr>`))}</tbody>
    </table></div></details>
  <//>`;
}
