# 上游 0.3.3 热修复同步（2026-10-25）

在完成 [0.3.2 合并](UPSTREAM-0.3.2.md) 后，再次抓取发现上游发布 0.3.3，追加同步至 `f07b8965`，共六个提交。

## 集成范围

- 商店私有视图带上实际槽位布局。空装备格始终留在装备区；装备尚未开放时不显示已购买。保留 DLC 的第 1／4／9 回合额外干员格与刮刮票入口；第一期装备仍在 5 级开放，第二期上半仍在 1 级开放。
- 第一期上／下半满整备区也允许与场上干员互换，采用上游维护者明确决定的偏差，见 `docs/history/0.3.3.md` §36.2；其他容量检查保留。
- 装备贴图缓存按图片地址区分，补位与自选渲染缓存跟随数据／资源版本变化；保留淬毒匕首的模型反馈。

## 黄金结果

默认版本完整语料仍为 291 个场景。三个历史版本继续使用上游的场景清单；其完整对局采用本 fork 已存在的收藏品、分阶段商店、刮刮票与结算机制，因此对局预期结果按合并代码重新生成，不能直接沿用未启用 DLC 的上游 matches 摘要。

上游自身移动的两个历史对局是 `act1autochess/coop4-FUNNY-6` 与 `act1autochess@V1_1/solo-HARD-9-boosted`，因新允许的整备区交换改变机器人编队，详见上游 §36.2。下列 DLC 变化另行逐项列出。

### act1autochess（16/16 个完整对局）

`solo-FUNNY-1`、`solo-FUNNY-2`、`solo-NORMAL-1`、`solo-NORMAL-2`、`solo-HARD-1`、`solo-HARD-2`、`coop2-NORMAL-3`、`coop2-HARD-4`、`coop4-FUNNY-6`、`coop2-NORMAL-8-serverrun`、`solo-HARD-9-boosted`、`coop2-NORMAL-14-standins`、`coop2-NORMAL-70-diy`、`coop2-NORMAL-1-coverage-standins`、`coop2-NORMAL-5-coverage-diy`、`coop2-NORMAL-1-unowned-roster`。

共同原因：DLC 初始及回合扩展的商店格数、作战收藏品候选与领取、刮刮票收益影响随机流、编队、后续伤害、生命与结算。第一期另含上述上游主动允许满整备区交换的变更。场景清单及种子均保留。

### act1autochess-v1_1（16/16 个完整对局）

`solo-FUNNY-1`、`solo-FUNNY-2`、`solo-NORMAL-1`、`solo-NORMAL-2`、`solo-HARD-1`、`solo-HARD-2`、`coop2-NORMAL-3`、`coop2-HARD-4`、`coop4-FUNNY-6`、`coop2-NORMAL-8-serverrun`、`solo-HARD-9-boosted`、`coop2-NORMAL-14-standins`、`coop2-NORMAL-70-diy`、`coop2-NORMAL-1-coverage-standins`、`coop2-NORMAL-5-coverage-diy`、`coop2-NORMAL-1-unowned-roster`。

共同原因：DLC 初始及回合扩展的商店格数、作战收藏品候选与领取、刮刮票收益影响随机流、编队、后续伤害、生命与结算。第一期另含上述上游主动允许满整备区交换的变更。场景清单及种子均保留。

### act2autochess-v2_1（16/16 个完整对局）

`solo-FUNNY-1`、`solo-FUNNY-2`、`solo-NORMAL-1`、`solo-NORMAL-2`、`solo-HARD-1`、`solo-HARD-2`、`coop2-NORMAL-3`、`coop2-HARD-4`、`coop4-FUNNY-6`、`coop2-NORMAL-8-serverrun`、`solo-HARD-9-boosted`、`coop2-NORMAL-14-standins`、`coop2-NORMAL-70-diy`、`coop2-NORMAL-1-coverage-standins`、`coop2-NORMAL-5-coverage-diy`、`coop2-NORMAL-1-unowned-roster`。

共同原因：DLC 初始及回合扩展的商店格数、作战收藏品候选与领取、刮刮票收益影响随机流、编队、后续伤害、生命与结算。场景清单及种子均保留。

## 验证

- 四个版本的完整黄金复验均通过：默认版本 291、第一期上半 220、第一期下半 218、第二期上半 269，共 998 个场景。默认版本在这次热修复中没有移动黄金结果。
- 热修复定向检查：90 通过、7 跳过、0 失败；DLC 与历史版本兼容检查：55 通过、0 失败。
- setup、smoke、guards、lint、imports、typecheck 全部通过；保留仓库已有 lint 警告。
- Chrome 满整备区交换的四个版本、两种渲染方式均通过；三个版本的装备栏实际购买均通过；公开房间完整套件 6 项通过。
- 跨版本图标的 3 项 Chrome 检查通过，包含大厅切换、房内投票、购买、装备、结算与刷新重连；测试等待版本控件挂载后再读取，避免登录后首帧的竞态。
- 文档一致性与路径检查：32 通过；四个语言包各 2770 条，0 缺失、0 错误。
- 完整测试首轮及修复后的 19 个失败文件复验结果见 [0.3.2 合并记录](UPSTREAM-0.3.2.md#兼容性与验证)。分次复验未记作一次完整全绿运行。
