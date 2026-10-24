import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { usePanelDrag } from './usePanelDrag.js';
import { html, useTicker } from './components.js';
import { DAMAGE_TYPES } from '../../../shared/damageRanking.js';
import { net } from '../net.js';
import { battleRunner } from '../battle/runner.js';
import { t, N_ } from '../../../shared/i18n.js';

const LABELS = { phys: N_('物理'), arts: N_('法术'), true: N_('真实'), elemental: N_('元素') };
const number = (n) => Math.round(n || 0).toLocaleString('zh-CN');

/** Follows the same owner/field/half as the bond strip, including spectators. */
export function DamageRanking({ ownerId, ownerName, fieldId, combat, prep, round, previous = [] }) {
  const [open, setOpen] = useState(false);
  const frames = useRef(new Map());
  const { panelRef, position, startDrag, dragPanel, endDrag, cancelDrag } = usePanelDrag(open, 8);
  useTicker(open && combat ? 200 : 0);
  useEffect(() => { frames.current.clear(); }, [round]);
  useEffect(() => {
    const receive = (snap) => {
      if (snap?.fieldId && Array.isArray(snap.damageRanking)) frames.current.set(snap.fieldId, snap.damageRanking);
    };
    const offs = [net.on('b.snap', receive)];
    if (battleRunner) offs.push(battleRunner.on('snap', receive));
    return () => offs.forEach((off) => off());
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (event.key === 'Escape') { setOpen(false); event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [open]);
  const rows = combat ? (frames.current.get(fieldId) || []).filter((r) => r.ownerId === ownerId) : prep ? previous : [];
  const max = Math.max(1, ...rows.map((r) => r.total));
  const sum = rows.reduce((n, r) => n + r.total, 0);
  return html`<div class="damage-rank">
    <button type="button" class="gm__gear" aria-label=${t('干员伤害排行')} title=${t('干员伤害排行')} aria-expanded=${open}
      onClick=${() => setOpen(!open)}><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M3 13h4v8H3zm7-6h4v14h-4zm7-4h4v18h-4z" /></svg></button>
    ${open ? html`<section ref=${panelRef} class="damage-rank__panel" role="dialog" aria-label=${t('干员伤害排行')} data-testid="damage-ranking"
      style=${position ? { position: 'fixed', left: `${position.x}px`, top: `${position.y}px`, bottom: 'auto', right: 'auto' } : undefined}>
      <header title=${t('拖动标题栏移动窗口')} onPointerDown=${startDrag} onPointerMove=${dragPanel}
        onPointerUp=${endDrag} onPointerCancel=${endDrag} onLostPointerCapture=${cancelDrag}><div><strong>${t('干员伤害排行')}</strong><small>${combat ? t('当前战斗') : prep ? t('上一次战斗') : t('暂无战斗数据')} · ${ownerName || t('你自己')}</small></div>
        <button type="button" aria-label=${t('关闭伤害排行')} onClick=${() => setOpen(false)}>×</button></header>
      <div class="damage-rank__legend">${DAMAGE_TYPES.map((type) => html`<span><i class=${`damage-rank__${type}`} />${t(LABELS[type])}</span>`)}</div>
      <div class="damage-rank__rows">${rows.length ? rows.map((r, i) => html`<div class="damage-rank__row" key=${r.id ?? r.uid}>
        <div class="damage-rank__label"><span>${i + 1}. ${r.name || r.defId}</span><b>${number(r.total)}</b></div>
        <div class="damage-rank__track" role="img" aria-label=${DAMAGE_TYPES.map((type) => `${t(LABELS[type])} ${number(r.types[type])}`).join('，')}>
          ${DAMAGE_TYPES.map((type) => html`<span class=${`damage-rank__${type}`} style=${{ width: `${100 * (r.types[type] || 0) / max}%` }} title=${`${t(LABELS[type])}：${number(r.types[type])}`} />`)}
        </div></div>`) : html`<p class="damage-rank__empty">${prep ? t('暂无上一场战斗记录') : combat ? t('等待战斗数据…') : t('仅在战斗中或休整期可查看')}</p>`}</div>
      <footer>${t('总伤害')} ${number(sum)}<small>${t('实际生命伤害，不含元素损伤积累')}</small></footer>
    </section>` : null}
  </div>`;
}
