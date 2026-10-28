import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, Icon, Tooltip } from './components.js';
import { t } from '../../../shared/i18n.js';

export function DeathNoteWriting({ context }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setName(''); setBusy(false); setFailed(false); }, [context.round]);
  const enabled = context.canUse && !context.used && context.funds >= (context.cost ?? 8);
  const write = async (event) => {
    event.preventDefault();
    if (!enabled || busy || !name.trim()) return;
    setBusy(true); setFailed(false);
    try {
      if (!await context.onWrite(name.trim(), context.round)) setFailed(true);
    } catch {
      setFailed(true);
    } finally { setBusy(false); }
  };
  return html`<form class="death-note" onSubmit=${write}>
    <label>${t('敌人名称')}<input type="text" value=${name} maxlength="128" autocomplete="off" data-autofocus
      spellcheck="false" disabled=${!enabled || busy} onInput=${(e) => setName(e.target.value)} /></label>
    <${Button} variant="primary" type="submit" disabled=${!enabled || busy || !name.trim()}>
      ${context.used ? t('本回合已书写') : t('书写名字')}<//>
    ${failed ? html`<p role="alert">${t('书写失败，请重试')}</p>` : null}
  </form>`;
}

/** Ink engraving on the paper: a clickable pact, kept separate from the once-per-round writing. */
function ShinigamiEyes({ context }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const trade = async () => {
    if (!context.canUse || context.eyes || busy) return;
    setBusy(true); setFailed(false);
    try { if (!await context.onEyes(context.round)) setFailed(true); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return html`<div class=${`death-note-eyes${context.eyes ? ' is-active' : ''}`}>
    <${Tooltip} placement="right" text=${t('消耗当前目标生命值的一半（剩余值向上取整），解除敌人名称遮蔽，自身目标生命值不再显示，书写消耗降为4资金。本局仅可交换1次。')}>
      <button type="button" class="death-note-eyes__pact" aria-label=${t('死神之眼')} aria-pressed=${!!context.eyes}
        disabled=${!context.canUse || context.eyes || busy} onClick=${trade}>
        <svg class="death-note-eyes__art" viewBox="0 0 240 240" fill="none" stroke="currentColor" aria-hidden="true">
          <circle cx="120" cy="120" r="96" stroke-width=".7" />
          <circle cx="120" cy="120" r="90" stroke-width=".5" stroke-dasharray="1 5" />
          <circle cx="120" cy="120" r="78" stroke-width=".6" />
          ${Array.from({ length: 24 }, (_, i) => html`<path key=${i} d="M120 25V36 M117 38L120 42L123 38"
            stroke-width=".8" transform=${`rotate(${i * 15} 120 120)`} />`)}
          <path d="M28 120Q120 22 212 120Q120 218 28 120Z" stroke-width="1.5" />
          <path d="M35 120Q120 43 205 120 M39 126Q120 197 201 126" stroke-width=".6" />
          <path d="M47 101L41 87 M64 88L58 70 M84 77L80 57 M106 71L104 51 M134 71L136 51 M156 77L160 57 M176 88L182 70 M193 101L199 87" stroke-width=".8" />
          <circle cx="120" cy="120" r="40" stroke-width="1.2" />
          <circle cx="120" cy="120" r="34" stroke-width=".6" />
          ${Array.from({ length: 20 }, (_, i) => html`<path key=${i} d="M120 87L117 99 M120 153L123 141"
            stroke-width=".65" transform=${`rotate(${i * 18} 120 120)`} />`)}
          <path class="death-note-eyes__pupil" d="M120 91Q136 120 120 149Q104 120 120 91Z" fill="currentColor" stroke-width=".5" />
          <path d="M120 13V21 M120 219V227 M13 120H21 M219 120H227 M113 17L120 10L127 17 M113 223L120 230L127 223" stroke-width=".8" />
          <path d="M90 173L86 183 M104 177L102 190 M120 179V194 M136 177L138 190 M150 173L154 183" stroke-width=".7" />
        </svg>
        <span class="death-note-eyes__name">${t('死神之眼')}</span>
        <small>${context.eyes ? t('已获得') : t('以一半目标生命值交换')}</small>
      </button>
    <//>
    ${failed ? html`<p role="alert">${t('交换失败，请重试')}</p>` : null}
  </div>`;
}

/** A collectible's own face, like an opened scratch ticket, rather than a collection dialog. */
export function DeathNotePanel({ context, onClose }) {
  return html`<${Modal} open=${true} class="death-note-panel" veilClass="death-note-veil" onClose=${onClose}>
    <article class="death-note-book" aria-label=${t('死亡笔记')}>
      <button class="death-note-book__close" type="button" aria-label=${t('关闭')} onClick=${onClose}><${Icon} name="close" /></button>
      <section class="death-note-book__page death-note-book__page--left">
        <hgroup class="death-note-book__titles">
          <span class="death-note-book__edition">DEATH NOTE</span>
          <h2>${t('死亡笔记')}</h2>
        </hgroup>
        <${ShinigamiEyes} context=${context} />
        <span class="death-note-book__folio" aria-hidden="true">I</span>
      </section>
      <section class="death-note-book__page death-note-book__page--right">
        <span class="death-note-book__round">${t('第 {round} 回合', { round: context.round })}</span>
        <${DeathNoteWriting} context=${context} />
        <div class="death-note-book__footer">
          <span class="death-note-book__folio" aria-hidden="true">II</span>
          <small class="death-note-book__cost">${t('{amount}资金', { amount: context.cost ?? 8 })}</small>
        </div>
      </section>
    </article>
  <//>`;
}
