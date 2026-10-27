import { data } from '../data.js';
import { getRelic } from '../../../shared/relics.js';

export const ownsEnemyNameMask = (state) => !!state?.match?.public
  && !state.match.private?.shinigamiEyes
  && (state.match.private?.relics || []).some((r) => getRelic(r?.id)?.hideEnemyNames);
export function redactEnemyNames(text, names) {
  let result = String(text);
  for (const name of [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length)) {
    result = result.replaceAll(name, '■'.repeat([...name].length));
  }
  return result;
}
let activePattern = null;
export const maskEnemyNames = (text) => activePattern ? String(text).replace(activePattern, (name) => '■'.repeat([...name].length)) : String(text);

/** Presentation only, like 木棍. Never edit data records, input values, specs or submitted spellings. */
export function installEnemyNameMask(store, doc = globalThis.document, refreshPixi = () => {}) {
  if (!doc?.body) return () => {};
  const texts = new Map();
  const attributes = new Map();
  let signature = '';
  let lastOwned = null;
  const observer = new MutationObserver(apply);
  const watch = () => observer.observe(doc.body, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['title', 'aria-label', 'alt', 'placeholder'] });
  function apply() {
    observer.disconnect();
    const walker = doc.createTreeWalker(doc.body, 4);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script,style,textarea,input,[contenteditable]')) continue;
      const prev = texts.get(node);
      const raw = prev && node.nodeValue === prev.masked ? prev.raw : node.nodeValue;
      const masked = maskEnemyNames(raw);
      if (raw !== masked) texts.set(node, { raw, masked }); else texts.delete(node);
      if (node.nodeValue !== masked) node.nodeValue = masked;
    }
    for (const node of texts.keys()) if (!node.isConnected) texts.delete(node);
    for (const el of doc.body.querySelectorAll('[title],[aria-label],[alt],[placeholder]')) {
      let saved = attributes.get(el);
      if (!saved) { saved = new Map(); attributes.set(el, saved); }
      for (const name of ['title', 'aria-label', 'alt', 'placeholder']) {
        const value = el.getAttribute(name);
        if (value == null) { saved.delete(name); continue; }
        const prev = saved.get(name);
        const raw = prev && value === prev.masked ? prev.raw : value;
        const masked = maskEnemyNames(raw);
        if (masked !== raw) saved.set(name, { raw, masked }); else saved.delete(name);
        if (value !== masked) el.setAttribute(name, masked);
      }
      if (!el.isConnected || !saved.size) attributes.delete(el);
    }
    for (const el of attributes.keys()) if (!el.isConnected) attributes.delete(el);
    if (activePattern) watch();
  }
  function sync(force = false) {
    const owned = ownsEnemyNameMask(store.get());
    if (!force && owned === lastOwned) return;
    lastOwned = owned;
    const activeNames = owned ? ['enemies', 'bosses'].flatMap((file) => [
      ...data.list(file).map((r) => r.name), ...Object.values(data.getRaw(file) || {}).map((r) => r?.name),
    ]).filter((n) => typeof n === 'string' && n.length > 0) : [];
    const unique = [...new Set(activeNames)].sort((a, b) => b.length - a.length);
    const next = JSON.stringify(unique);
    if (signature === next) return;
    signature = next;
    activePattern = unique.length ? new RegExp(unique.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu') : null;
    apply();
    refreshPixi();
  }
  const unsub = store.subscribe(() => sync());
  const unsubData = data.subscribe((file) => { if (file === 'enemies' || file === 'bosses') sync(true); });
  sync();
  return () => { unsub(); unsubData(); activePattern = null; apply(); observer.disconnect(); refreshPixi(); };
}
