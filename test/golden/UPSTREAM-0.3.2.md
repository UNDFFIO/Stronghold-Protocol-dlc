# 上游 0.3.2 同步（2026-10-25）

上游：`sganggs/Stronghold-Protocol`，提交 `5def2977`（0.3.2）；同步前 fork：`87c1eba8`。

保留收藏品、超限 0–20 级、分阶段商店、刮刮票、复活与时间机器、伤害排行、公开密码房及调试面板。接入上游历史版本、AI、伤害结算、状态增量和新版界面。

## 黄金结果

默认版本重算 290 个场景，279 个场景相对同步前发生变化。五个纯战斗家族与上游 0.3.2 的黄金结果逐场景一致；23 个 matches 场景保留 DLC 奖励、商店和经济差异。所有已有种子保留。

变化来自上游伤判顺序与穿透修正、无来源伤害归属、技能与首领攻击节奏、淤困位移、AI 招募和编队、奖励发放时点及隐秘核心重新配对。来源及原始假设见上游 `docs/history/0.3.2.md` 与其链接的修订记录。

### roster（49/49）

`roster-001`、`roster-002`、`roster-003`、`roster-004`、`roster-005`、`roster-006`、`roster-007`、`roster-008`、`roster-009`、`roster-010`、`roster-011`、`roster-012`、`roster-013`、`roster-014`、`roster-015`、`roster-016`、`roster-017`、`roster-018`、`roster-019`、`roster-020`、`roster-021`、`roster-022`、`roster-023`、`roster-024`、`roster-025`、`roster-026`、`roster-027`、`roster-028`、`roster-029`、`roster-030`、`roster-031`、`roster-032`、`roster-033`、`roster-034`、`roster-035`、`roster-036`、`roster-037`、`roster-038`、`roster-039`、`roster-040`、`roster-041`、`roster-042`、`roster-043`、`roster-044`、`roster-045`、`roster-046`、`roster-047`、`roster-048`、`roster-049`。

### bonds（46/46）

`bond-arcaneShip-low`、`bond-arcaneShip-high`、`bond-deputShip-low`、`bond-deputShip-high`、`bond-egirShip-low`、`bond-egirShip-high`、`bond-emptyShip-low`、`bond-emptyShip-high`、`bond-indomShip-low`、`bond-indomShip-high`、`bond-investShip-low`、`bond-investShip-high`、`bond-kazimierzShip-low`、`bond-kazimierzShip-high`、`bond-kjeragShip-low`、`bond-kjeragShip-high`、`bond-lateranoShip-low`、`bond-lateranoShip-high`、`bond-maniShip-low`、`bond-maniShip-high`、`bond-miraShip-low`、`bond-miraShip-high`、`bond-preciShip-low`、`bond-preciShip-high`、`bond-raidShip-low`、`bond-raidShip-high`、`bond-sargonShip-low`、`bond-sargonShip-high`、`bond-siracusaShip-low`、`bond-siracusaShip-high`、`bond-skillfulShip-low`、`bond-skillfulShip-high`、`bond-soloShip-low`、`bond-soloShip-high`、`bond-steadShip-low`、`bond-steadShip-high`、`bond-suntShip-low`、`bond-suntShip-high`、`bond-swiftShip-low`、`bond-swiftShip-high`、`bond-victoriaShip-low`、`bond-victoriaShip-high`、`bond-visiShip-low`、`bond-visiShip-high`、`bond-yanShip-low`、`bond-yanShip-high`。

### fields（22/22）

`boss-boss_1-pair`、`boss-boss_1-solo`、`boss-boss_2-pair`、`boss-boss_2-solo`、`boss-boss_3-pair`、`boss-boss_3-solo`、`boss-boss_4-pair`、`boss-boss_4-solo`、`boss-boss_5-pair`、`boss-boss_5-solo`、`boss-boss_6-pair`、`boss-boss_6-solo`、`boss-boss_7-pair`、`boss-boss_7-solo`、`hidden-boss_8-pair`、`hidden-boss_8-solo`、`hidden-boss_9-pair`、`hidden-boss_9-solo`、`hidden-boss_10-pair`、`hidden-boss_10-solo`、`unite-1`、`unite-2`。

### matches（23/23）

`solo-FUNNY-1`、`solo-FUNNY-2`、`solo-NORMAL-1`、`solo-NORMAL-2`、`solo-HARD-1`、`solo-HARD-2`、`solo-ABYSS-1`、`solo-ABYSS-2`、`coop2-NORMAL-3`、`coop2-HARD-4`、`coop3-ABYSS-5`、`coop4-FUNNY-6`、`coop4-ABYSS-7`、`coop2-NORMAL-8-serverrun`、`solo-HARD-9-boosted`、`coop2-ABYSS-10-boosted`、`coop2-NORMAL-14-standins`、`coop2-NORMAL-70-diy`、`coop2-NORMAL-1-coverage-standins`、`coop2-NORMAL-5-coverage-diy`、`coop2-NORMAL-68-coverage-diy`、`coop2-NORMAL-24-coverage-diy`、`coop2-NORMAL-1-unowned-roster`。

