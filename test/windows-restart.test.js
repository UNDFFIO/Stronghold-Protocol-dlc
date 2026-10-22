import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restartWindowsServer } from '../scripts/launch.mjs';
import { PLAYER_SCRIPTS } from '../tools/package.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Windows restart stops first, then verifies the requested port is free', async () => {
  const calls = [];
  assert.equal(await restartWindowsServer(3001, '::', () => {
    calls.push('stop');
    return { status: 0 };
  }, async (port, host) => {
    calls.push([port, host]);
    return { state: 'free' };
  }), true);
  assert.deepEqual(calls, ['stop', [3001, '::']]);
  assert.ok(PLAYER_SCRIPTS.includes('scripts/stop-windows-server.ps1'));
});

test('Windows restart aborts on stop failure without proceeding to port checks', async () => {
  let probed = false;
  assert.equal(await restartWindowsServer(3000, '::', () => ({ status: 1 }), async () => {
    probed = true;
    return { state: 'free' };
  }), false);
  assert.equal(probed, false);
});

for (const mode of ['standalone', 'runner', 'foreign', 'denied']) {
  test(`Windows stop helper: ${mode} (mocked processes; no real service stopped)`, { skip: process.platform !== 'win32' }, () => {
    const helper = path.join(ROOT, 'scripts/stop-windows-server.ps1').replaceAll("'", "''");
    const runner = path.join(ROOT, 'scripts/run-server.cmd').replaceAll("'", "''");
    const command = `
      $ErrorActionPreference = 'Stop'
      $global:killed = @()
      $global:taskStopped = $false
      function Get-NetTCPConnection { [pscustomobject]@{ OwningProcess = 101 } }
      function Get-CimInstance {
        param($ClassName, $Filter)
        if ($Filter -eq 'ProcessId=101') {
          [pscustomobject]@{ Name = '${mode === 'foreign' ? 'other.exe' : 'node.exe'}'; CommandLine = 'node C:\\app\\server\\index.js'; ParentProcessId = 100 }
        } else {
          [pscustomobject]@{ Name = 'cmd.exe'; CommandLine = '${mode === 'runner' ? runner : 'cmd /c unrelated.cmd'}'; ProcessId = 100 }
        }
      }
      function Get-ScheduledTask { [pscustomobject]@{ Actions = @([pscustomobject]@{ Arguments = '/c "${runner}"' }) } }
      function Stop-ScheduledTask { param([Parameter(ValueFromPipeline=$true)]$Task) process { $global:taskStopped = $true } }
      function Get-Process { param($Id) if ($global:killed -notcontains $Id) { [pscustomobject]@{ Id = $Id } } }
      function taskkill.exe {
        $global:killed += [int]$args[1]
        $global:LASTEXITCODE = ${mode === 'denied' ? 1 : 0}
      }
      & '${helper}' -Port 3000
      if ('${mode}' -eq 'runner') {
        if (-not $global:taskStopped -or ($global:killed -join ',') -ne '100,101') { throw 'Restart loop/task not stopped first' }
      } elseif (($global:killed -join ',') -ne '101' -or $global:taskStopped) { throw 'Wrong process stopped' }
    `;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8' });
    assert.equal(result.status, ['foreign', 'denied'].includes(mode) ? 1 : 0, result.stdout + result.stderr);
    if (mode === 'foreign') assert.match(result.stderr, /refusing to stop/);
    if (mode === 'denied') assert.match(result.stderr, /administrator/);
  });
}
