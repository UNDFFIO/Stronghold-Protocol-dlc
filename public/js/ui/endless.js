import { useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, Icon, useTicker, secondsLeft } from './components.js';
import { PlayerAvatar } from './gameComponents.js';
import { actions } from './gameActions.js';
import { useStore } from '../store.js';
import { t } from '../../../shared/i18n.js';

export function EndlessVote({ pub }) {
  const myId = useStore(s => s.me.playerId);
  const online = useStore(s => s.connection.status === 'online');
  const [busy, setBusy] = useState(false);
  useTicker(pub?.endlessVote && pub.deadline ? 250 : 0);
  const vote = pub?.endlessVote;
  if (!vote) return null;
  const voter = vote.voters.includes(myId);
  const agreed = vote.agreed.includes(myId);
  const remain = secondsLeft(pub.deadline);
  const send = async (agree) => {
    if (busy) return;
    setBusy(true);
    try { await actions.endlessVote(agree); } finally { setBusy(false); }
  };
  return html`<${Modal} open=${true} title=${t('继续挑战投票')} closeOnBackdrop=${false} width="min(650px, 94vw)" class="endless-vote">
    <div class="endless-vote__players" role="list" aria-live="polite">${vote.voters.map(id => {
      const player = pub.players.find(p => p.playerId === id);
      const done = vote.agreed.includes(id);
      return html`<div key=${id} role="listitem" class=${`endless-vote__player${done ? ' is-agreed' : ''}`}>
        <span class="endless-vote__face">
          <${PlayerAvatar} player=${player} self=${id === myId} />
          ${done ? html`<span class="team__spmark is-done" aria-hidden="true"><${Icon} name="check" /></span>` : null}
        </span>
        <b class="endless-vote__name" title=${player?.name || id}>${player?.name || id}</b>
        <span class="endless-vote__state">${done ? t('已同意') : t('待同意')}</span>
      </div>`;
    })}</div>
    ${remain == null ? null : html`<p class="endless-vote__timer">${t('剩余 {n} 秒；超时结算本局。', { n: remain })}</p>`}
    ${voter ? html`<div class="endless-vote-actions">
      <${Button} variant="primary" disabled=${!online || busy || agreed} onClick=${() => send(true)}>${agreed ? t('已同意') : t('继续挑战')}<//>
      <${Button} disabled=${!online || busy} onClick=${() => send(false)}>${t('结算本局')}<//>
    </div>` : null}
    <details class="endless-vote__rules">
      <summary>${t('挑战规则')}</summary>
      <p>${t('隐秘核心已击败。全员同意后继续挑战；任一人选择结算则结束本局。')}</p>
      <p>${t('额外前 10 回合，敌方生命值与攻击力每回合增加基础值的 10%；之后每回合在上一回合基础上增加 15%。每 6 回合挑战随机领袖。')}</p>
      <p>${t('后续失败仍算成功，结算记录额外通过回合数。')}</p>
    </details>
  <//>`;
}
