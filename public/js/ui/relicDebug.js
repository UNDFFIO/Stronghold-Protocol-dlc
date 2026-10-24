// Single-player collectible debugging. All changes are applied and checked by the match server.
import { useState } from '../../vendor/hooks.module.js';
import { usePanelDrag } from './usePanelDrag.js';
import { html, Button, Icon } from './components.js';
import { Img } from './gameComponents.js';
import { relicIconUrl } from './assetUrls.js';
import { data } from '../data.js';
import { RELICS, canReceiveRelic, getRelic } from '../../../shared/relics.js';
import { tierName } from './relicPanel.js';
import { t } from '../../../shared/i18n.js';

export function RelicDebugPanel({ relics, canEdit, onChange }) {
  const { panelRef, position, startDrag, dragPanel, endDrag, cancelDrag } = usePanelDrag();
  const [query, setQuery] = useState('');
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const available = RELICS.filter((r) => !r.multiplayerOnly && canReceiveRelic(r, relics, {
    hasScratchTicket: relics.some((owned) => getRelic(owned.id)?.scratchTicket),
  }) && `${r.id} ${t(r.name)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = available.find((r) => r.id === id) || available[0];
  const change = async (relicId, action) => {
    if (!canEdit || busy) return;
    setBusy(true);
    try { await onChange(relicId, action); } finally { setBusy(false); }
  };
  return html`<aside ref=${panelRef} class="relic-debug" aria-label=${t('收藏品调试')}
    style=${position ? { position: 'fixed', left: `${position.x}px`, top: `${position.y}px` } : undefined}>
    <header class="relic-debug__heading" title=${t('拖动标题栏移动窗口')}
      onPointerDown=${startDrag} onPointerMove=${dragPanel} onPointerUp=${endDrag}
      onPointerCancel=${endDrag} onLostPointerCapture=${cancelDrag}>
      <span>${t('收藏品调试')}</span>
      <button type="button" aria-label=${t('收藏品调试')} aria-expanded=${!collapsed}
        onClick=${() => setCollapsed(!collapsed)}>${collapsed ? '+' : '−'}</button>
    </header>
    ${collapsed ? null : html`<div class="relic-debug__body">
      <p>${t('仅整备阶段未准备时可操作；移除不会撤销已结算的一次性收益。')}</p>
      ${!canEdit ? html`<p role="status">${t('当前不可调试，请等待整备阶段并取消准备。')}</p>` : null}
      <input type="search" aria-label=${t('搜索收藏品名称或 ID')} placeholder=${t('搜索收藏品名称或 ID')}
        value=${query} onInput=${(e) => setQuery(e.currentTarget.value)} />
      <div class="relic-debug__grid" role="group" aria-label=${t('选择收藏品')}>
        ${available.map((r) => html`<button key=${r.id} type="button"
          class=${`relic-debug__pick relic-tier-${r.tier}`} data-relic-id=${r.id}
          aria-pressed=${selected?.id === r.id} title=${`${t(r.name)} · ${tierName(r.tier)} · ${r.id}`}
          onClick=${() => setId(r.id)}>
          <span class="relic-debug__art" aria-hidden="true"><${Img} src=${relicIconUrl(data.get('assets'), r.id)}
            fallback=${html`<${Icon} name="key" />`} /></span>
          <span>${t(r.name)}</span>
        </button>`)}
      </div>
      ${selected ? html`<p>${t(selected.desc)}</p>` : null}
      <${Button} size="sm" disabled=${!canEdit || busy || !selected} onClick=${() => change(selected.id, 'add')}>${t('添加收藏品')}<//>
      <ul class="relic-debug__owned">
        ${relics.map((r) => html`<li key=${r.id}><span>${t(getRelic(r.id)?.name || r.id)}</span>
          <${Button} size="sm" disabled=${!canEdit || busy} onClick=${() => change(r.id, 'remove')}>${t('移除')}<//></li>`)}
      </ul>
    </div>`}
  </aside>`;
}
