# 卫戍协议：盟约 DLC · Stronghold-Protocol-dlc

基于 [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) 的非官方玩法扩展 fork，在原有浏览器自走棋塔防与单人 / 1–4 人合作玩法上，加入**收藏品、超限模拟和后期商店扩展**。DLC 是本 fork 的扩展标识，非鹰角官方 DLC。

![base version](https://img.shields.io/badge/upstream%20base-0.1.1-2ea44f)
![license](https://img.shields.io/badge/code%20license-GPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)

## 声明

> [!IMPORTANT]
> - 本项目是玩家自制的**非官方同人作品**，与上海鹰角网络科技有限公司（Hypergryph）、Yostar 及其关联方**没有任何关系**，未获其授权或认可。
> - 《明日方舟》及「卫戍协议」相关的名称、角色、美术、音乐、音效、文本与数据等素材，版权归原权利人所有。这些素材**不适用**本项目的 GPL-3.0 许可证；GPL 只覆盖本项目自己编写的代码。
> - 仅供学习交流与个人非商业使用。**严禁任何形式的盈利**，包括但不限于：售卖本项目或整合包、付费下载或付费分发、收费服务器或收费代开、广告 / 打赏 / 会员等变现方式，以及其他任何商业用途。
> - 仓库源码不包含游戏的美术与音频素材（只有由官方数据表生成的数据和几张游戏截图，同样不适用 GPL）；[Releases](../../releases/latest) 中的整合包为了方便玩家附带了素材，下载即视为同意本声明。请勿将素材用于本项目以外的用途或单独再分发。完整条款见 [NOTICE.md](NOTICE.md)。
> - 权利人如认为本项目侵犯其权益，请通过 Issue 联系，我们会**立即删除**相关内容。
> - 本项目按「现状」提供，**不提供任何担保**，使用风险自负。

English summary: [below](#english).

## 目录

- [与原项目的差异](#与原项目的差异) · [Fork 扩展玩法](#fork-扩展玩法)
- [快速开始](#快速开始) · [配置与联机](#配置与联机) · [文档](#文档) · [开发与测试](#开发与测试)
- [声明](#声明) · [许可证](#许可证) · [致谢与数据来源](#致谢与数据来源) · [贡献](#贡献)

## 与原项目的差异

本 fork 以原项目 **0.1.1** 为基础，当前保留上游至 `052e906` 的修复。以下比较针对这一基线；`package.json` 中的 0.1.1 是沿用的基础版本号，不表示这些扩展已属于上游发布内容。

| 项目 | 原项目（0.1.1 基线） | 本 fork |
|---|---|---|
| 难度 | 标准 / 险境 / 绝境 / 终极四种模拟 | 保留四种基础难度，新增以终极为基础的「超限模拟」0–20 级，逐级累积战场协议 |
| 作战奖励 | 无本局收藏品选择流程 | 无漏怪作战后藏品三选一，43 件藏品按回合进度分档掉落，增益整局保留 |
| 连续漏怪 | 按原有扣血与联防规则结算 | 连续三个完成的作战回合本人漏怪后，存活玩家获得逆风补给三选一与下回合 2 点护盾 |
| 后期招募 | 干员招募位数量由调度中心等级决定 | 第 9 回合起，在原有数量上增加两个干员招募位，装备位不变 |
| 界面 | 原有难度选择、效果栏与结算展示 | 增加超限等级轮盘与规则预览、个人收藏图标和详情、奖励选择及结算收藏展示 |

原项目的招募与晋升、盟约、装备、联防、最终攻势、隐秘核心、AI 队友及断线重连仍作为基础玩法保留；干员技能、敌人规则、渲染、启动器和诊断等上游修复也继续保留。基础玩法见 [玩法指南](docs/PLAYING.md)，上游版本记录见 [CHANGELOG.md](CHANGELOG.md)。

这些扩展会改变成长与战斗平衡：**选择四种基础难度仍会启用收藏品与后期商店扩展**，并不等于回到原项目规则。藏品名称与图标参考明日方舟其他玩法，但档位、数值与效果经过本 fork 适配，不代表官方「卫戍协议」规则。

## Fork 扩展玩法

### 本局收藏品

- **43 件、五档强度**：普通 / 精良 / 稀有 / 史诗 / 传说，候选概率随回合推进变化。无漏怪作战后从三个候选中领取一件，候选排除已拥有藏品。
- **个人持有、整局生效**：从下一场战斗开始生效，不占装备槽或整备区，干员属性加成只给持有者，鸭梨手机降低全队累计难度；新的一局重新收集。同类增益相加且不设累计上限，同名藏品不会重复获得。
- **逆风补给**：连续三回合本人漏怪可触发较高档位奖励，并获得仅下回合有效的 2 点扣血护盾。联防救回敌人或护盾抵消扣血，都不会抹掉本人漏怪记录。
- **选择与展示**：单人及仅一名人类的对局选择不计时，多人限时 30 秒；右侧图标支持悬停、聚焦或长按查看，结算保留本局收藏记录。

完整清单、概率、生效边界与领袖结算规则见 [收藏品说明](docs/COLLECTIBLES.md)。已有素材的安装可运行 `node tools/fetch-relic-icons.mjs` 补齐 43 张收藏品图标（含四件原创图片）；首次安装的素材下载流程已包含这些图标。

### 超限模拟

超限模拟沿用终极模拟的基础参数，**0 级不附加超限协议**；1–20 级逐级累积，选择某一级会同时启用此前所有协议。协议包含敌人开场加速、死亡余烬、首击屏障、护甲轮转、技力限制、回响分裂与接力屏障等机制，要求玩家调整站位、输出组合与技能节奏。

单人开局或同盟房主选择难度时，可通过等级轮盘查看当前规则与应对提示；同盟等级同步到全房间。协议定义见 `shared/difficulty.js`，由界面与浏览器 / 服务端战斗模拟共用。

### 后期商店扩展

第 9 回合起，所有难度的商店均额外提供**两个干员招募位**，与调度中心等级独立；购买、刷新、冻结及 AI 招募逻辑已适配扩展后的数量。装备位与公共卡池规则沿用原有机制。

## 快速开始

安装 **Node.js 22 或 24**，从当前 fork 运行：

```bash
git clone https://github.com/UNDFFIO/Stronghold-Protocol-dlc.git
cd Stronghold-Protocol-dlc
npm install
npm run setup
npm start
```

打开 [http://localhost:3000](http://localhost:3000)。`npm install` 会准备前端依赖，`npm run setup` 会检查环境并下载游戏素材；素材与数据须遵守上方声明。

也可使用启动脚本：Windows 双击 `scripts\start-windows.bat`；macOS / Linux 运行 `bash scripts/start.sh`。首次启动会自动安装依赖并下载素材。

- **运行条件**：服务器使用 Windows / macOS / Linux + Node.js；玩家使用支持 WebGL 的现代浏览器，手机建议横屏。
- **3D 棋盘**：需要从本机《明日方舟》客户端提取贴图；未提取时使用 2D 棋盘。提取与素材目录说明见 [docs/ASSETS.md](docs/ASSETS.md)。
- **诊断**：`npm run doctor` 检查 Node 版本、素材、端口、局域网地址和防火墙。
- **整合包**：如使用整合包，请确认包含本 fork 的扩展代码与收藏品图标；上游 0.1.1 整合包不包含这些扩展。

## 配置与联机

默认监听 TCP 3000。同一局域网的朋友可打开启动窗口列出的地址，加入同盟房间；异地联机、开机自启、反向代理与 HTTPS、Docker 等配置见 [部署指南](docs/DEPLOY.md)。

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址，`127.0.0.1` 仅允许本机访问 |
| `SP_COMBAT` | `client` | `client` 在玩家浏览器模拟；`server` 在服务器模拟并推流 |
| `SP_VERIFY` | `off` | 服务端复算：`off` / `sample` / `all` |
| `TRUST_PROXY` | `auto` | 转发头信任设置：`auto` / `1` / `0` |
| `DEBUG` | 空 | 启用详细日志 |
| `SP_NO_BROWSER` | 空 | 设为 `1` 时启动脚本不自动打开浏览器 |

PowerShell 更换端口：`$env:PORT=8080; npm start`。健康检查：`GET /healthz`。

服务器使用常驻 Node.js 进程与 WebSocket（`/ws`），运行单实例，反向代理需转发 WebSocket 升级。游戏没有账号系统，请仅与熟人分享地址。对局保存在内存中，**重启服务器会结束所有对局**。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/COLLECTIBLES.md](docs/COLLECTIBLES.md) | Fork 收藏品清单、奖励概率、增益与护盾规则 |
| [docs/PLAYING.md](docs/PLAYING.md) | 基础玩法与扩展规则：操作、经济、难度、联防和领袖流程 |
| [CHANGELOG.md](CHANGELOG.md) | 保留的上游版本更新记录 |
| [docs/DEPLOY.md](docs/DEPLOY.md) | 开服、联机、部署与排错 |
| [docs/DESIGN.md](docs/DESIGN.md) · [docs/SIM.md](docs/SIM.md) · [docs/META.md](docs/META.md) | 上游架构、战斗模拟及对局经济参考；扩展实现另见共用定义与对应代码 |
| [docs/DATA.md](docs/DATA.md) · [docs/ASSETS.md](docs/ASSETS.md) | 游戏数据与素材来源 |
| [docs/BALANCE.md](docs/BALANCE.md) · [docs/research/](docs/research/00-INDEX.md) | 上游难度模型与官方规则调研 |

## 开发与测试

```bash
npm run dev       # 监听服务器代码修改并自动重启
node --test       # 单元与集成测试
node --test test/content/relics.test.js test/match/relics.test.js test/sim/ascension.test.js test/difficulty-level.test.js test/ui/relics.test.js
```

浏览器测试需要 Chrome（可用 `CHROME_PATH` 指定）及对应素材，按测试文件启用环境开关。Fork 新增用例见 `test/ui/difficulty-level.e2e.test.js` 和 `test/ui/relics.e2e.test.js`。

代码主要分布在 `server/`（大厅、对局与共用战斗模拟）、`shared/`（协议、难度与藏品定义）、`public/`（浏览器客户端）。素材工具在 `tools/`，启动脚本在 `scripts/`。官方游戏数据通过 `npm run build-data` 生成，不要手工修改生成的数据文件；扩展定义维护在 `shared/difficulty.js` 与 `shared/relics.js`。

## 许可证

- **代码**：本项目自己编写的代码以 **GPL-3.0-or-later** 发布，全文见 [LICENSE](LICENSE)；另附一条 GPL 第 7 条的附加许可，允许与 pixi-spine 中的 Spine Runtimes 组合分发（见 [NOTICE.md](NOTICE.md)）。
- **游戏素材不在许可范围内**：《明日方舟》相关的美术、音乐、音效、文本与数据等版权归原权利人所有，不适用 GPL，使用限制见上方的[声明](#声明)和 [NOTICE.md](NOTICE.md)。
- **第三方组件**各自遵循其许可证：通过 npm 安装的库（整合包的 `node_modules` 中附带各自的许可证文件）、`tools/local-extract/aklz4.py` 的算法（BSD-3-Clause），以及字体等，清单与许可证全文见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 致谢与数据来源

- 原项目：[sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol)。感谢原作者与贡献者提供基础玩法、战斗引擎、客户端、工具及文档；本 fork 在其成果上扩展。
- 游戏数据：[Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData)。
- 素材来源：[yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource)、[fexli/ArknightsResource](https://github.com/fexli/ArknightsResource)、[isHarryh/Ark-Models](https://github.com/isHarryh/Ark-Models)、[ArknightsAssets/ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2)；字体来自 [TimWangZi/The-font-of-Arknights](https://github.com/TimWangZi/The-font-of-Arknights) 与 Google Fonts（Noto Sans SC）。详见 [docs/ASSETS.md](docs/ASSETS.md)。
- 规则核对参考：[PRTS 明日方舟中文 Wiki](https://prts.wiki/)。
- LZ4AK 解包：`tools/local-extract/aklz4.py` 的算法来自 [isHarryh/Ark-Unpacker](https://github.com/isHarryh/Ark-Unpacker)（BSD-3-Clause，经 MooncellWiki/UnityPy）；解析 Unity 资源使用 [UnityPy](https://github.com/K0lb3/UnityPy)（MIT）。
- 库：[PixiJS](https://pixijs.com/)（MIT）、[pixi-spine](https://github.com/pixijs/spine)（MIT；其中包含的 Spine Runtime 另受 [Spine Runtimes License](https://esotericsoftware.com/spine-runtimes-license) 约束）、[three.js](https://threejs.org/)（MIT）、[Preact](https://preactjs.com/) + [htm](https://github.com/developit/htm)（MIT）、[ws](https://github.com/websockets/ws)（MIT）。

感谢以上项目的作者与维护者，以及鹰角网络带来的这款游戏。

## 贡献

欢迎提 Issue 反馈 bug、与官方规则不一致的地方或改进建议，也欢迎提交 Pull Request：

- 提交前请运行 `node --test`，并同步更新相关文档；文档使用简体中文，代码与注释使用英文。
- 提交的代码将以 GPL-3.0-or-later 发布。
- 请不要提交任何游戏素材文件（`public/assets/` 等目录已被 `.gitignore` 排除）。
- 本项目坚持非商业：请不要提交广告、付费、打赏等任何形式的变现功能。

---

## English

**Stronghold-Protocol-dlc** is an unofficial gameplay-expansion fork of [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol), based on upstream 0.1.1. It adds 43 match-scoped collectibles, comeback rewards and a next-round shield after three consecutive leaking rounds, cumulative Ascension levels 0–20, and two extra operator offers from round 9. Collectibles and the shop expansion also apply to the four base difficulties. DLC is this fork's label, not an official Arknights release.

- **Run:** clone this fork, install Node.js 22 or 24, then run `npm install`, `npm run setup` and `npm start`. Open [http://localhost:3000](http://localhost:3000). Upstream bundles do not include this fork's extensions.
- **Rules:** see [PLAYING.md](docs/PLAYING.md) and [COLLECTIBLES.md](docs/COLLECTIBLES.md); hosting details are in [DEPLOY.md](docs/DEPLOY.md).
- **Disclaimer:** not affiliated with or endorsed by Hypergryph or Yostar. All Arknights names, art, audio, text and data are © their respective owners and are **not** covered by this project's GPL licence. For study and personal non-commercial use only — no selling, paid distribution, paid servers or monetisation of any kind. Content will be removed on request of the rights holders. Provided "as is", without warranty.
- **License:** code GPL-3.0-or-later ([LICENSE](LICENSE)); game assets excluded.
