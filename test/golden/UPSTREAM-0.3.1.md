# Upstream 0.3.1 synchronization

Merged upstream `c9d804f4` into DLC from the previous upstream base `c24e17ee`.
The target includes v0.3.1 and the subsequent Windows and asset-file validation fixes.

## Golden changes

Only `roster-039` changes from the pre-sync DLC baseline: upstream commit `4d11e97d`
keeps 琳琅诗怀雅 S3 active with its accumulated coins instead of closing automatically
at ten coins. See [the upstream rule and evidence](../../docs/history/0.3.1.md).
The roster baseline is regenerated on the merged tree; the other five families are unchanged.

All 290 scenarios pass: roster 49, bonds 46, fields 22, matches 23, standins 10, DIY 140.
The five battle families match the upstream baselines; matches retain the DLC baseline.

## DLC compatibility

Collectibles, difficulty levels 0–20, round-four supplies, staged shop expansion,
revival, damage ranking and public/password rooms remain enabled. Plugin battle options
carry both the DLC difficulty level and upstream rule switches. Test rooms retain their
upstream acknowledgement and statistics exclusion alongside password access; public
summaries and cards mark them as tests. This merge adds no new DLC gameplay rule.

## Verification

- Full CI exercised 8,832 tests: 8,754 passed and 60 optional suites skipped on the first run. Its 18 failures
  identified missing/stale local assets, outdated DLC assertions and a fuzz fixture, an optional-table FX assertion, a Windows Python launcher,
  plus resource-sensitive plugin/profiling checks. Each failing test file was rerun after the corresponding fix
  or cache refresh; plugin checks used `--test-concurrency=2` to avoid competing with all full-match simulations.
- All 290 golden scenarios pass; `npm run golden:update -- --family roster` reproduces the upstream roster digest.
- Public/password/test-room browser coverage passes (6 tests), alongside supplies, difficulty and collectible journal coverage.
- Setup, HTTP smoke, ESLint (warnings allowed), import boundaries, typecheck, strict i18n and documentation checks pass.

The synchronization is local; no remote push or deployment is part of this change.
