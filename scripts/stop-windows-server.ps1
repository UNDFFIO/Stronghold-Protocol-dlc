# Called by launch.mjs only after /healthz identified this port as a game server.
param([Parameter(Mandatory = $true)][int]$Port)
$ErrorActionPreference = 'Stop'
try {
  $owners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($ownerId in $owners) {
    $server = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
    if (-not $server) { continue }
    if ($server.Name -ne 'node.exe' -or $server.CommandLine -notmatch 'server[\\/]index\.js(?:"|\s|$)') {
      throw "Port $Port is no longer owned by a game server; refusing to stop it."
    }
    $targetId = $ownerId
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($server.ParentProcessId)"
    $runner = Join-Path $PSScriptRoot 'run-server.cmd'
    # Stop our restart loop together with its children, not just the node it would respawn.
    if ($parent -and $parent.Name -eq 'cmd.exe' -and $parent.CommandLine -and
        $parent.CommandLine.IndexOf($runner, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      $targetId = $parent.ProcessId
      # Tell Task Scheduler this is an intentional stop, so its failure policy does not restart it later.
      Get-ScheduledTask -ErrorAction Stop | Where-Object {
        @($_.Actions | Where-Object { $_.Arguments -and
          $_.Arguments.IndexOf($runner, [StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count -gt 0
      } | Stop-ScheduledTask -ErrorAction Stop
    }
    if (Get-Process -Id $targetId -ErrorAction SilentlyContinue) {
      & taskkill.exe /PID $targetId /T /F
      if ($LASTEXITCODE -ne 0) { throw 'Could not stop the previous server. If it runs as SYSTEM, run the launcher as administrator.' }
    }
    # Task Scheduler may have stopped cmd.exe but left its node child running.
    if ($targetId -ne $ownerId -and (Get-Process -Id $ownerId -ErrorAction SilentlyContinue)) {
      & taskkill.exe /PID $ownerId /T /F
      if ($LASTEXITCODE -ne 0) { throw 'Could not stop the previous server process.' }
    }
  }
} catch {
  Write-Error $_ -ErrorAction Continue
  exit 1
}
