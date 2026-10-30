// Co-op access settings: the host edits them; teammates and spectators can inspect the public state.
import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { ROOM_PASSWORD_MAX_LEN } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';
import { net } from '../net.js';
import { html, Button, Icon, TextField } from './components.js';
import { describeError } from './toasts.js';

export function RoomAccessSettings({ room, isHost, online, disabled }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const editable = isHost && online && !room.inMatch && !disabled;
  const save = async (fields) => {
    if (lock.current || !editable) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await net.request('room.setSettings', { isPublic: !!room.isPublic, ...fields });
      if (alive.current && 'password' in fields) setPassword('');
    } catch (err) { if (alive.current) setError(err); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const savePassword = () => { if (password) return save({ password }); };
  return html`<section class="room-config" aria-label=${t('房间设置')}>
    <div class="room-config__row">
      <div><strong>${t('公开房间')}</strong><p>${t('公开后，其他博士可在大厅中找到此房间')}</p></div>
      <button type="button" class=${`set-toggle${room.isPublic ? ' is-on' : ''}`} role="switch"
          aria-label=${t('公开房间')} aria-checked=${room.isPublic ? 'true' : 'false'}
          disabled=${!editable || busy} onClick=${() => save({ isPublic: !room.isPublic })} data-testid="room-public-toggle">
        <i></i><span>${room.isPublic ? t('公开') : t('私密')}</span>
      </button>
    </div>
    <div class="room-config__password" onFocusOut=${(e) => { if (e.target.name === 'room-new-password') savePassword(); }}>
      ${isHost ? html`<${TextField} label=${t('房间密码')} type="password" name="room-new-password" value=${password}
        placeholder=${room.hasPassword ? t('留空保留当前密码') : t('留空则无需密码')}
        maxLength=${ROOM_PASSWORD_MAX_LEN} disabled=${!editable || busy} onInput=${(v) => { setPassword(v); setError(null); }} onEnter=${savePassword} />
        <div class="room-config__password-status"><span><${Icon} name="key" />
          ${password ? t('将设置新密码') : room.hasPassword ? t('已设置密码') : t('未设置密码')}</span>
          ${room.hasPassword ? html`<${Button} size="sm" variant="ghost" disabled=${!editable || busy}
            onClick=${() => save({ password: '' })} data-testid="room-password-clear">
            ${t('清除密码')}<//>` : null}
        </div>
        <p class="room-config__hint">${t('加入和观战均需密码，最多 {n} 个字符', { n: ROOM_PASSWORD_MAX_LEN })}</p>`
        : html`<div class="room-config__row"><strong>${t('房间密码')}</strong><span>${room.hasPassword ? t('已设置密码') : t('未设置密码')}</span></div>`}
    </div>
    ${!isHost ? html`<p class="room-config__hint">${t('仅房主可以修改房间设置')}</p>` : null}
    ${error ? html`<p class="room-form__error" role="alert">${describeError(error)}</p>` : null}
  </section>`;
}
