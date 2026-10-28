# DESIGN §6, §16 — The match and meta engine (server/match), operator loadouts

Part of [DESIGN.md](../DESIGN.md) (the index; section numbers are global).

**DLC 四叶草化石（2026-10-24，维护者决定）：** No.195 为 II 精良收藏品，合法领取后仅为持有者战后实际损血不超过 5 的奖励增加一个候选（三选一变四选一），每次仍只领取一件。重复 ID 不叠加，候选不足时用热水壶补满，超限补给直接发放数量不变。见 [COLLECTIBLES.md](../COLLECTIBLES.md)。

## 6. Match & meta (server/match)

DLC Ascension protocols are cumulative and defined in `shared/difficulty.js`. Level 2, Death Embers, leaves a
5-second hazard at each killed ordinary enemy's position. In round n, radius is `1 + n * 0.2` tiles and
each one-second Arts pulse deals `min(50, 10 + max(0, n - 8) * 10)` percent of that enemy's base ATK:
10% through round 8, 20% in round 9, 30% in round 10, 40% in round 11, capped at 50% from round 12.
Separate embers stack independently; the cap applies to each ember, not their combined damage. Higher levels inherit it.
The picker describes growing radius and damage without the formula (maintainer-requested DLC balance change;
supersedes §29.18).
Level 10, Rotating Armor, reduces either Physical or Arts damage taken by all enemies by 10%, alternating every
12 game seconds on the shared battle clock, starting with Physical. Late spawns inherit the current phase;
levels 11–20 inherit the rule (§29.19).
Level 15, Overload Aftermath, replaces the skill-end SP lock with a 10-game-second ATK reduction on the
operator whose skill ended: 8% per stack through round 10, 15% from round 11, stacking up to twice (16% / 30%).
Levels 16–20 inherit it. Death endings, dead operators, enemies and summons do not trigger it; SP recovery is
unchanged. [ASSUMED] Stacks use additive `atkPct` and every repeat trigger refreshes all stacks to 10 seconds,
including at the two-stack cap (maintainer-requested DLC adjustment, §29.22).
Level 19, Stealth Run, grants ordinary ground enemies Invisibility within 2 tiles of the goal, but excludes
currently unblockable enemies (including levitated, feared or sleeping enemies, matching the blocking checks).
If an affected enemy becomes unblockable, only this protocol's Invisibility is removed; it can qualify again
once blockable. Level 20 inherits this exclusion. The main effect text stays unchanged; the hover detail
explains the exclusion and that blocking removes Invisibility (maintainer-requested DLC adjustment, §29.21).
Level 20, Ultimate Synergy, replaces damage-triggered debuff shortening with DEF and RES growth while an
enemy is controlled: +10% per accumulated second, capped at +300% (4x), with final RES capped at 100.
Leaders (`isBoss`, `bossPool` or `BOSS` rank) are exempt; this exemption is omitted from player-facing text.
[ASSUMED] Control follows `RESIST_STATUSES` plus 麻痹, consistent with the cleanse/immunity protocols.
Only successful, active controls count; overlaps count once. Full seconds grant additive 10-percentage-point
steps, partial seconds and gains remain across control gaps, and idle time never increases stats. Ordinary
stat debuffs and enemy self-binding do not count. This deliberate DLC adjustment supersedes §29.20 (§34.35).

### 6.1 State machine (Match.js)

```
LOBBY(room) → INFO_CHECK (co-op 25 s; solo and any single-human match untimed (§18.2); all ready ⇒ skip; the operator loadout (§16) locks when it ends) → BAND_DRAFT (co-op: random order — the room option 「AI 队友最后选择」 (host, off by default; `room.setAiPicksLast`) puts every human seat before every AI seat, each group keeping the drawn order, and draws no extra random number; a skipping human goes behind the other humans still to pick and ahead of the AI seats, or to the very end when no other human remains [ASSUMED] —, ONE countdown — `BAND_TURN_SECONDS` 50 s per turn = m.public.deadline, AI seats pick at once, 1 skip each, a strategy a teammate already took is refused (队友已选), timeout ⇒ the strategy the player highlights (`g.bandFocus`) while free, else band_bldsk, else the first free one; solo: free pick, no timer, no skip; a single human: untimed) → BATTLE_CHECK (3 s)
→ loop r = 1..lastRound:
     ROUND_START   (income, upgrade price −1 (floor 0), temp NOT wiped — what overflowed after the last prep's deadline is shown in this
                    prep (§6.2 temp overflow), unfrozen shop slots rerolled, frozen kept; a strategy's 「进入休整期时」 grants and the
                    traits' <进入休整期时> effects wait for PREP, DESIGN §35.24 / §35.53)
     [SP_DRAFT]    (if r ∈ spRounds: 机变 draft; co-op: random order (「AI 队友最后选择」, off by default: humans first, the same partition as the strategy draft), 30 s first picker / 16 s others; solo 3 cards; solo / single human untimed;
                    a card is picked with two taps, §18.2)
     PREP          (onPrepStart: the strategies' 「进入休整期时」 grants — 老鲤, 松桐, 杜宾, 娜仁图亚, the preparation_start_* keys —
                    and the traits' <进入休整期时> effects (META.md §2.3), after the 机变 draft, GitHub #851, DESIGN §35.24 /
                    §35.53; co-op: timer from config, ends when all alive humans+bots ready;
                    solo / single human: untimed, ends on ready)
     PREP_END      (<休整期结束时> effects; unfrozen shop cleared; Ready is blocked while a personal choice or temp overflow is pending;
                    at the deadline personal choices are auto-picked first, then
                    the temp pieces due at this prep are resolved (chess sold back, items destroyed, summon stacks removed — they come back at the next round start, §20.1) — pieces that arrived
                    after Ready or during the <休整期结束时> effects wait for the next prep (§6.2 tempDue))
     COMBAT        (one Battle per alive player, all in parallel, 2×; watchers get snapshots; solo: pausable, §14 Solo pause)
     UNITE         (co-op only, if ≥1 leaked & ≥1 perfect: ≤2 perfect helpers in `unite.js helperOrder` order (research 08 §5 / PRTS 帮助:
                    most units on the field > an active bond > most standing units > seat; the pair ordered by units > active bond >
                    Σ active layers > standing > seat, the first one on the right-hand field) fight the union of leaks; no layer gains — with
                    the layers their own combat reached (the round's pending gains, PRTS "以其阵地当前的状态" [ASSUMED]);
                    a helper's operator knocked out at the end of its own combat enters down — carryState { down: true },
                    PRTS "上一阶段为退场状态的干员强制退场", its full redeploy timer — confirmed by the user (§19.3))
     SETTLE        (LP −min(leaks,10) per player (unite survivors to their source); eliminations; layer gains applied; coins; broadcast;
                    after a 联防 the outcome and every player's charge ride the SETTLE m.public as `uniteResult`, GitHub #235)
   R14 FINAL_ASSAULT (merged team LP; random pairs fixed for this match; shared boss pool; 120 real s countdown, no hard stop; overtime −1 team LP per
                    real s after 120 real s, or 150 with an AI teammate at fight start (§29.1, m.public.overtimeAt); no layer gains; team LP 0 ⇒ defeat at once (PRTS 直接失败),
                    pool 0 ⇒ victory — the first end the server registers decides, §20.5)
   R15 HIDDEN_CORE  (if difficulty ≥ NORMAL and Σ activated layers > 350 solo / 1200 co-op and team LP > 1 — GitHub #645)
→ RESULT (per-player stats, titles, rounds passed, victory/defeat)
```
Solo FUNNY has 9 rounds (boss at R9); everything is read from `data/config.json → modes[modeId]`.

Shop layouts are version-specific (`config.modes[modeId].shopSlots`, official
`activity.AUTOCHESS_SEASON[season].shopLevelDataDict[modeId][level].charChessCount` / `itemCount`). Both 第一期
builds have no equipment slot at levels 1–4 and one at 5–6; 第二期上半 and the default have one at 1–6 in every
lobby mode. Training, which the lobby does not offer, has one only at 5–6 in every version. An upgrade opens
new slots empty; refresh / the next round fills them. The private shop view includes its actual `{ chess, item }`
layout so an empty equipment slot stays in the equipment column. A mode with zero equipment slots shows no sold
equipment placeholder. Verification and sources: [§36.1](../history/0.3.3.md).

A first-season solo (`config.version.rules.soloTimed`, DESIGN §35.22.7) is not `soloUntimed` unless the room's
「不限时」 is on (`room.setSoloUnlimited`, default off; `room.state` omits `soloUnlimited` unless true; the match is built
with `opts.soloUnlimited`, DESIGN §35.23.10). While it is off, INFO_CHECK, the strategy draft, 机变 and preparation use
their clocks (preparation 300 s, 机变 150 s; the other two use the co-op lengths, because they read `soloUntimed`). A
co-op match with one human stays untimed. A second-season solo stays untimed.

