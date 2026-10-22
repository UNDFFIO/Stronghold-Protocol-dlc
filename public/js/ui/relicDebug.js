// Single-player collectible debugging. All changes are applied and checked by the match server.
import { useState } from '../../vendor/hooks.module.js';
import { html, Button } from './components.js';
import { RELICS, canReceiveRelic, getRelic } from '../../../shared/relics.js';
import { tierName } from './relicPanel.js';
import { t } from '../../../shared/i18n.js';

export function RelicDebugPanel({ relics, canEdit, onChange }) {
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
  return html`<aside class="relic-debug" aria-label=${t('收藏品调试')}>
    <button type="button" class="relic-debug__heading" aria-expanded=${!collapsed} onClick=${() => setCollapsed(!collapsed)}>
      ${t('收藏品调试')} <span>${collapsed ? '+' : '−'}</span>
    </button>
    ${collapsed ? null : html`<div class="relic-debug__body">
      <p>${t('仅整备阶段未准备时可操作；移除不会撤销已结算的一次性收益。')}</p>
      ${!canEdit ? html`<p role="status">${t('当前不可调试，请等待整备阶段并取消准备。')}</p>` : null}
      <input type="search" aria-label=${t('搜索收藏品名称或 ID')} placeholder=${t('搜索收藏品名称或 ID')}
        value=${query} onInput=${(e) => setQuery(e.currentTarget.value)} />
      <select aria-label=${t('选择收藏品')} value=${selected?.id || ''} onChange=${(e) => setId(e.currentTarget.value)}>
        ${available.map((r) => html`<option key=${r.id} value=${r.id}>${t(r.name)} · ${tierName(r.tier)} · ${r.id}</option>`)}
      </select>
      ${selected ? html`<p>${t(selected.desc)}</p>` : null}
      <${Button} size="sm" disabled=${!canEdit || busy || !selected} onClick=${() => change(selected.id, 'add')}>${t('添加收藏品')}<//>
      <ul class="relic-debug__owned">
        ${relics.map((r) => html`<li key=${r.id}><span>${t(getRelic(r.id)?.name || r.id)}</span>
          <${Button} size="sm" disabled=${!canEdit || busy} onClick=${() => change(r.id, 'remove')}>${t('移除')}<//></li>`)}
      </ul>
    </div>`}
  </aside>`;
}
