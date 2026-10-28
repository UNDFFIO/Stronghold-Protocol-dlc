// Match-scoped collection. Follow the same owner as the bond strip while watching another field;
// the right-hand icons and full list are independent of EffectsList's ten-icon limit.
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { getRelic, RELIC_TIERS, dropWeights } from '../../../shared/relics.js';
import { html, Modal, Button, Icon, Tooltip, roman, useTicker, secondsLeft } from './components.js';
import { Img } from './gameComponents.js';
import { relicIconUrl } from './assetUrls.js';
import { data } from '../data.js';
import { t as tr } from '../../../shared/i18n.js';
import { ScratchPanel } from './scratchTickets.js';
import { DeathNotePanel } from './deathNote.js';

/** Resolve server-owned records without truncation or client-side awarding. */
export function relicEntries(records) {
  return (Array.isArray(records) ? records : []).filter((r) => r && typeof r.id === 'string').map((r) => ({
    ...getRelic(r.id), id: r.id, round: Number.isInteger(r.round) && r.round > 0 ? r.round : null,
    ...(r.used ? { used: true } : {}),
  }));
}

/** Three five-row columns; reserve the last slot for More only on overflow. Negative (VI) precedes V–I. */
export function relicPreview(entries) {
  const sorted = [...entries].sort((a, b) => (b.tier || 0) - (a.tier || 0));
  const visible = sorted.slice(0, sorted.length > 15 ? 14 : 15);
  return { visible, hidden: sorted.length - visible.length };
}

/** Own records stay private; watched records come from public metadata, never fall back to yours. */
export function ownerRelics({ pub, priv, myId, ownerId }) {
  const self = ownerId === myId;
  const view = self ? priv : pub?.players?.find((p) => p.playerId === ownerId);
  return {
    relics: Array.isArray(view?.relics) ? view.relics : [],
    reward: self ? view?.relicReward : null,
    shield: view?.lpShield || 0,
    nextShield: view?.nextLpShield || 0,
  };
}

/** Base odds; acquired entries are removed from the server's remaining candidates. */
export function relicOdds(round, { leaked = false } = {}) {
  const weights = dropWeights(round, { leaked });
  const sum = weights.reduce((a, b) => a + b, 0);
  return RELIC_TIERS.filter((t) => t.normalDrop !== false).map((t, i) => ({ ...t, unlock: t.unlockRound, percent: sum > 0 ? weights[i] / sum * 100 : 0 }));
}

export function tierName(tier) {
  const t = RELIC_TIERS.find((r) => r.tier === tier);
  return t ? (t.normalDrop === false ? tr(t.name) : `${roman(tier)} · ${tr(t.name)}`) : tr('未分类');
}

/** Same icon frame and tooltip as active effects, with a focusable/tappable collection shortcut. */
export function RelicIcons({ relics, reward, notice = false, onOpen, onScratch = null, onDeathNote = null }) {
  const m = data.get('assets');
  return relicEntries(relics).map((r) => {
    const fresh = notice && reward?.id === r.id && reward?.round === r.round;
    return html`<${Tooltip} key=${`${r.id}:${r.round}`} placement="bottom" text=${html`<div class="efftip">
        <b>${tr(r.name) || r.id}</b><span class="efftip__kind">${tr('收藏品 ·')} ${tierName(r.tier)}${r.round ? tr(' · 第 {round} 回合获得', { round: r.round }) : ''}</span>
        <p>${tr(r.desc) || tr('该收藏品的效果资料暂不可用')}</p>${r.used ? html`<span>${tr('已使用')}</span>` : null}
      </div>`}>
      <button type="button" class=${`effect effect--relic relic-tier-${r.tier || 1}${fresh ? ' is-new' : ''}`}
        data-relic-id=${r.id} onClick=${r.deathNote && onDeathNote ? onDeathNote : r.scratchTicket && onScratch ? () => onScratch(r.id) : onOpen} aria-haspopup="dialog"
        aria-label=${tr('{0}，收藏品，{1}，{2}', { 0: tr(r.name) || r.id, 1: tierName(r.tier), 2: tr(r.desc) || tr('效果资料暂不可用') })}>
        <${Img} src=${relicIconUrl(m, r.id)} fallback=${html`<${Icon} name="key" />`} />
        ${r.tier ? html`<span class="relic-icon__tier" aria-hidden="true">${RELIC_TIERS[r.tier - 1]?.normalDrop === false ? '!' : roman(r.tier)}</span>` : null}
        ${fresh ? html`<span class="relic-icon__new" role="status" aria-label=${tr('新收藏品：{0}', { 0: tr(r.name) || tr('收藏品') })}></span>` : null}
      </button>
    <//>`;
  });
}