P1b plugin modes inherit an official mode and may override economy and other global configuration field by field in `GameData` (DESIGN §32.5). Original modes retain the same values and behavior; room mode selection belongs to P1c.

### 6.2 Player state (PlayerState.js) — authoritative per player

```js
{ playerId, seat, name, isBot, connected,
  alive, lp, bandId,
  funds, shop: { level, upgradePrice, slots: [ Slot ], frozen: bool, freeRefreshes: n, rewardOffer: null | { tier, source:'merge'|'special', label, queued, slots:[Slot] } },  // a special offer (凯瑟琳's 定向投放 …) by its source's label; queued = offers behind the shown one (§21.2)
  hand: [ Piece|null ×10 ], temp: [ Piece|null ×5, ...queuedPieces ],
  board: Map<'r,c', Piece>,                          // chess & token pieces on the normal field
  bonds: { [bondId]: { count, active, tier, layers } },  // layers persist all match
  effects: [ EffectRef ],                             // band/choice/team/garrison persistent effects & counters
  personalChoice: null | { id, round, sourceItemId, cards: [ BountyCard ] }, // private PREP offer; raw cards on the server
  counters: { refreshes, buys, sells, … },
  stats: { … for results } }
Slot  = { kind:'chess'|'item', id, price, sold:false, frozen }
Piece = { uid, kind:'chess'|'item'|'token', id /* chessId (golden id if elite) | itemId | tokenId */,
          items:[itemPiece...] (chess only, max 2), count (token stacks), ownerUid (tokens), boughtRound,
          meta: { round?: { r, n: { key: count } } } }   // per-piece counters of the current round, module-prefixed keys (拉普兰德's first refresh, §21.1)
```

Intent handlers (validate → mutate → recompute bonds → push private view): `buy(slot)`, `refresh()`, `freeze()`, `levelUp()`, `sell(uid)`, `move(uid, to)`, `equip(itemUid, targetUid, replaceUid?)`, `useArt(itemUid, row, col)`, `destroy(uid)`, `pickReward(idx)`, `pickChoice(idx)`, `setReady(bool)`. Every handler rejects when the phase forbids it (only PREP allows board/shop mutations; SP_DRAFT allows `pickChoice` only; reward pick allowed in PREP). Invalid intents return `error` with a code from `shared/constants.js → ERR` — the server never throws on bad input.

