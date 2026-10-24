import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readZip } from './package-update.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-zip-probe-'));
try {
  for (const unicode of [false, true]) {
    const cwd = path.join(root, unicode ? 'unicode' : 'ascii');
    fs.mkdirSync(path.join(cwd, 'F'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'F', unicode ? '卫戍 a.png' : 'a.png'), Buffer.alloc(5000, 7));
    for (const charset of [false, true]) {
      for (const utf8Locale of [false, true]) {
        const zip = path.join(cwd, `${charset}-${utf8Locale}.zip`);
        const args = ['-c', '--format', 'zip', ...(charset ? ['--options', 'zip:hdrcharset=UTF-8'] : []), '-f', zip, 'F'];
        const env = { ...process.env, ...(utf8Locale ? { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' } : {}) };
        const result = spawnSync('tar', args, { cwd, env, encoding: 'utf8' });
        const names = [];
        let readError;
        try { readZip(zip, (name) => names.push(name)); } catch (error) { readError = error.message; }
        console.log(JSON.stringify({ unicode, charset, utf8Locale, status: result.status, error: result.error?.message, stderr: result.stderr, names, readError }));
      }
    }
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
