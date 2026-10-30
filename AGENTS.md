# AGENTS.md

Entry point for AI coding assistants (Codex, Claude Code, Cursor, Copilot …) working on this repository. It indexes
the existing documents and their hard rules, and defines the project's copywriting guidance below. For gameplay
contracts, when this file and a linked document disagree, the document wins.
Human contributors: see [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution workflow.

## What this is

A non-commercial fan remake of Arknights「卫戍协议：盟约」 that runs in the browser: a Node.js server (economy, rounds,
rooms) and a deterministic battle sim shared by the server and the browser. It aims to be faithful to the official mode.

## Read first

1. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the code map: where things live, data flow, golden results,
   import boundaries, where common changes start.
2. [docs/DESIGN.md](docs/DESIGN.md) — the index of the rules: current rules in `docs/design/`, each release's
   revisions and their evidence in `docs/history/`.
3. The reference for the part you touch: [docs/SIM.md](docs/SIM.md) (battle engine API, hooks, test harness),
   [docs/META.md](docs/META.md) (match flow, shop, protocol), [docs/DATA.md](docs/DATA.md) (generated data),
   [docs/I18N.md](docs/I18N.md) (interface strings), `server/sim/content/kits/README.md` (operator kits).
4. Before editing battle simulation code, read [server/sim/AGENTS.md](server/sim/AGENTS.md) for a short settlement API usage guide.
5. [docs/CI.md](docs/CI.md) — the CI jobs, the test-sharding contract (`ci-shards.json`), how to re-weigh it, the
   timeout policy, and the ways a CI measurement lies.
6. 新增或修改玩家可见文案前，必须阅读并参考下方「文案写作规范」，同时核对对应机制的实现与设计契约。

## Hard rules

- **Formatting.** Use two spaces for JavaScript indentation; do not introduce Tab indentation.
- **Official first.** Rules come from the official data tables (`.cache/gamedata/excel/` after setup) and
  [PRTS](https://prts.wiki/). A detail no source settles is implemented the simplest way and marked `[ASSUMED]` in the
  code and the PR. Deliberate deviations from the official mode are the maintainer's decision only.
- **Determinism.** `server/sim/` is plain ESM that runs in Node and in browsers: no Node APIs, no `Math.random`, no
  clocks, and no engine-approximated Math functions (use `server/sim/detmath.js`; ESLint and
  `test/sim/detmath.test.js` enforce it).
- **Golden results.** A refactor must not change `test/golden/*.json`. An intended gameplay change runs
  `npm run golden:update` in the same commit, and the commit / PR names every moved scenario and why
  ([test/golden/README.md](test/golden/README.md)).
- **Generated data.** Never hand-edit `data/*.json`: change `tools/build-data.mjs` and regenerate.
- **No game art in git.** `public/assets/` is ignored; never commit extracted or downloaded game files.
- **Interface strings** go through `t('…')`, with entries in every pack under `public/i18n/`
  (`node tools/i18n.mjs check --all --strict`).
- **Docs follow the code.** A rule change updates `docs/design/`, the current `docs/history/` file and the reference
  docs; run `node --test test/docs-consistency.test.js test/docs-paths.test.js`.
- **Commits and PRs**: one topic per PR; a one-line message of what changed (Chinese or English) with the issue number;
  no attribution trailers (`Co-Authored-By:`, `Generated with …`). The PR description states what, why, the sources,
  the `[ASSUMED]` points, the tests you ran (paste the summary lines) and the golden moves. No ads, payments or other
  monetisation — the project stays non-commercial.

## 文案写作规范

本节提炼自维护者提供的《明日方舟》风格文案写作指南，适用于新增、改写及翻译收藏品、技能、状态、
敌人情报、作战规则和界面提示。它是本项目的写作要求，不是官方编辑规范；指南中的原创示例不能作为机制依据。
本节可独立使用，无需依赖仓库外的原始指南文件。

### 功能与依据

- **先确定文本用途。** 技能、效果和系统提示以准确、紧凑、可执行为先；战术提示客观简洁；物品背景、
  档案和剧情才使用适度修辞。不要将所有文案写成阴郁诗句、宏大宣言或攻略口语。
- **先核对机制，再润色。** 官方内容核对对应版本的数据与原文；DLC 改编内容按维护者确认的规则及当前实现描述，
  不为贴近原作而擅自改动玩法。发现文案、实现与设计不一致时明确指出，不用模糊措辞掩盖，也不把改编效果标为官方原文。
- **参考同类型样本。** 新写一类文案或大幅改写时，优先比较至少三条同类型的官方实际文本，观察信息顺序、句长、
  触发词和叙述视角；小范围修订可沿用已核实的项目范式。不得把攻略解释、社区推测或指南示例冒充官方文本。

### 效果描述与术语

- **规则要素齐全。** 明确作用对象、触发时机、效果及数值、持续时间、次数和叠加限制，以及影响决策的例外。
  区分持有者与全队、已部署干员与整备区干员、干员与召唤物；百分比说明基准是当前值、最大值还是基础值。
  取整、最低值、多人共享次数等会影响结果的条件不得因精简而省略。
- **信息顺序清楚。** 属性与行动变化优先；条件效果采用「触发条件 → 对象与效果 → 持续或限制」的句式。
  推荐写法如「攻击力+80%」「对目标造成相当于自身攻击力200%的物理伤害」「每次攻击命中时使目标停顿0.5秒」
  「每场战斗仅可触发1次」。回复方式、技能消耗等已有独立信息栏的内容不必在正文反复说明。
- **不可混换机制词。** 攻击力加成不等于伤害倍率，攻击速度不等于攻击间隔；攻击时、命中时、造成伤害时和击倒时
  不能互换；叠加层数不等于触发次数。伤害类型、元素损伤与元素伤害、异常状态名称均按实际机制使用，
  不用「无法动弹」「高额伤害」替代已可明确的状态或数值。
- **沿用项目术语。** 使用「资金」「休整期」「整备区」「调度中心」「目标生命值」「法术抗性」「领袖」；
  「准备」用于玩家操作或状态，避免与休整期混称。区分干员生命值与玩家目标生命值、干员被击倒与玩家淘汰。
  本项目按次数抵挡伤害的效果称「护盾」，按数值吸收伤害的效果称「屏障」；命名仍须核对具体实现，不能批量互换。
  翻译术语遵循 [docs/I18N.md](docs/I18N.md)。

### 层次、背景与校对

- **复杂效果分层。** 多个并列机制用句号或分号拆开，通常效果、替代效果与例外分别说明。卡片简述保留决定选择所需的
  信息；详细结算、概率表和边界条件放在详情或规则文档中并保持一致。删除重复操作说明，不删除关键限制和无障碍标签。
- **效果与背景分开。** 收藏品背景可按「具体外观或用途 → 一处反常细节 → 经历或情绪暗示」展开，允许日常感和幽默，
  不必给每件藏品强加故事。敌人背景、战术威胁和机制细则分层；作战说明先讲危险与应对。档案使用有依据的有限视角，
  对白符合人物身份；不滥用反问、长篇独白或遮蔽符号。名称简洁且贴合物件、身份或主题，不强求四字。
- **交稿前逐项校对。** 对照实现检查数值、对象、时机、叠加和例外；确认删去修辞后规则仍完整，界面简述与详情不矛盾。
  标点、括号和强调样式沿用所在界面，不把某种括号当作全局官方格式。中文文案键改变时同步全部语言包和相关文案断言，
  执行上方的 i18n 严格检查；长文案或布局敏感的改动检查实际界面的换行、溢出和按钮可达性。

## Verify

Run the tests of what you touched first, then everything before opening the PR:

```bash
node --test test/<area>/<file>.test.js      # targeted
npm run ci                                  # the CI checks locally (tools/ci.mjs): npm test, smoke, lint, imports, types
npm run golden                              # golden results
```

Browser suites are off by default and need Chrome: `SP_E2E=1` (UI), `SP_REAL_E2E=1` (real match, needs assets),
`RENDER_E2E=1`, `SIM_E2E=1` — see CONTRIBUTING.md §2. Battle tests are easiest with the helpers described in
docs/SIM.md (the test harness section) and the patterns in `test/content/op_siege.test.js`.