在所有官方版本的未就绪 PREP，干员手牌↔场上互换复用原有两个位置；休整区满或部署数达到上限均不阻止
合法互换，两个方向相同。手牌内、场上内互换同理；地形／召唤物合法性仍逐个检查。真正新增部署仍检查
部署上限，普通撤退仍需要手牌空位；满手牌仍拒绝购买和奖励选择，包括可立即合成的第三张。
**有意偏差（INTENTIONAL DEVIATION）：**官方第一期上／下半不允许满整备区互换，第二期才加入
（[官方公告 5114](https://ak.hypergryph.com/news/5114)）。维护者在 2026-10-25 阅知该证据后，明确决定
「第一期也允许互换」，因此取代 0.3.2 的第一期限制，作为四版本共用的便利功能保留
（[§36.2](../history/0.3.3.md#362-满休整区互换回归round53-benchswap2026-10-25)）。

Summons (§20.1): an operator on the board sends its manually deployable summons to the hand — deploy-limit copies in one stack, no deploy slot (tokens.json `placeable`, `gamedata.placeableTokens`); moving or swapping it sends its placed summons back to their stack, withdrawing or selling it removes them. A range-bound summon (tokens.json `ownerRange`: 狼群, 流形) goes only on a tile of its owner's attack range (`PlayerState._legal` / `summonRange`); in a swap each piece is checked from the tile it ends on; an in-place re-orientation or promotion that leaves it outside sends it back to its stack with a toast (one still inside stays [ASSUMED], user-confirmed 2026-10-03), and a re-orientation whose lifted summon would have no room is refused with `HAND_FULL`; on the other paths it leaves the board and joins the expandable temp queue (§32.14.21).

Equipment (research 04 §2 + addendum, 09 §1.2): 2 slots per chess; a third item on a full carrier replaces the equipped item `replaceUid` names (the replace dialog's pick, official `UseEquipUp.unloadInstId`; absent ⇒ the oldest; a uid not equipped on the target ⇒ `BAD_TARGET`, nothing changes) and the replaced item is destroyed. A consume-on-equip item (盟约之币, 博士投影 …) on a full carrier replaces the same way before it resolves, so the carrier is left with a free slot (the normal 博士投影 takes it until the next round start); a target its effect refuses (博士投影 on an elite) keeps both items — PRTS 卫戍协议/帮助 "达到上限强行佩戴会改为替换装备" names no exception (GitHub #263; the client opens the replace dialog for it, `equipReplaces`). Equipped items are otherwise **locked**: `destroy` (销毁) accepts hand / temp items only (`BAD_TARGET 'equipped items are locked'`); equipment goes back to the hand only when its carrier merges, is sold, or is destroyed by 突变细胞's transformation (the cell itself returns too; PRTS 帮助 "在失去该干员（干员出售、销毁、合并等）…时自动卸除", §21.1) — sales retain all returned equipment in the expandable temp queue; returned equipment is stowed before the operator a transformation gains and before a merge elite's summon cards, and every path that hands the player an item — returned equipment included — ends with the auto-merge, so no player holds two identical mergeable normal items (§21.7).

Economy/shop/pool/merge/hand rules: exactly as research 00-INDEX §3–§4 (income `min(3+r,12)`; prices by tier; refresh 1; freeze toggles all, and a successful manual refresh (paid or free) cancels it — the new cards are not frozen (DESIGN §32.14.7); sell +1; items not sellable; upgrade prices per mode with −1/round; single-player pool copies 12/14/18/16/8/5 plus measured exceptions; co-op shared operators use twice those counts, while equipment has separate shared stock (DESIGN §29.8), and so does each player's private 自选 stock (8 / 5 solo, 16 / 10 co-op — §32.14.31); elite = 3 copies; odds = copy-weighted draw over unbanned visible chess with tier ≤ level; merge 3 (风丸 2) → elite onto the consumed deployed copy's tile, else to the hand (§20.11) + reward offer of 3 **different** free chess of tier `min(level+1, 6)` (copy-weighted, including the player's stocked 自选 of that tier — one shop level before the ordinary shop, §30.23; a tier short of different chess tops up from the tier below [ASSUMED], §20.6); full hand blocks every buy / reward pick, a merge-completing one too (PRTS 卫戍协议/帮助 §手牌区, GitHub #82); overflow to temp; a free hand slot pulls the temp pieces back in at once, right → left (`PlayerState._fillHandFromTemp`); temp blocks ready).

**DLC 商店扩展（维护者决定，2026-10-15）：** 所有模式、所有调度中心等级均在原始干员槽位数量上，初始增加 1 格，第 4 回合开始时再增加 1 格，第 9 回合开始时再增加 1 格；第 1–3 / 4–8 / 9 回合起分别累计额外 1 / 2 / 3 格。装备槽位不变。回合扩展时新槽位立即参与当次商店刷新，冻结干员保留原索引，冻结装备移动到全部干员槽位之后；升级扩展仍先开放空槽位，下一次刷新填充。

**DLC 鸭梨手机（维护者平衡调整）：** 合法领取时，多人模式全队累计难度降低 1 级，单人模式保持降低 2 级，最低为 0；按对局模式判定，不随真人数或存活人数变化。多名玩家领取可叠加，直接发放与选择领取使用同一逻辑；只影响之后创建的战斗，降级本局保留，新局重置为房间所选等级（COLLECTIBLES.md）。

**DLC 首领战收藏品结算：** 仅在最终攻势胜利且满足隐秘核心解锁条件、实际还有下一关时生成并等待收藏品选择；无后续关卡或隐秘核心结束（无论胜败）均保留结算展示延时后进入最终结果，不生成候选，也不为 AI 自动领取终局藏品。

**DLC / upstream 0.3.0 compatibility:** gameplay-plugin match hosts forward the selected `difficultyLevel` to the match and its BattleSpecs; bot rehearsal specs carry it as well. Detached normal-field previews use the same collectible-redistributed wave as live combat without consuming the match RNG. The upstream expandable temp queue, persistent reward offers and doubled co-op DIY stock remain in force, including collectible grants and revival (META.md, "DLC integration with upstream 0.3.0").

**DLC 同品质同效果去重（维护者决定，2026-10-23）：** 同品质、同作用对象且机制完全相同的收藏品仅保留数值最高者。移除普通品质地形图（relic_007，防御+10%）、林间夜话（relic_009，防御+12%）和神音海螺（relic_008，最大生命+15%）；保留异铁小圆盾（防御+15%）和教堂救济餐券（最大生命+20%）。共享定义、图鉴和奖励池共用这份56件清单，旧ID不可发放且不再提供属性，旧图鉴记录按有效定义过滤。不同品质、作用对象或机制的藏品保留；品质权重、解锁回合与叠加规则不变。

**DLC 负面收藏品品质（维护者决定）：** 新增独立于 I–V 强度的“负面”品质，内部编号为 6，`normalDrop: false`，没有解锁回合。普通作战、超限补给及共用随机抽取入口一律排除该品质，显式权重也不能解锁，常规概率及现有藏品不变；指定 ID 的直接发放仍受统一领取校验。界面以红色 `!`、红色品质文字和侧边线标识，不作为 VI 档展示，也不列入掉落概率表。见 [COLLECTIBLES.md](../COLLECTIBLES.md)。

**DLC 超限补给（维护者决定，2026-10-15）：** 所有超限等级（含 0 级）在第 4 回合开始时，为每名存活且未离场玩家独立抽取并立即发放一次奖励，四类各 25%：15 金币、2 名累计层数最高盟约的随机干员、3 件不同收藏品、1 件「稀有藏品」。三件收藏品每件先按普通 5%、精良 65%、稀有 30% 抽品质，再在该品质可用藏品中均匀抽取；「稀有藏品」是奖励类别名称，优先发放 1 件传说品质收藏品；该品质耗尽时由热水壶补位并触发其回复效果。两类藏品均排除已持有与单人不适用项；某品质耗尽时按剩余合格品质归一化，除热水壶补位外，不补入指定范围外的品质；全部耗尽则用热水壶补足。三列滚轮在三件奖励时分别显示实际的三件藏品，在单件传说奖励时重复显示同一件，重复图案不增加发放数量或效果。普通作战掉落概率不变。
**Advisor economy (§35.13–§35.14).** With a nonempty advisor plan, `economy.level` is a minimum: complete
merges, meet an affordable floor before fill purchases, then resume legacy leveling. `holdLevel:true` requires
an explicit level and nonblank `economy.why`; it caps only this prep, including one-round deferrals. `keep`/`sell`
match exact forms; `buy` and bond priority stop wanting normal copies once that elite is owned. Non-carry seats
spend expiring funds on useful targets, freeze only unaffordable explicit buys or merge completions, search while
a purchase remains affordable, then bank spare operators. Opt-in `freezeSearch` also searches without purchase
funds within the prep's `maxRefreshes`, to freeze a target for next round. `items.buy` requests up to eight items.
Advisor cleanup protects elites, tier ≥4, exact keeps, targets bought this prep and active plan-bond threshold
members; sell unprotected clutter first, destroy cheap unequipped hand items second, fall back last. Incidental
unequippable items must leave two hand slots; explicit requests keep one. Carry bands retain interest behavior.
Absent/empty plans and AI takeover without an advisor retain legacy behavior (maintainer **2026-10-20**).
This is **[ASSUMED] AI policy**, not an official economy change. Bounds and sources:
[EXTERNAL_AI](../EXTERNAL_AI.md#advisor-mode-and-readable-observations-359).

**Temp overflow (临时整备区, row 8; user playtest #3 item 3).** Passive gains that find the hand full (merge elites, grants — the operator a 突变细胞 transformation gains included, §21.1 —, battle-result rewards, equipment returned by a merged / sold / transformed carrier) overflow into an expandable queue with five visible temp slots. The first five pieces fill right-to-left; later pieces wait behind them and refill freed slots in order. No passive gain is discarded for exceeding fifteen visible bench slots (owner correction, 2026-10-14, §32.14.21). Hidden pieces participate in merges, stock accounting, reconnect state and deadline resolution; Ready is refused while any is occupied (official "直到溢出情况排除才可开始进行作战"). A temp piece is resolved — a chess sold back to the pool with its summons removed, items destroyed, a summon stack removed (it comes back at the next round start, PRTS "干员所属召唤物会于下一回合返还", §20.1) — only at the deadline of the **first prep in which its player could act on it** (`PlayerState.tempDue(piece)` vs `prepsEnded`; every write into a temp slot goes through `_putTemp`, which records it): a piece that arrived during a prep before Ready is due at that prep's end; one that arrived after Ready or during the `<休整期结束时>` effects, or outside PREP (COMBAT, 联防, SETTLE — battle-result grants, a SETTLE merge's elite, returned equipment —, the next ROUND_START, 机变) is kept, visible and usable (move to a free hand slot, place, equip, use, destroy, sell) through the **next** prep. Un-readying (`setReady(false)`) makes whatever arrived while ready due at the current prep. ROUND_START no longer wipes temp (it used to destroy what SETTLE had put there before the player ever saw it). A merge's elite whose merge consumed a deployed copy takes that copy's tile and facing (§20.11); otherwise it goes to the hand, overflowing into temp (also outside PREP). `server/match/audit.js` (`tools/matchrun.mjs --check`) tracks the arrivals itself and flags any temp piece that outlives its due prep. The UI frames the row on the board with the rule (§17.5).

Pointing Stick creates at most one pending offer per alive, non-Ready player in PREP. The owner confirms it with
`g.choice { idx, choiceId }`; confirmation validates its ID, round and index, adds one bounty and clears the offer.
Ready requires no pending offer as well as an empty temp area. The co-op prep deadline resolves the offer randomly
before resolving temp and setting Ready; untimed solo / single-human prep does not schedule a separate choice timer.
The offer is recipient-private, including after reconnect, and never enters `m.public.sp` or a teammate's scout view.

### 6.3 Bonds & layers (bondsMeta.js)

- `count` = number of **distinct base chess** on the board carrying the bond (`BOARD`); `BOARD_AND_DECK` bonds also count the hand; 绝技 counts elites on board; 调和 adds +1 to each core bond count that has a real member on the board (the views mark such an entry `harmony: 1`, §21.26), etc. (research 02).
- 变形同构体: an operator wearing it together with an item that has a `giveBondId` is a member of that bond — counted like any member (BOARD: on the board only; once per operator), in the battle, and in the client's member list (tagged 同构) and bond chips (§21.11).
- `tier` from thresholds; `active = tier ≥ 1`.
- `layers[bondId]` persist all match; gains come from garrisons/bands/items/choices/bond effects; IN_BATTLE gains are collected from `BattleResult.layerGains` at SETTLE (disabled in unite/boss/hidden).
- Content plugins may attach operator-owned declarative traits (0.3.1, [§34.26](../history/0.3.1.md#3426-custom-operator-traits-671)). [ASSUMED] Gain is once per acquired copy, not merge output; deploy is hand/temp-to-board. Other prep hooks run once per owned character for its owner, elite preferred; self-sale uses the sold copy/form once, including the final copy. Forced SERVER_GAIN remains separate from acquisition and supports official retrigger/copy interactions. [ASSUMED] Fields with participating battle-layer traits and enabled gains use server simulation for authoritative settlement even with verification off; caps do not prove earned layers. Traits add unless the record explicitly overrides the operator's official mode trait; removing the plugin restores vanilla. See [PLUGIN-DSL §10](../PLUGIN-DSL.md#10-干员特质031671) for events, limits and examples.
- Layer milestones (维多利亚's 维式重锤 every 25, 远见's funds every 10 and its 80 / 150 discounts, 奇迹's funds every 100) pay only while the bond is active; those owed for layers gained while it was off pay as soon as it lights up — `PlayerState.recompute` dispatches `onActiveBonds` whenever the set of active bonds changes, so placing the third 维多利亚 member in prep grants the hammer at once (the maintainer's report of the official game, 2026-10-15; §32.14.31). Each milestone pays once, however often the bond goes off and on.
- A bond holds at most `BOND_LAYER_CAP` = 999 layers (the client's `MAX_GARRISON_STACK`, §20.12): every writer — `PlayerState.addLayers`, the SETTLE merge, `Battle.addLayers`, the dev tools — adds `layerGainRoom(before, n)` = min(n, 999 − before); a gain at the cap adds 0 and dispatches nothing (no onLayers, no `layerGain` hook, no 'layer' event), so the per-N milestones stop with the count.
- Σ activated layers (hidden-core check) = Σ layers over bonds that are active at the moment of the check (end of R14 prep, per research).

### 6.4 Prep-phase effect dispatcher (effectsMeta.js)

A registry mapping **effect keys** → handler objects `{ onRoundStart, onPrepEnd, onGain(piece), onSold(piece), onRefresh, onPrice(slot), onBuy, onMerge, onLevelUp, onBattleResult }`. Sources: garrison `SERVER_*` keys (per chess on board or hand as the key requires), band effects, item meta effects, bond meta effects (助力, 远见, 奇迹, 投资人…), choice/team cards. Content owners register handlers; the dispatcher owns ordering and the 投资人 "获得时 ×2/×3" multiplier, and only while that bond is active (标准 lists `investShip` inactive; copies of one investor are one member — §32.14.8). 娜仁图亚 见者有份 draws `pool_equip_narant` with no tier cap: every shop-eligible equip, uniform [ASSUMED] (§32.14.8). `onBuy` = a shop purchase (`g.buy`) only: a free pick or a grant never counts as 购买 (休露丝, 玛恩纳, 升华, 整备; §21.21). Equipped items run from a snapshot — the owned chess and each holder's items as that step begins (every [holder, item] pair, taken before the first item runs) — each only while it is still equipped on its still-owned holder (handlers move and destroy pieces: 突变细胞, 博士投影; §21.25).

凯瑟琳 定向投放 draws three distinct items and grants one on each 调度中心 upgrade (official
`activity_table.json`, `act2autochess.effectBuffInfoDataDict.aceffect_band_26`: `up_shop_add_special_goods`,
`count: 3`, `choice: 1`, `pool: pool_equip_kathe`). Its pool is every shop-eligible item plus 突变细胞 at any level
(#631; uniform [ASSUMED]). It grants 突变细胞 at most once per match per player — **maintainer decision 2026-10-17
(official play memory)**, #677 / §34.22; the official table names the pool without exposing a cell count.
The match-long player counter `band:cathy:cellTaken` is set only on a successful pick from a `band:band_cathy`
item offer. Later offers exclude the cell, keeping their choices distinct. [ASSUMED] “Given” means taken, so a cell
shown but declined or a refused pick leaves the allowance available. 昆图斯's separate R3 cell grant
(`aceffect_band_41`) neither uses nor checks this allowance [ASSUMED source independence]. [ASSUMED] Taking the cell
also removes it from already queued Cathy offers without rerolling their other choices; empty offers are dropped.
The state survives round changes, item destruction, reconnects and test-console strategy switches; bots and test
replays use the same player methods.
Strategies inheriting Cathy through `effectRef` resolve their behaviour with `bandEffectId` (the content inheritance
contract, §32.5), tag offers with the same `band:band_cathy` source, and share this player counter with Cathy.
[ASSUMED] Once the allowance is used, filter the cell out before drawing and sample eligible items without replacement
until the requested count is reached or candidates are exhausted; no retry budget may shorten a fresh filtered offer.
This filtering includes pool `also` items and respects shared stock and explicit pool weights. Queued offers still
only lose their cell, as described above.

### 6.5 Waves (waves.js)

Per match: pick stage (weighted among the mode's `config.modes[m].stages`, weight 50 each: 标准 FUNNY = 战场#01 `act1autochess_m01` only, 险境 NORMAL = 8 stages, 绝境 / 终极 = 7 without 战场#01 — `waves.js setupMatchWaves`, `test/match/stagepick.test.js`), 3 of 6 typed enemy factions, disabled bond set (3 core + 4 add-on for NORMAL+, per research), boss (weighted), hidden boss. Per round: wave template (by mode & round) → replace placeholders per research 05 §3.2 algorithm → apply stat multipliers (research 00-INDEX §5 `atk ×base×1.1^k`, `hp ×base×1.2^k`, ABYSS speed ×1.15 from R3) → `SpawnSpec[]` + routes resolved on the stage. *(Superseded by the official generator — §14 "Corrections from research 08/09" and the waves.js header.)* A player's normal battle (and the bot rehearsal) runs `withBounties(gd, round, wave, bounties, playerId)`: the bounty units inserted among their host action's own units, which are re-timed around them (client order); `previewOf` keeps one entry per action (`wave.spawns` + `bountySpawns`).

### 6.6 AI players (bot.js)

Match selects a trusted server-side implementation through `botStrategies.js`: `opts.botStrategy` (registered ID
or definition object), then `SP_BOT_STRATEGY`, then `legacy`. The registry contains the unchanged
`bot.js` adapter, the explicitly configured `external` adapter and the opt-in `ioleta`, `adaptive` and `ioleta-adaptive` strategies. `botStrategyContract.js` defines immutable strategy objects and pure registries; omitted hooks
inherit an existing strategy (legacy by default). Invalid hooks, unknown IDs and duplicate registrations fail early.
Registry additions do not reweight opening choices or consume RNG.
An unset or empty `SP_BOT_STRATEGY` uses the original bot without a programmatic override. `startServer()` validates
the environment selection before loading data or accepting connections; an unknown ID prevents startup with a
diagnostic naming the variable, rejected value, available IDs and how to restore the default.
Test input journals record the resolved strategy ID; replays use it explicitly, defaulting older records to `legacy`
independently of the replay host's environment. Prep generators and rehearsal jobs retain journalled slice counts.
The selected implementation does not change draft order or give any AI seat priority.

The selected implementation handles band/card drafts, personal bounty choices, sliced prep begin/end and benchmark
bounty estimates. Prep hooks return synchronous iterators and preserve the existing rehearsal job protocol,
including host delegation, cancellation and error cleanup. Definitions do not hold mutable per-room/player state.
This is a development interface, not a new gameplay policy or a client code/plugin loading mechanism.
See [the strategy guide](../BOT_STRATEGIES.md) for the contract, registration and testing steps.

The opt-in `ioleta` strategy applies [ASSUMED] staged Russell procurement to Russell seats and legacy prep to other
bands. Its seat-local plan, core-merge/reward ordering and affordable search rules are recorded in
[§35.83](../history/0.3.2.md#3583-optional-bot-strategies-pr-742-lidong1793). Placement candidates remain independently selectable.

Maintainer decision 2026-10-17, requested 2026-10-19 (§35.8): `external`, a strategy of @HankDUMPLINGZhong's
#673 framework (§35.7), sends the seat's existing public/private views to operator-configured HTTP(S) or stdio,
accepts human intents through the same schema and semantic validators, and falls back to legacy on failure.
Requests run asynchronously within existing phase timers; default selection and golden results stay unchanged.
[ASSUMED] Engineering policy: version `sp-ai/1`, 1000 ms total decision/request cap, half the remaining phase
reserved for fallback, 64 intents, 64 KiB response, 3 consecutive failures to match-long legacy for that seat,
1000 ms child restart backoff; limits configurable. One stdio child per match, no HTTP redirects, no client-set
endpoint/command, gameplay actions only. Test journals record replies/failures; offline replay performs no IO.
The complete policy and scope are in [External AI API](../EXTERNAL_AI.md).
Maintainer decision 2026-10-23 (§35.66): a release package does not include this strategy. The zip, the update
package and the Docker image omit the host, and a packaged server ignores external-AI settings.

Maintainer request 2026-10-19 (§35.12): the example advisor's static knowledge includes a regenerable playbook
from the active data and a sourced community overlay. [ASSUMED] Per-seat scoring uses only announced
bans/enemies, public teammate boards and own progress. §35.15: the band draft returns at most eight
directions and prefers uncontended community/maintainer mains; prep collapses the same band and main into
one candidate with `subOptions`. It does not inspect remaining stock or change execution. Mechanical facts, timing
estimates, score weights and cross-version regeneration are specified in [AI strategy](../AI-STRATEGY.md).
The §35.12 follow-up requires detailed sourced play for named builds: separate freeze/redeployment recipes
check reachable core roles and distinct main thresholds, retaining current-data disagreements and substitutes.

Maintainer approval 2026-10-19 (§35.9) adds owner-selected `mode: 'plan'` beside default `direct`.
One prep plan per seat/round weights legacy procurement/lineup/placement; existing sliced rehearsal and legal
handlers execute it. Draft/card/offer plans may select an observation-local action ID. Invalid plans clear
preferences and resume ordinary legacy. [ASSUMED] Plan schema, weights and conservative action shortcuts are
specified in the API guide. An opt-in hashed static knowledge hello includes active plugin data and language
texts; observations retain raw views and add a named digest, public scouted boards and short action IDs.
No hidden stock/private opponent views are added. Journals replay plans and IDs offline. Benchmarks await real
IO before advancing virtual time and report strategy outcomes/IO metrics. The default bot and golden outcomes
remain unchanged; no official gameplay rule is altered.

After the greedy layout is complete, `planLayoutSteps` rechecks self-range guards on enemy-road tiles. An isolated
guard may move to a free legal road tile with allied damage covering both it and the preceding tile of every incoming
ground route. Different routes may have different supporting allies. The exposure score must not decrease [ASSUMED],
regardless of seat count. Supported guards and guards without such an alternative keep their positions.
These placement assumptions are tracked in [issue #315](https://github.com/sganggs/Stronghold-Protocol/issues/315).

信仰搅拌机's selected 退休前布道 (`skchr_rmixer_3`, the default) is scored and faced on that skill's own grid (both sides
and one tile farther; the record's `skills[].rangeGrid`). `attackRangeGrid` — the deploy overlay, the card and
`summonRange` — stays on the base line: the skill text is 「攻击范围扩大」 without 「被动效果：」. SPT-Y's 攻击距离 +1 does not
grow this planned grid (PRTS 备注: the skill range ignores 攻击距离). S1 and S2 keep `attackRangeGrid`. [ASSUMED] The
skill is ammo and is not up for the whole fight; the plan still uses the skill-on grid (#31, §35.106).

[ASSUMED] Blocking medics prefer legal tiles outside the enemy road, then road tiles supported by allied damage,
then any legal fallback when neither exists (#577). The supported-road test is the same as the guard repair above:
every incoming ground route needs an ally covering both the medic's tile and its preceding contact tile; different
routes may use different allies, and healing never counts as fire support. Within each preference group the existing
exposure score chooses the tile. On boss rounds the planner still places wider healing ranges first; the last
arrangement of the prep rehearses those layout variants against the already-planned boss wave (§35.64). Equal exposure
scores prefer estimated allied DPS **not already covered by a previously placed medic**, before the tile-noise tie-break.

[ASSUMED] Purchase scores within `1e-9` tie in favour of the cheaper offer; genuine score advantages still win.
Pre-emptive hand shedding only sells when the owned operator count exceeds the deploy cap. Lineup evaluation counts
BOARD_AND_DECK members withdrawn from the board only while hand slots remain, in the same order as arrangement
(withdrawals before deployments). A purchase reserves its own hand slot first; members forced to be sold do not count.

[ASSUMED] Layout rehearsals use normal battle inputs and the normal field seed, including battle-start effects,
enemy replacements, teammate effects and in-battle layer gains. A Final Assault / Hidden Core rehearsal uses the wave
`startRound` already planned, an independent seed `deriveSeed(0xA11CE, fa:round:seat)` (not the match seed and not the
live fight's seed), a fresh boss pool per candidate, the teammate's currently deployed board, and the visible
countdown on the combat clock (`bossLevelTime` real seconds × `combatTimeScale`, 240 game seconds when the data
says 120; §35.64). Counted leaks still rank first; leader damage breaks a leak tie (#315). Each candidate uses an independent copy of the current
meta RNG. Candidate boards and events are detached; preview contexts expose copied reads and no-op state writers,
including contexts reached through teammates/player. A separate dispatcher owns the preview script budget and drops
preview errors; no live script quota, diagnostics or settlement is affected. Actual starts retain the original RNG
and dispatch. Rehearsals estimate current prep state, not later prep actions or other players' random choices.
These three bot policies are tracked in [issue #315](https://github.com/sganggs/Stronghold-Protocol/issues/315);
combat blocking, healing and damage rules are unchanged.

Pending Pointing Stick offers use the existing bounty scorer at bot prep entry, immediately after a successful cast,
and before Ready. The prep's deadline — and the scheduler's fallback when a step of a bot's prep fails — randomly resolves any remaining offer before temp and Ready; a seat that left is eliminated and its offer dropped.

Deterministic-ish heuristic player used for (a) AI teammates, (b) auto-play for disconnected humans (only auto-ready + auto-picks, not shopping, unless "AI 托管" is toggled), (c) tests. Strategy (§21.6): pick a band (weighted by starting LP; never one built around a bond the mode switches off — `gd.bandBondIds`, §21.26); each prep: take offers, sell dead bench weight, fill the board, complete affordable merges, level on the curve, then buy only merge progress / lineup upgrades worth more than the refreshes their price would buy (shop odds of completing held pairs), freeze for an unaffordable third copy (坎诺特 keeps 5 funds back); build around a committed focus core bond (a teammate's main bond on its strip counts against it; bonds the mode switches off never) + a second bond; value dealers by DPS vs the round's DEF / RES (an attack on every enemy in range counts double — 阵法术师 / 轰击术师), with the range the unit is deployed with; place by the exposure model + rehearsal on the server's deploy map (no 深水区; a blocker whose range is its own tile only — range 0-1 — takes a free tile of the enemy road first; a tactician's 援军 within `PlayerState.summonRange`; a melee chess whose trait reads 「可以放置于远程位」 (钩索师 / 推击手) on a 高台 whose range covers the enemy road, else on the ground, counted as a blocker in the lineup either way — §3; `g.move` judges legality); items by effect (META §1.5: 突变细胞 on the least valuable normal single below 6阶, a cell left in temp gets a hand slot made for it, the operator its transformation gains is deployed by the next prep's lineup step like any owned unit — AI 托管 too; the buy loop's bench shed never sells a piece gained since the bot's last prep, §21.1); 机变 bounties by expected payout − expected LP loss over the offered cards; resolve temp — on a human seat under AI 托管 never by destroying an item while a bench operator can be sold for the slot —; ready. A bot's whole prep — shop decisions and layout planning (`botPrepBeginSteps`, 25–70 ms late in a 4-bot match), the layout rehearsal and `botPrepEndSteps` — runs in wall-clock slices of `botSliceMs` (8 ms) per scheduler callback on a real host (step generators that yield between whole actions, never with a transient board; the same actions in the same order, so decisions are unchanged; at once in virtual time). Under AI 托管 a human's own 自选 pieces score `DIY_PIECE_BONUS` (12) more in the shop / reward choice and the 调度中心 is levelled one round earlier for the step that opens a slotted tier (`levelUp`, `diyOpensAt`; 0.2.0 — bots field no 自选 piece).

### 6.7 Where a match runs: match hosts (§32.6, §35.23)

A room of 第二期下半 (`act2autochess`) without gameplay plugins runs its `Match` in the server process, as always. Two kinds
of rooms run it in a match host (`server/match/host/`: a child process by default, `SP_MATCH_HOST=worker` a worker
thread), whose module table holds that room's data — `server/data.js setData` before the match code is imported, so every
singleton (the kits, builtinMeta, the meta registry, the official-bounds cache) reads it:

- **plugin hosts** (`kind: 'plugins'`, §32.6): one per content set of gameplay plugins, at most `limits.maxSets` (4);
  stop reasons 'plugin-crash' / 'plugin-hang' / 'plugin-start';
- **version hosts** (`kind: 'version'`, §35.23, M1): one per enabled official version other than 第二期下半 (its `cs`,
  `server/versions.js`), at most `maxHosts` (default: one per such version; `SP_MAX_VERSION_HOSTS`), counted apart from
  the plugin hosts. Nothing set enables all four, so that cap is three (§35.23.11). A host is forked on the first match
  of that version, never at boot; an idle server has zero version workers. Log lines `[versions]` with the version's id
  as the host label; stop reasons 'version-crash' /
  'version-hang' / 'version-start' (the room is told `本局模拟出错，已结束` / `本局模拟长时间无响应，已结束` /
  `该版本的模拟无法启动`); a full pool refuses the start with `INTERNAL` 'version hosts busy'. The host installs the
  version's own official-bounds snapshot, and refuses (`failed` → 'version-start') a match whose `opts.version` (absent:
  `act2autochess`) is not its data's (`shared/versions.js versionOfData`). The lobby passes `opts.version` and
  `opts.requireCs: true` (a client b.result must name the version's `cs`; the bot layout rehearsal is never delegated to
  a browser, `match/rehearsal.js`), never `kitted`. A version room without a version host refuses to start (`INTERNAL`):
  the server process's singletons hold 第二期下半's data. `Match.version` is the registry id (null for the default); the
  test journal's `init.options.version`, `m.public` / `m.result` `version` (`views.js` / `results.js`: the page reads a
  replayed result with it), the external AI's `context.gameVersion` and the knowledge pack's `gameVersion` carry it (all
  non-default only). Both kinds: heartbeat watchdog 10 s, idle stop after 10 minutes, `diag()` (tests) reports `version` too.

---

## 16. Operator loadout: skill & module selection (v2.1, user playtest #1)

Official rule (bwiki 盟约, 更新公告 5114): before a match the player cannot change an operator's tier, but can change the **equipped skill and module** of each chess; some non-default choices are stronger. Scope in the remake (no accounts ⇒ everything the chess's status unlocks is selectable):
- **Skills:** any skill unlocked at the chess's status (`evolvePhase`: E1 ⇒ S1–S2, E2 ⇒ S1–S3) at the chess's skill level (normal Lv4, elite Lv7). Default = `defaultSkillIndex`.
- **Modules:** only matter for the elite (golden) chess (`equipLevel` 1, or 3 at T6): any module of that character (or none); default = `defaultUniEquipId`. Normal chess have no module (equipLevel 0).

**Data (`data/chess.json`, built by tools/build-data.mjs):** every chess keeps `skill` (the default, unchanged shape) and gains `skills: [SkillRecord…]` (index, skillId, iconId, name, desc/descRaw, skillType, durationType, duration, spType, spCost, initSp, maxChargeTime, bb (at the chess's skill level), bbStr, rangeGrid, trigger {rule, customRangeGrid} resolved for THAT skill index, isDefault). Golden chess gain `modules: [ModuleRecord…]` = `{ uniEquipId, name, typeName, icon, isDefault, attr: {maxHp, atk, def, res, aspd, cost, blockCnt, respawnTime…} (flat adds at the chess's equipLevel), traitOverride: {desc, descRaw, bb} | null, talentChanges: [{talentIndex, name, desc, bb}] }` plus `statsBase` (stats WITHOUT any module); `stats` stays = stats with the default module (back-compat).

**Loadout wire & state:** the client keeps a per-browser loadout `{ [baseChessId]: { skill: index, module: uniEquipId | 'none' } }` (localStorage) and sends it with C2S `room.loadout { entries }` (validated: known visible chess, legal skill index for that chess's normal AND elite status, legal module id). The lobby stores it on the seat; at match start `Match` receives `seats[].loadout`; `PlayerState` keeps it immutable for the match by default; a room with prepLoadout=prep accepts named overrides during PREP before ready (§34.15); board pieces are resolved to `{chessId, skillIndex, moduleId}` when building `PlayerBattleInput.units[]` (fields `skillIndex`, `moduleId`; BattleSpec carries them). Bots use defaults. m.private exposes the effective loadout so the UI (shop cards, detail panel) shows the chosen skill/module.

Client sync preparation may await chess/backups data. A later edit (including restoring defaults) or `welcome` invalidates the earlier preparation: its payload, missing-data result or failure cannot send or change sync status. The current edit keeps the existing debounce, close flush, ordered requests and retry/lock handling (`public/js/ui/loadoutSync.js`).

**潜能 / 练度 (0.2.2, the owner's decision of 2026-10-08: 「调配干员里自己设置吧，默认满潜满加成」):** official — an operator fights at the player's own potential (调度手册 「卫戍协议中干员潜能由自身已持有干员潜能决定」; an unowned 特许 operator at potential 1) and an owned operator of the same name gets the 自持有 练度 bonus (activity_table `cultivateEffectList`: 未精英化 +0 %, 精英1 ATK / DEF +5 %, 精英2 ATK +10 % DEF / HP +5 %, 精英2 Lv.60 +10 % each — a multiplier of its own, never summed with the 直接乘算 bonuses). The 干员调配 screen sets both per operator (by charId: initial, elite and 自选 forms share them; default 潜能 6 and 精英2 Lv.60); they travel as `room.loadout.ops` (`{ [charId]: { potential, cultivate } }`, defaults dropped; shared/protocol.js `checkLoadoutOps`, strict like the entries), `seats[].ops` → `PlayerState.ops` (re-checked; bots none = the defaults), and every operator the player owns states them in its `PlayerBattleInput` entry (`potential`, `cultivate`; shared/potential.js `cultivationOf`) — never a 补位 stand-in (a not-owned NORMAL chess) or a prototype 自选 pick. The sim composes the def at the potential (data/*.json carry every potential, DATA.md §2.3; the summons' talents at the owner's) and multiplies ATK / DEF / max HP by the tier's `char_attribute_mul` (effects.json `aceffect_char_1…4`, SIM.md §12). The cards (局内数值, shop and detail cards, a teammate's unit from UnitInfo `potential` / `cultivate`) show the numbers at the settings.

**Sim:** `simdata` resolves a unit def for `(chessId, skillIndex, moduleId)` (cached): `skill` = the selected SkillRecord; stats = `statsBase` + module attr (elite) ; trait/talents = base with the selected module's overrides. Kit contract (backward compatible): a kit function `(bb, chess) => { skill?, skills?: { [skillId]: SkillSpec }, talents, trait }` receives `chess.skill` = the **selected** skill and `bb` = its blackboard; the loader uses `skills[selectedSkillId]` if present, else `skill` only when the selected skill is the chess's default, else the **generic** skill spec — talents/trait from the kit always apply. Every visible chess must get hand-authored specs for all of its selectable skills (tracked by a coverage test).

**UI:** a 干员调配 screen reachable from the lobby, room and briefing (INFO_CHECK): the roster is one list, a row per operator with aligned columns under a head row — portrait / name / bonds, the skills and the elite's modules to tap (不装备 first; the quick choices of PR #301 by @farridge, laid out as one list instead of its three columns of cards, the owner's call of 2026-10-08), the 潜能 / 练度 selects (`screens/loadout.js RosterRow`, `screens/cultivation.js`); a click anywhere in the row that is not one of its controls picks the operator and opens the detail — the controls act on their own: a skill / module button selects the row through `quickChange` and keeps the list on a phone, a select opens its own list (`RosterRow onRowClick` → `screens/loadoutSections.js rowControlHit`, which anchors the guard to the row, so a wrapping link or button cannot swallow its clicks); the detail beside it (below 1000 px wide it slides over the list, a quick choice keeps the list) opens with the 潜能与练度 section (潜能 1–6, the four official 练度 tiers with their effect texts); the detail then shows the operator's 特质 — the in-match `GarrisonBlock` / RichText of the form its 普通 / 精锐 skill toggle shows, triggers such as 「<进入休整期时>」 kept (0.2.2, PR #301 by @farridge); filter by tier/bond/class, per chess choose skill (icon, name, SP info, desc at Lv4 and Lv7) and elite module (official type icon from the local-client art when extracted (§13), else a lettered tile; name/type, stat bonus, trait/talent changes), 恢复默认, persisted; a 局内数值 section between the skills and the modules (普通 / 精锐 toggle, 精锐 first) draws the detail card's own stats block, 特性 and 天赋 for the chosen skill / module (§22.16); the chosen skill/module shown on shop cards and in the detail panel (a teammate's unit — 前往查看 in prep, 联防 / 最终攻势 fields, an observed battle — shows **its owner's** skill/module from its UnitInfo `skillIndex` / `moduleId`, `gameLogic.js unitLoadout`) — which also shows the stats, 特性, talents and attack range the unit fights with (`shared/loadoutRecord.js` `loadoutRecord` / `attackRangeGrid`, the same composition the sim's `getChess(id, loadout)` uses; the deploy wheel's range preview too) — the range it is deployed with: a selected passive range skill (引星棘刺 S3 3-9) and the 特性's permanent 攻击距离 (信仰搅拌机 SPT-Y +1) included, over all 1284 loadouts equal to the battle's range at deployment; in battle and prep the card draws the live `range` (§21.16). In battle the renderer plays the equipped skill's own Spine clip and ON_SKILL_START sound (`UnitInfo.skillIndex`; `data/assets.json` lists icons, clips and sounds for every skill index).

**导出 / 导入 a loadout:** 导出 hands the current loadout out as a versioned envelope `{ kind: 'stronghold.loadout', v, exportedAt, count, entries, ops }` (`ops`: the 潜能 / 练度 settings, 0.2.2 — an import without them leaves the current settings alone) — copied through `ui/clipboard.js copyText` or downloaded as a file. 导入 accepts that envelope, the stored `{ v, entries }` form and a bare `{ [chessId]: { skill, module } }` map (serialised text too), and refuses another tool's `kind`, junk, an empty result and a **newer** `v` (`parseImport` — a newer payload is never mis-read). Both go through `loadoutSync.applyLoadoutEntries` → `sanitizeEntries`, so a preset from another build never sends the server an entry it would refuse, an import that keeps nothing changes nothing, and the result is reported as N imported / M not (`ui/loadoutModel.js`, `screens/loadout.js`).
A payload that carries `ops`, including `ops: {}`, is refused before any write when chess.json or backups.json is missing (`loadoutOpsImportRefusal` in `screens/loadout.js`, the same check as a 自选编队 import). An older file with no `ops` still imports skills and modules once chess is ready and leaves the current 练度 in place.
Export remains available for non-default `ops` alone, including operators outside the normal roster. The roster's
adjusted count and reset scope stay limited to its own operators; the DIY export still carries picks only.

**干员持有 (0.2.0 补位):** the overlay's second tab marks operators as not owned (the 55 NORMAL chess; per-browser `sp.pref.ownership` = `{ v, notOwned }`, synced as `room.ownership { notOwned }` by the same sync engine as the loadout, `ui/loadoutSync.js installPrefSync`; 导出 / 导入 as `{ kind: 'stronghold.ownership', v, exportedAt, count, notOwned }`). A not-owned chess fights as its official stand-in with the backup skill / module — the loadout never applies to it ("对于补位干员其技能不可更改") — and is shown as the stand-in wherever the player's copy appears (shop / reward cards, hand and 临时整备区, board, detail card, result lineup, a teammate's scouting and bond popups: portrait, name, model, with a small 「替补」 mark; the owner's recall of the official mode, 2026-10-06), while its bonds, 特质, tier, price and merge stay the chess's; the 0.2.0 补位 design subsections have the rules and sources.
**自选编队 (0.2.0):** the overlay's third tab fills the four DIY slots (5阶 ×2, 6阶 ×2) with an owned 6★ outside the chess pool (any of its three skills, any module of its elite form but a 集成战略 one) or a prototype (its locked skill / module); only operators with a kit are offered (`welcome.diyKitted`). Per-browser `sp.pref.diy` = `{ v, picks }`, synced as `room.diy { picks }` by the same sync engine; 导出 / 导入 as `{ kind: 'stronghold.diy', v, exportedAt, count, picks }` (`ui/diyModel.js`, `screens/diy.js`). **UI:** the picker is the roster's own screen (the UI paragraph above) with the picker's own **draft** and its own filter row: the 原型 / 已持有 chips and the search it has always had, plus the roster's 职业 chips (`loadoutSections.js ProfFilter`, one markup for both screens — no 盟约 select and no 仅看已调整, neither of which means anything for a slot's pick). The row's quick skill / module choices write the draft (确认 saves it, 取消 / Esc drop it, a saved pick is never touched) while 潜能 / 练度 writes stay immediate; a taken option (another slot holds the operator) disables its row and names that slot, and a prototype's locked skill / module are static cells. Two 自选 facts differ from the roster's list: the modules come from `pickChoices().modules` (集成战略 / 生息演算 ones excluded, 不装备 first) with the 默认 badge suppressed (on a composed slot record `isDefault` marks the current pick, not an official default), and a 自选 record carries `garrisonIds: []`, so the pane has no 特质 section. Below 1000 px wide the pane slides over the list with a 「干员列表」 back button, and a row's first tap only selects it (the next tap opens the pane). Every row's choices are memoized per loaded backups.json (`pickChoices` behind `screens/diy.js rowChoices`): the tier-6 list holds ~81 operators, so a search keystroke never recomposes them all. In the match a slotted piece is the operator for its player (name, art, class, bonds from its factions, no 特质, the pick's skill and module; the slot's tier, price and merge), sold only in that player's shop from the slot's 调度中心 level with its own stock; the shop / reward / detail cards and the own pieces carry a 「自选」 badge (`ui/gameLogic/diy.js`); the 0.2.0 自选编队 design subsection has the rules and sources.

---

### Cooperative buying, reactions and opening rerolls (§28.15–16, §28.21)

[ASSUMED] Bot purchasing applies one soft 18-point penalty to non-elite, non-DIY tier V/VI shared-pool cards whose
active bonds overlap another living teammate's opening strategy. Human and AI teammates are treated equally; it
neither reserves stock nor prevents a stronger purchase. Existing strategy presets and rehearsal counts are unchanged.
A living teammate's selected strategy also soft-reserves its bonds for bot strategy selection and focus planning
before any member is deployed (§30.28). The reservation ends when that teammate is eliminated. It does not hard-exclude
a strategy, reserve stock, or stop an immediate merge. A reserved strategy keeps a quarter of its unreserved draw
weight (`SOFT_BAND_RESERVE` = 0.25), so it can still be chosen. Mode-inactive bonds stay weight 0 (DESIGN §21.26).

[ASSUMED] AI reactions are cosmetic social choices, enabled by default and disabled with `SP_BOT_EMOTES=0`. Only
mixed human/AI matches emit them, through the existing whitelist and cooldown. A human emote gets at most one eligible
bot reply. Settlement uses that round's results (kills then damage, stable seat tie-break), once per round; the third
chess merge reacts once and resets at settlement. Gifts are classified by trusted source playerId, never display name.
These hooks consume no gameplay RNG and schedule no game actions.

[ASSUMED] During INFO_CHECK any seated human participant may request an opening reroll; all connected human
participants must explicitly agree, including autoplay humans. Bots and spectators do not vote; one human refreshes
immediately. A vote pauses the confirmation timer and blocks Ready. Rejection, cancellation by any seated participant,
disconnect or leaving cancels it and restores the remaining time / prior Ready state. Success preserves the room,
seats, settings and connections, redraws the complete opening, resets Ready, and starts the full original timer
(single-human matches remain untimed). Fixed stage/bans remain fixed and random results can repeat. A separate
seed-derived stream leaves shop/draft RNG untouched; each seat may start one vote per 30 s (a completed reroll opens a
fresh window, a cancelled or rejected vote does not give the cooldown back; the refusal is RATE with the detail `setup
reroll cooldown`, which the client shows as 「每人 30 秒内只能发起一次重刷投票」), and stale revisions or vote identities
are refused. With one human (solo, or co-op with bots) every start completes at once and so clears the cooldown; there
`room.rerollSetup` is throttled by the connection's heavy bucket (server/net.js `HEAVY_TYPES`, 2 per second after a
burst of 6; plain RATE), since each reroll rebuilds the opening and resends `m.public` (§35.47).
All new setup data and player DIY stocks are prepared before mutation; data preparation failure leaves the old opening
intact. This is a remake convenience, not an official mode rule. Unrelated result-screen changes from PR #408 are not
included.

The shared DIY detail preview (stats, range, trait, talents, potential, cultivation and matching normal/elite skill descriptions) follows roster loadout resolution. Jessica shield placement is limited to her four orthogonal neighbors. The two Ptilopsis prep-gift copy exceptions are defined in §29.3 and META; no generic change to all copied conditions is implied.

Shared-stock corrections (§30.1–2, §32.14.24): fixed `SERVER_GAIN_EQUIP` gifts still occupy ordinary/advanced 1/2 copies but
may exceed capacity; `requirePool:false` bypasses equipment limits only for these fixed families. Already displayed
operator and equipment shop cards, and already displayed operator and equipment reward offers, remain valid after
exhaustion and record the deficit (operators: a negative raw left; equipment: `SharedItemPool.debt`, #624, the
maintainer's decision of 2026-10-14). Future rolls exclude empty stock. A copy that actually leaves the match —
destroyed, consumed, wiped from temp, or removed on elimination — repays that deficit first; selling a carrier still
returns its equipment to the hand, so the equipment debt stays. 整备, random grants, 机变 item cards and strategy
grants that are not an already-shown card stay stock-limited. Rockrock and Flametail use the measured weighted
subsets described in DATA and §30.2.


Content-plugin exceptions to the official match rules are opt-in (§34.15): `shopBias=bondBias` filters shop item candidates within their drawn tier by active bond/giveBondId after stock checks, falling
back within that tier; morphPairing=plus uses shared pairing and slot policies (zero-slot morph, one per operator,
only the leftmost bond item grants); unequip=allow moves one equipped item back to the hand then visible temp,
atomically refusing HAND_FULL if both are full. A validated prepLoadout=prep change reconciles affected owners'
summons across board/hand/temp to the selected skill/module stock, then recomputes ranges; unchanged loadouts and
other owners do not replenish spent stock. [ASSUMED] Keep valid board cards in reading order before hand/temp
index order, remove obsolete/excess cards and temp deadlines, and grant missing copies via normal overflow.
These do not alter the default rules above. See
[PLUGINS.md](../PLUGINS.md#rule-switches) for limits and assumptions.

## 身份证与刮刮票（DLC）

身份证为 II 精良永久收藏品，实际持有后才解锁金币购买与免费收藏品奖励中的刮刮票。五档票券为可重复获得的一次性收藏品，图鉴每档仅记一条；休整阶段可同时购买、持有多张未兑奖票，同档票券逐张独立保存和兑奖，不占整备区。点击准备时，未使用票券与剩余资金共用一个确认提示；仅有1张票时也提醒。确认准备或休整超时后，仅保留最高品质的1张票跨回合使用（同档保留最早获得者），其余票券直接销毁、不兑奖、不退款；取消提示或被拒绝准备不销毁。持有票时，所有免费奖池继续排除票券；同次候选按实际已持有的身份证判断资格，候选中的身份证不能提前解锁其他候选。正常和超限补给保留各自的品质权重及回合规则。

| 品质 | 票价 | 购买解锁 | 空票 | 回本 | 2倍 | 5倍 | 10倍 | 50倍 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 普通 | 2 | R1 | 60% | 27% | 10% | 2.70% | 0.28% | 0.02% |
| 精良 | 4 | R1 | 58% | 27% | 11.5% | 3.10% | 0.37% | 0.03% |
| 稀有 | 6 | R4 | 56% | 27% | 13% | 3.50% | 0.46% | 0.04% |
| 史诗 | 8 | R7 | 54% | 27% | 14.5% | 3.90% | 0.55% | 0.05% |
| 传说 | 10 | R7 | 52% | 27% | 16% | 4.30% | 0.64% | 0.06% |

奖金包含本金；各张独立抽取，理论返还率依次为64.3%、70.7%、77.1%、83.5%、89.9%，最高奖金分别为100、200、300、400、500金币。号码匹配方式参考[官方票种规则](https://www.js-lottery.com/tzgg/tzgg/cms/post-144880.html)，数值为维护者确认的原创奖表。

购买、打开与兑奖仅限存活且未准备的休整阶段；每回合不限次数。服务端出票时以独立的座位／票序号种子固定结果，两个中奖号码和六组号码奖金中，中奖票恰有一组匹配，空票无匹配。打开前不发送票面结果，打开后刮擦只控制揭晓；全部刮开后服务端兑奖一次，奖金计入兑奖时所在回合，随后遵循原有资金保留规则。断线、关闭、阶段结束均保留原票；新对局重置。机器人及托管在休整时使用持有的票，不主动购买。

**DLC 收藏品掉落（维护者决定，2026-10-24）：** 完成单次作战后，存活且未离场玩家实际损失生命值不超过 5（含 0 和 5）即获得藏品三选一，超过 5 不发奖。普通回合按扣血上限、联防救援与生命效果处理后的实际扣血判定，回血按零损失处理；首领回合按共享血池结算后的个人分摊生命损失判定，仍仅在最终攻势胜利并解锁隐秘核心时提供下一关补给。移除连续漏怪／连败补偿、品质提升和下回合护盾发放；无漏怪概率、解锁回合、排重及选择流程保持不变。缺失、替代、未完成与重复结算不额外发奖。

**DLC 漏怪收藏品降级（维护者决定，2026-10-24）：** 本人出现计数漏怪时，每个候选按无漏怪概率降低一个品质档，最低为 I 普通；即使联防救回且实际零扣血仍适用，不计数对象不触发。将原 I 与 II 权重合并到 I，III→II、IV→III、V→IV，因此漏怪奖励不出现 V 传说。先降级合并权重，再排除耗尽档位并归一化；不回退到更高档，全部合格池耗尽则不发放。无漏怪概率及超限补给等独立奖池不变。
### Opt-in adaptive strategies

[ASSUMED] The registered `adaptive` strategy keeps legacy band picking and procurement and adds map-independent
layout search inside the five-hook contract; `ioleta-adaptive` composes Russell-only procurement with the same search. First three distinct contact candidates form the baseline; remaining legacy
variants and contact repairs extend the list up to eight. Extension stops after a clean completed zero-leak result,
or at a strict six-times-per-candidate total tick cap. Server and host Worker share RehearsalRun, limits and counters.
Default legacy rules remain the baseline. See [BOT_STRATEGIES](../BOT_STRATEGIES.md).

## DLC：隐秘核心后的额外挑战（2026-10-26，维护者决定）

仅击败隐秘核心后开放继续挑战投票。仍存活且未离场的真人玩家全部同意后，保留本局阵容、收藏品、资金、盟约层数和剩余生命值，从下一回合继续；AI 队友跟随决定，已淘汰玩家及观战者不参与。任一人拒绝或离场则正常成功结算。同盟投票限时 30 秒，超时结算，断线不视为同意且重连可恢复投票；独立模拟不限时。投票范围、AI 跟随和超时规则为 [ASSUMED]。

额外第 N 回合的敌方生命值与攻击力倍率：前 10 回合为 `1 + 0.1 × N`（每回合增加基础值的 10%）；从第 11 回合起为 `2 + 0.15 × (N - 10)`（以第 10 回合的 2 倍为起点，每回合增加基础值的 15%，不复利）。第 11、12 回合分别为 2.15、2.3 倍（2026-10-28，维护者调整），速度、防御和抗性不变。额外第 6、12、18……回合为领袖战，每次按现有普通领袖池权重重新抽取，可重复；其共享生命池也乘以相同倍率。普通回合复用最终攻势前一回合模板，并重新随机该局派系敌人；领袖回合复用最终攻势模板与配对机制。模板及领袖池选择为 [ASSUMED]。召唤、分裂及联防中的敌人同样生效，继承属性不重复叠加额外倍率。

2026-10-27 维护者调整：从首个额外回合起，商店干员槽位比常规后期减少两个（收回第 4、9 回合的两个扩展槽），道具槽位不变。商店自动及手动刷新不再抽取“精打细算玩偶”，冻结保留的该道具也会替换；已购买的玩偶与已生效的每回合资金收益不变。

额外回合不再可获得木棍、鸭梨手机、解压玩具（`relic_159`、`relic_157`、`relic_156`）：候选抽取、手动／自动领取和直接发放均校验当前是否处于额外回合。此前已持有的三件收藏品保留并继续按原效果生效。额外回合同时禁止新获得史诗（IV）和传说（V）藏品，覆盖普通掉落、指定品质奖励、条件自动授予、直接发放及刮刮票购买；已持有藏品继续生效，既有高品质刮刮票仍可刮奖和兑奖。负面品质（内部编号 6）独立于 I–V，不受此限制。

2026-10-28 维护者调整：全员投票通过后、进入第一个额外回合前，为所有存活且未离场的玩家（含 AI）立即各发放一件随机负面藏品；之后每次额外领袖战胜利结算时各发放两件。每名玩家从其当前可领取且尚未持有的负面池中等概率独立抽取，同批不重复；不足两件只发剩余件数，池空时停止本次发放，不补普通藏品、不阻塞后续回合。[ASSUMED] 若追忆仪移除旧负面藏品，后续发放可再次抽取被移除者，以当前持有状态判断可获得性。发放沿用统一领取效果和私有藏品同步，追忆仪的资源损失等获得时效果立即生效；随机流按玩家和回合独立派生，不影响商店、波次和领袖抽取。拒绝投票、普通额外回合、领袖战失败及重复结算均不额外发放。

普通额外回合恢复个人生命值结算，领袖战重新合并存活玩家生命值；不免费回血或复活。之后失败仍按成功通关结算，保存参与额外挑战前已获得的个人通关资格，展示「成功 · 额外通过 N 回合」。额外回合数只统计已通过的回合，失败所在回合不计；首个额外回合失败为 0，已淘汰队友不继续累加个人回合数。该计数口径为 [ASSUMED]。基础通关回合、奖杯和奖励不随额外回合膨胀；未进入额外挑战的早期淘汰玩家不获得成功资格。


### 死亡笔记

书写命中后立即从全队本回合的普通与首领准备预览中移除该类型（包含悬赏），同步推送各玩家及现有整备观战者的预览；棋盘敌方单位、首领站位和敌方情报共用过滤后的列表。写错不改变预览，下一回合不继承该过滤。

传说藏品 `relic_241` 不进入随机奖池，本人本局干员累计死亡至少30次且累计实际损失至少10点生命值后自动获得，多人同局唯一。`g.deathNote { name, round }` 仅准备阶段未准备的持有者可调用，每回合一次，基础花费8金币，拼写错误照常扣费。`g.shinigamiEyes { round }` 由同一整备校验保护，一局一次，以本人当前生命的一半获得死神之眼，剩余生命向上取整 [ASSUMED]；已有共享池时仅扣本人份额并重设同步权重。`m.private.shinigamiEyes` 表示交易结果，`m.private.deathNote` 返回本回合是否已书写与实际花费 `cost`（8或4）。交易不重置书写次数，实际扣费采用服务端状态，重复、过期和非持有者请求无效。服务端解析名字，将本回合全队的移除类型写入各阵地BattleSpec的 `flags.deathNoteEnemyKeys`，共享模拟器在排队和即时生成入口移除匹配敌人；命中领袖时同步完成共享生命池目标。获得、跨局清零、隐藏敌名负面及完整结算边界见 [收藏品规则](../COLLECTIBLES.md)。

**DLC 热水壶（2026-10-28，维护者决定）：** No.014 为普通品质，仅在合格随机收藏品数量不足时逐项补位，允许反复获得，每次领取立即恢复本人2点目标生命值。适用于战后候选及超限补给，候选充足时不改变原概率；完整边界见 [COLLECTIBLES.md](../COLLECTIBLES.md)。


### 负面死亡笔记（维护者适配，2026-10-28）

新增独立藏品 `relic_242`，保留传说版 `relic_241`，复用其图标。每场战斗开始后随机使持有者一名已部署的存活干员立即死亡，本场不能复活或再部署；不影响队友或召唤物，下场重新触发。负面品质不参与普通随机掉落，沿用定向授予。强制死亡跳过保命判定并计入死亡次数。[ASSUMED] 选择在开场部署及其他开场效果后执行，候选只含仍在场的本人干员；详见 [收藏品规则](../COLLECTIBLES.md)。


**DLC 官方负面收藏品（2026-10-28）：** 新增No.177乌萨斯弯刀、No.181莱塔尼亚权杖、No.185半洗孤钻、No.187酒神的印记，沿用负面品质定向发放。敌方属性最终乘算覆盖后续生成和共享首领，权杖新回合扣血、孤钻回合收入减半、印记部署上限-1；原作效果适配及取整、多人叠加、超额退回等[ASSUMED]边界见[收藏品规则](../COLLECTIBLES.md#猩红剧团负面藏品dlc)。


### DLC：无垠赠礼、路网、追忆仪与“小磨唧”（2026-10-28）

四件均为仅定向发放的负面藏品。无垠赠礼仅使持有者自己的客户端文字倒序；路网为本人每场原波次追加50%的固定非本局原定类型敌人；追忆仪领取时销毁备战资源并随机移除七件原有藏品；“小磨唧”每秒扣除随机激活盟约至多20层，并结算到持久层数。编号、官方图片、取整与[ASSUMED]边界见[收藏品规则](../COLLECTIBLES.md)。
