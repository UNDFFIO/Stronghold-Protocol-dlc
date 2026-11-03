import { N_ } from './i18n.js';

export const LIONHEART_ID = 'chess_special_lionheart_a';
export const GOLDEN_VOW_ID = 'token_10040_siege2_vlion';
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Maintainer-defined operator, built from the existing summon rather than a second set of stats. */
export function buildSpecialOperators(chess, tokens) {
  const owner = Object.values(chess).find((c) => c.charId === 'char_1019_siege2' && !c.isGolden);
  const token = tokens[GOLDEN_VOW_ID];
  if (!owner || !token) return {};
  const form = token.variants[owner.chessId];
  return {
    [LIONHEART_ID]: {
      chessId: LIONHEART_ID, baseId: LIONHEART_ID, goldenId: null, isGolden: false,
      // [ASSUMED] Use the source operator's tier and melee profession; no elite form; acquired only through Royal Power.
      tier: owner.tier, identifier: 10001, shopSortId: 10001,
      isHidden: true, isDiy: false, visible: false, chessType: 'SPECIAL',
      charId: 'char_special_lionheart', name: N_('狮心王'), appellation: 'Lionheart King',
      rarity: owner.rarity, profession: owner.profession, subProfessionId: token.subProfessionId,
      subProfessionName: null, position: token.position, nationId: owner.nationId,
      bonds: ['victoriaShip'], garrisonIds: [], price: 0, sellPrice: 0,
      unsellable: true, noDeployCount: true,
      upgradeNum: 0, upgradeChessId: null,
      status: { phase: form.phase, level: form.level, skillLevel: 0, equipLevel: 0 },
      stats: clone(form.stats), immunities: clone(form.immunities),
      // Maintainer's pictured 5×5 range without corners, including the deployment tile (2026-11-03).
      rangeId: null, rangeGrid: [
        [-2, -1], [-2, 0], [-2, 1],
        [-1, -2], [-1, -1], [-1, 0], [-1, 1], [-1, 2],
        [0, -2], [0, -1], [0, 0], [0, 1], [0, 2],
        [1, -2], [1, -1], [1, 0], [1, 1], [1, 2],
        [2, -1], [2, 0], [2, 1],
      ],
      dmgType: 'true', attackKind: form.attackKind, projectile: form.projectile,
      canHitFly: form.canHitFly, targetPriority: form.targetPriority,
      trait: {
        desc: N_('无法出售，不占用部署名额。无法被治疗。'),
        descRaw: N_('无法出售，不占用部署名额。无法被治疗。'), bb: {}, bbStr: {},
      },
      skill: null, skills: [],
      talents: [
        { name: N_('王权'), desc: N_('自身更容易受到攻击。【维多利亚】盟约每叠加1层，自身生命上限和防御力各+1%。在场时，我方所有远程位干员的阻挡数归零，自身获得所移除的阻挡数。我方其他【维多利亚】干员被治疗时，自身恢复相当于其实际恢复量50%的生命值。'),
          bb: {}, bbStr: {}, rangeGrid: null },
        { name: N_('不灭'), desc: N_('受到致命伤害时不撤退，保留1点生命值，阻挡数归零，并获得25秒无敌。期间无法攻击，被攻击的优先度降低，停止施加控制及共享治疗，远程位干员的阻挡数仍为0；结束后恢复全部生命值及自身效果。可重复触发。'),
          bb: {}, bbStr: {}, rangeGrid: null },
        { name: N_('王威'), desc: N_('范围内每名敌人每停留1秒，等概率获得下列一种效果：眩晕0.6秒、寒冷2秒、束缚0.7秒、停顿1秒、沉默10秒或1层麻痹。激活6人【维多利亚】盟约时，攻击范围内的敌人移动速度-30%，受到诱导的敌人不受该效果影响；离开攻击范围的敌人受到10秒诱导，向自身移动。'),
          bb: {}, bbStr: {}, rangeGrid: null },
      ].map((t, index) => ({ ...t, index, descRaw: t.desc, tokenKey: null, hidden: false, fromModule: false })),
      tokens: [], module: null,
      assets: { ...token.assets },
    },
  };
}
