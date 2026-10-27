import { useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, useTicker, secondsLeft } from './components.js';
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
    <p>${t('隐秘核心已击败。全员同意后继续挑战；任一人选择结算则结束本局。')}</p>
    <p>${t('每个额外回合敌方生命值与攻击力增加基础值的 5%；每 6 回合挑战随机领袖。')}</p>
    <p>${t('后续失败仍算成功，结算记录额外通过回合数。')}</p>
    <ul>${vote.voters.map(id => html`<li key=${id}>${pub.players.find(p => p.playerId === id)?.name || id} · ${vote.agreed.includes(id) ? t('已同意') : t('待同意')}</li>`)}</ul>
    ${remain == null ? null : html`<p>${t('剩余 {n} 秒；超时结算本局。', { n: remain })}</p>`}
    ${voter ? html`<div class="endless-vote-actions">
      <${Button} variant="primary" disabled=${!online || busy || agreed} onClick=${() => send(true)}>${agreed ? t('已同意') : t('继续挑战')}<//>
      <${Button} disabled=${!online || busy} onClick=${() => send(false)}>${t('结算本局')}<//>
    </div>` : null}
  <//>`;
}
