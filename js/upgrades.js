/**
 * レベルアップ3択の定義と適用。
 * スタックで意味のある強化差を出す。
 */

/**
 * @typedef {Object} UpgradeDef
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {string} glyph
 * @property {number} max
 * @property {(stats: object, rank: number) => void} apply
 */

/** @type {UpgradeDef[]} */
export const UPGRADES = [
  {
    id: 'rapid',
    name: '連射回路',
    desc: '自動砲の発射間隔を短縮する',
    glyph: '///',
    max: 6,
    apply(stats) {
      stats.fireInterval *= 0.84;
    },
  },
  {
    id: 'power',
    name: '出力増幅',
    desc: '弾のダメージが上がる',
    glyph: '▲▲',
    max: 6,
    apply(stats) {
      stats.bulletDamage *= 1.2;
    },
  },
  {
    id: 'spread',
    name: '拡散砲',
    desc: '同時発射数が +1',
    glyph: '<•>',
    max: 5,
    apply(stats) {
      stats.projectileCount += 1;
    },
  },
  {
    id: 'pierce',
    name: '貫通コア',
    desc: '弾が敵を貫通する回数が +1',
    glyph: '→→',
    max: 4,
    apply(stats) {
      stats.pierce += 1;
    },
  },
  {
    id: 'mobility',
    name: '機動スラスタ',
    desc: '移動速度が上がる',
    glyph: '»»',
    max: 5,
    apply(stats) {
      stats.speed *= 1.1;
    },
  },
  {
    id: 'armor',
    name: '装甲板',
    desc: '最大HP +22、すぐに22回復',
    glyph: '▣',
    max: 6,
    apply(stats) {
      stats.maxHp += 22;
      stats.hp = Math.min(stats.maxHp, stats.hp + 22);
    },
  },
  {
    id: 'magnet',
    name: '磁力フィールド',
    desc: '経験値の吸引範囲が広がる',
    glyph: '◎',
    max: 5,
    apply(stats) {
      stats.magnet += 48;
    },
  },
  {
    id: 'orbit',
    name: '衛星刃',
    desc: '周囲を回る刃が1本増える',
    glyph: '◦▲',
    max: 4,
    apply(stats) {
      stats.orbitCount += 1;
    },
  },
  {
    id: 'nova',
    name: 'ノヴァパルス',
    desc: '周期的に全方位弾を放つ',
    glyph: '✱',
    max: 4,
    apply(stats) {
      stats.novaLevel += 1;
    },
  },
  {
    id: 'vamp',
    name: '残滓吸収',
    desc: '撃破時にわずかに回復する',
    glyph: '♥',
    max: 3,
    apply(stats) {
      stats.lifesteal += 0.06;
    },
  },
  {
    id: 'velocity',
    name: '加速弾',
    desc: '弾速と射程が伸びる',
    glyph: '≫',
    max: 4,
    apply(stats) {
      stats.bulletSpeed *= 1.14;
      stats.bulletLife *= 1.08;
    },
  },
  {
    id: 'regen',
    name: '自己修復',
    desc: '毎秒HPがゆっくり戻る',
    glyph: '+',
    max: 4,
    apply(stats) {
      stats.regen += 1.8;
    },
  },
];

/**
 * @param {Record<string, number>} ranks
 * @param {InstanceType<import('./math.js').RNG>} rng
 * @param {number} count
 * @returns {UpgradeDef[]}
 */
export function rollChoices(ranks, rng, count = 3) {
  const pool = UPGRADES.filter((u) => (ranks[u.id] || 0) < u.max);
  if (pool.length === 0) {
    return [];
  }
  const shuffled = rng.shuffle(pool);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * @param {object} stats
 * @param {UpgradeDef} def
 * @param {Record<string, number>} ranks
 */
export function applyUpgrade(stats, def, ranks) {
  const next = (ranks[def.id] || 0) + 1;
  ranks[def.id] = next;
  def.apply(stats, next);
}
