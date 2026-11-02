// Rebuild the DLC records from already generated official data, without downloading a different official snapshot.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { buildSpecialOperators, LIONHEART_ID } from '../shared/specialOperators.js';
import { buildRecordOverlay } from '../shared/i18nData.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));

export async function buildSpecialOperatorData() {
  const [chess, tokens, bonds] = await Promise.all(['chess', 'tokens', 'bonds'].map((f) => read(`data/${f}.json`)));
  const records = buildSpecialOperators(chess, tokens);
  if (!records[LIONHEART_ID]) throw new Error('Golden Vow and its source operator must exist in generated data');
  Object.assign(chess, records);
  for (const c of Object.values(records)) for (const id of c.bonds) {
    if (!bonds[id].members.includes(c.chessId)) bonds[id].members.push(c.chessId);
  }
  for (const [file, data] of Object.entries({ chess, bonds })) {
    await writeFile(join(root, 'data', `${file}.json`), JSON.stringify(data));
  }
  for (const lang of ['en', 'zh-TW', 'ja', 'ko']) {
    const [overlay, pack] = await Promise.all([read(`data/i18n/${lang}.json`), read(`public/i18n/${lang}.json`)]);
    const c = records[LIONHEART_ID];
    const name = pack[c.name];
    const leaves = [{ path: ['name'], zh: c.name, en: name }];
    const translated = (text) => {
      if (!pack[text]) throw new Error(`Missing ${lang} translation for ${text}`);
      return pack[text];
    };
    for (const key of ['desc', 'descRaw']) {
      leaves.push({ path: ['trait', key], zh: c.trait[key], en: translated(c.trait[key]) });
    }
    for (let i = 0; i < c.talents.length; i++) for (const key of ['name', 'desc', 'descRaw']) {
      const text = c.talents[i][key];
      leaves.push({ path: ['talents', i, key], zh: text, en: translated(text) });
    }
    overlay.files.chess[LIONHEART_ID] = buildRecordOverlay(leaves);
    overlay.names[c.name] = name;
    await writeFile(join(root, 'data', 'i18n', `${lang}.json`), JSON.stringify(overlay));
  }
  console.log('Built special operators and translations from the existing official data.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSpecialOperatorData().catch((e) => { console.error(e); process.exitCode = 1; });
}