/** Shared by the live modal and each settlement card. No richness/HTML from remote sources. */
export function RelicList({ relics, reward = null, history = false, illustrated = history, revival = null, onScratch = null, onDeathNote = null }) {
  const entries = relicEntries(relics);
  if (!entries.length) return html`<p class="relic-empty">${history ? tr('尚未收录收藏品。') : tr('尚未获得收藏品。')}</p>`;
  return html`<ol class="relic-list" aria-label=${history ? tr('已获得过的收藏品') : tr('本局收藏品')}>
    ${entries.map((r) => html`<li key=${`${r.id}:${r.round}`} class=${`relic-card relic-tier-${r.tier || 1}${illustrated ? ' relic-card--illustrated' : ''}${reward?.id === r.id && reward?.round === r.round ? ' is-new' : ''}`}>
      ${illustrated ? html`<span class="relic-card__art" aria-hidden="true">
        <${Img} src=${relicIconUrl(data.get('assets'), r.id)} fallback=${html`<${Icon} name="key" />`} />
      </span>` : null}
      <div class="relic-card__head"><b class="relic-card__name">${tr(r.name) || r.id}</b>
        <span class="relic-card__tier">${tierName(r.tier)}</span></div>
      <p class="relic-card__desc">${tr(r.desc) || tr('该收藏品的效果资料暂不可用')}</p>
      ${!history && r.deathNote && onDeathNote ? html`<${Button} size="sm" onClick=${onDeathNote}>${tr('书写名字')}<//>` : null}
      ${!history && r.scratchTicket && onScratch ? html`<${Button} size="sm" data-relic-id=${r.id} onClick=${() => onScratch(r.id)}>${tr('开始刮奖')}<//>` : null}
      ${!history && r.reviveOnce ? (r.used ? html`<span class="relic-card__used">${tr('复活机会已消耗')}</span>`
        : revival ? html`<${RelicReviveActions} relicId=${r.id} revival=${revival} />` : html`<span class="relic-card__used">${tr('未使用 · 剩余 1 次')}</span>`) : null}
      ${history ? null : html`<span class="relic-card__round">${r.round == null ? tr('本局获得') : tr('第 {round} 回合获得', { round: r.round })}</span>`}
    </li>`)}
  </ol>`;
}

export const revivalTargets = (pub, myId) => (pub?.players || []).filter((p) => p.playerId !== myId && !p.alive && p.canRevive);