### standins（10/10）

`standin-01`、`standin-02`、`standin-03`、`standin-04`、`standin-05`、`standin-06`、`standin-07`、`standin-08`、`standin-09`、`standin-10`。

### diy（129/140）

`diy-001`、`diy-002`、`diy-004`、`diy-005`、`diy-006`、`diy-007`、`diy-008`、`diy-009`、`diy-010`、`diy-011`、`diy-013`、`diy-014`、`diy-015`、`diy-016`、`diy-017`、`diy-018`、`diy-019`、`diy-020`、`diy-021`、`diy-022`、`diy-024`、`diy-025`、`diy-026`、`diy-027`、`diy-029`、`diy-030`、`diy-031`、`diy-032`、`diy-033`、`diy-034`、`diy-035`、`diy-036`、`diy-037`、`diy-038`、`diy-039`、`diy-040`、`diy-041`、`diy-042`、`diy-043`、`diy-044`、`diy-045`、`diy-046`、`diy-047`、`diy-048`、`diy-049`、`diy-050`、`diy-051`、`diy-052`、`diy-053`、`diy-054`、`diy-055`、`diy-056`、`diy-057`、`diy-058`、`diy-059`、`diy-060`、`diy-061`、`diy-063`、`diy-064`、`diy-065`、`diy-066`、`diy-068`、`diy-069`、`diy-070`、`diy-071`、`diy-072`、`diy-073`、`diy-074`、`diy-075`、`diy-076`、`diy-077`、`diy-078`、`diy-079`、`diy-080`、`diy-081`、`diy-082`、`diy-083`、`diy-084`、`diy-086`、`diy-087`、`diy-088`、`diy-089`、`diy-090`、`diy-091`、`diy-092`、`diy-093`、`diy-094`、`diy-095`、`diy-096`、`diy-097`、`diy-098`、`diy-099`、`diy-100`、`diy-101`、`diy-102`、`diy-103`、`diy-104`、`diy-105`、`diy-106`、`diy-107`、`diy-108`、`diy-109`、`diy-110`、`diy-111`、`diy-114`、`diy-115`、`diy-116`、`diy-117`、`diy-118`、`diy-119`、`diy-120`、`diy-121`、`diy-123`、`diy-124`、`diy-125`、`diy-126`、`diy-127`、`diy-128`、`diy-129`、`diy-130`、`diy-131`、`diy-132`、`diy-134`、`diy-135`、`diy-136`、`diy-137`、`diy-138`、`diy-139`、`diy-140`。


## 新增 DIY 覆盖

保留旧种子 24 的结果，新增 `coop2-NORMAL-6-coverage-diy` 并加入快速集。新版 AI 在第 8–10 回合部署普通推进之王，第 11–13 回合部署精锐推进之王；覆盖商店抽卡、部署、普通与精锐槽位映射和完整战斗。默认版本现在共 291 个场景（matches 24 个）。历史版本场景清单保持上游状态。

## 兼容性与验证

默认房间快照重新生成，仅增加 fork 原有的 `difficultyLevel`、`isPublic`、`hasPassword` 字段；欢迎版本列表与哈希公式不变。DLC 的两个旧 DIY 补充种子仅留在默认版本，历史版本沿用上游语料。连接重请求额度保持每秒 2 次、突发 8 次，覆盖启动偏好同步与公开列表订阅；回归样例同步此额度。

- `npm run golden -- --jobs 2`：六个家族 291 个场景全部匹配。
- DLC 定向回归与文档检查：361 通过、0 失败。
- 完整低并发测试首轮：10577 项，10441 通过、29 失败、107 跳过；修复后从原日志提取全部 19 个失败文件复验：252 通过、0 失败。保留首轮日志，未将分次复验记为一次完整全绿。
- setup、smoke、guards、lint、imports、typecheck 全部通过；lint 保留仓库已有警告。
- 四个语言包：各 2770 条，0 缺失、0 错误。
- Chrome 分项检查通过超限轮盘与队友同步、公开密码房与测试确认、断线重连、滚轮与触屏、刮刮票及收藏品调试；资源和 Windows ZIP 回退检查通过。

本机 `python3` 原指向 Windows 商店占位程序；复验在忽略的任务缓存中以真实 Python 3.12 提供同名入口。公开资源只补齐缺失文件，本地可选 Spine 按当前提取器刷新；游戏美术仍在忽略目录中。