function RelicReviveActions({ relicId, revival }) {
  const [busy, setBusy] = useState(null);
  const pick = async (playerId) => {
    if (busy) return;
    setBusy(playerId);
    try { await revival.onRevive(relicId, playerId); }
    finally { setBusy(null); }
  };
  const enabled = revival.phase === 'PREP' && revival.alive;
  return html`<div class="relic-card__revive">
    <span class="relic-panel__note">${tr('剩余 1 次 · 自救与救队友共用')}</span>
    ${revival.targets.length ? revival.targets.map((p) => html`<${Button} key=${p.playerId} size="sm" variant="primary"
      disabled=${!enabled || !!busy} onClick=${() => pick(p.playerId)}>
      ${busy === p.playerId ? tr('复活中…') : tr('复活 {name}', { name: p.name })}<//>`)
      : html`<span class="relic-panel__note">${tr('暂无可复活的队友')}</span>`}
    ${enabled ? null : html`<span class="relic-panel__note">${tr('整备阶段可复活队友；死亡时自动用于自救。')}</span>`}
  </div>`;
}

/** Non-blocking notification: only a new reward identity changes the badge, not every private push. */
export function RelicCollection({ relics, reward, owner = null, round = 1, shield = 0, nextShield = 0, revival = null, queuedChess = 0, scratch = null, deathNote = null }) {
  const [open, setOpen] = useState(false);
  const [scratchOpen, setScratchOpen] = useState(false);
  const [deathNoteOpen, setDeathNoteOpen] = useState(false);
  const [scratchTicketId, setScratchTicketId] = useState(undefined);
  const canScratch = scratch && relics?.some((r) => r.id === 'relic_234');
  const canWrite = deathNote && relics?.some((r) => r.id === 'relic_241');
  const showDeathNote = canWrite ? () => { setOpen(false); setScratchOpen(false); setDeathNoteOpen(true); setNotice(false); } : null;
  const showScratch = (relicId) => {
    setOpen(false); setScratchOpen(true);
    const ticket = scratch?.view?.tickets.find((ticket) => ticket.relicId === relicId);
    setScratchTicketId(ticket?.id);
    if (ticket && !ticket.opened && scratch.canUse) void scratch.onOpen(ticket.id);
  };
  const [notice, setNotice] = useState(false);
  const entries = relicEntries(relics);
  const count = entries.length;
  const preview = relicPreview(entries);
  const onScratch = canScratch && scratch.view?.tickets?.length ? showScratch : null;
  const rewardKey = reward?.id ? `${reward.id}:${reward.round}` : '';
  useEffect(() => {
    if (!rewardKey) { setNotice(false); return undefined; }
    setNotice(true);
    const timer = setTimeout(() => setNotice(false), 8000);
    return () => clearTimeout(timer);
  }, [rewardKey]);
  const show = () => { setOpen(true); setNotice(false); };
  const collectionLabel = owner ? tr('{owner} 的本局收藏品', { owner }) : tr('自己的本局收藏品');
  return html`<div class="relic-icons" aria-label=${collectionLabel}>
    <${Tooltip} placement="bottom" text=${tr('悬停查看效果，点击查看完整收藏与掉落规则。')}>
      <button type="button" class="relic-icons__heading micro" onClick=${show}
        aria-label=${tr('查看{collectionLabel}，共 {count} 件', { collectionLabel, count })} aria-haspopup="dialog" aria-expanded=${open}>
        RELICS <span class="num">${count}</span>
      </button>
    <//>
    ${shield > 0 || nextShield > 0 ? html`<${Tooltip} text=${shield > 0 ? tr('本回合剩余 {shield} 点护盾，抵消扣血，回合结束失效。', { shield }) : tr('下回合获得 2 点护盾，抵消两点扣血。')}>
      <span class="relic-shield"><${Icon} name="shield" />${shield > 0 ? tr('护盾 {shield}', { shield }) : tr('下回合护盾 2')}</span>
    <//>` : null}
    <div class="relic-icons__grid">
      <${RelicIcons} relics=${preview.visible} reward=${reward} notice=${notice} onOpen=${show} onScratch=${onScratch} onDeathNote=${showDeathNote} />
      ${preview.hidden ? html`<button type="button" class="effect effect--relic relic-icons__more" onClick=${show}
        aria-label=${tr('更多')} title=${tr('更多')} aria-haspopup="dialog" aria-expanded=${open}>
        <span aria-hidden="true">⋯</span>
      </button>` : null}
    </div>
  </div>
    <${Modal} open=${open} title=${html`<span class="relic-panel__title"><${Icon} name="key" />${owner ? tr('{owner} 的收藏品', { owner }) : tr('你的收藏品')} <span class="num">${count}</span></span>`}
      micro="RELIC COLLECTION // THIS MATCH" class="relic-panel" width="min(9.6rem, 94vw)" onClose=${() => setOpen(false)}
      actions=${html`<${Button} size="sm" onClick=${() => setOpen(false)} icon="close">${tr('关闭')}<//>`}>
      ${queuedChess ? html`<p class="relic-panel__note" role="status">${tr('复活干员补给：{queuedChess} 名等待整备区空位，腾出位置后自动获得，跨回合保留。', { queuedChess })}</p>` : null}
      <${RelicList} relics=${relics} reward=${reward} illustrated=${true} revival=${revival} onScratch=${onScratch} onDeathNote=${showDeathNote} />
      <details class="relic-panel__rules relic-panel__caps">
        <summary>${tr('掉落规则')}</summary>
        <p class="relic-panel__rule">${tr('热水壶仅在候选不足时补位，可重复获得，每次恢复2点目标生命值。')}</p>
        <p class="relic-panel__rule">${tr('单次作战损失生命值不超过 5，弹出藏品三选一；本人漏怪时品质降低一级，最低普通，联防救回也适用。每次只获得所选的一件，除热水壶外，永久藏品同名不重复，刮刮票兑奖后可再次获得，效果仅在本局有效。')}</p>
        <p class="relic-panel__balance">${tr('强度分 I–V 五档。无漏怪奖励中 I／II 从 R1 开始出现，III 从 R4 开始，IV／V 从 R7 开始。')}</p>
        <p class="relic-panel__note">${tr('基础概率：无漏怪／漏怪')}</p>
        <div class="relic-odds" aria-label=${tr('第 {round} 回合基础掉落概率', { round })}>
          ${relicOdds(round).map((t) => html`<div key=${t.tier} class=${`relic-odds__tier relic-tier-${t.tier}${t.percent === 0 ? ' is-locked' : ''}`}>
            <b>${roman(t.tier)} · ${tr(t.name)}</b><span>${Number(t.percent.toFixed(2))}% / ${Number(relicOdds(round, { leaked: true })[t.tier - 1].percent.toFixed(2))}%</span>
          </div>`)}
        </div>
        <p class="relic-panel__note">${tr('第 {round} 回合基础概率；已获得的永久藏品移出候选池，实际概率随剩余藏品调整。', { round })}</p>
        <p class="relic-panel__note">${tr('收藏品增益无累计上限，同类属性与伤害增幅相加。')}</p>
      </details>
    <//>
    ${scratchOpen && canScratch ? html`<${ScratchPanel} context=${scratch} initialTicketId=${scratchTicketId} onClose=${() => setScratchOpen(false)} />` : null}
    ${deathNoteOpen && canWrite ? html`<${DeathNotePanel} context=${deathNote} onClose=${() => setDeathNoteOpen(false)} />` : null}`;
}

/** Server offers are the only source of candidates; choosing does not mutate the collection optimistically. */
export function RelicChoice({ offer, deadline = 0, onChoose }) {
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState(false);
  useTicker(offer && deadline ? 200 : 0);
  useEffect(() => { setBusy(null); setFailed(false); }, [offer?.id]);
  if (!offer) return null;
  const cards = (Array.isArray(offer.options) ? offer.options : []).map((id) => getRelic(id));
  const pick = async (idx) => {
    if (busy != null) return;
    setBusy(idx);
    const ok = await onChoose(offer.id, idx);
    if (!ok) { setBusy(null); setFailed(true); }
  };
  const remain = secondsLeft(deadline);
  return html`<${Modal} open=${true} title=${cards.length === 4 ? tr('藏品四选一') : tr('藏品三选一')}
    micro="RELIC CHOICE" width=${cards.length === 4 ? 'min(12rem, 94vw)' : 'min(9rem, 94vw)'} tone="mint" class="relic-choice" closeOnBackdrop=${false}>
    <p class="relic-choice__rule">${offer.leaked ? tr('本次作战有漏怪，候选品质已降低一级（最低普通）。') : tr('本次作战损失生命值 ≤ 5')}</p>
    <div class=${`relic-choice__cards${cards.length === 4 ? ' relic-choice__cards--four' : ''}`}>
      ${cards.map((r, idx) => r ? html`<button key=${idx} type="button" class=${`relic-choice__card relic-tier-${r.tier}`}
        disabled=${busy != null} aria-label=${tr('选择{name}，{1}，{2}', { name: tr(r.name), 1: tierName(r.tier), 2: tr(r.previewDesc || r.desc) })} data-relic-id=${r.id} onClick=${() => pick(idx)}>
        <span class="relic-choice__art"><${Img} src=${relicIconUrl(data.get('assets'), r.id)} fallback=${html`<${Icon} name="key" />`} /></span>
        <span class="relic-choice__tier">${tierName(r.tier)}</span><b>${tr(r.name)}</b><p>${tr(r.previewDesc || r.desc)}</p>
        <span class="relic-choice__pick">${busy === idx ? tr('领取中…') : tr('选择此藏品')}</span>
      </button>` : null)}
    </div>
    ${remain == null ? null : html`<p class="relic-choice__note">${tr('剩余 {remain} 秒；超时自动选择第一件。', { remain })}</p>`}
    ${failed ? html`<p class="relic-choice__error" role="alert">${tr('领取未成功，请重试。')}</p>` : null}
  <//>`;
}
