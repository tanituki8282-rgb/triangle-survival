/**
 * レベルアップ3択の定義と適用。
 * スタックで意味のある強化差を出す。
 */

import { CONFIG } from './config.js';

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
      stats.magnet += 90;
    },
  },
  {
    id: 'orbit',
    name: '衛星刃',
    desc: '周囲を回る刃が1本増え、軌道半径が広がる',
    glyph: '◦▲',
    max: 4,
    apply(stats) {
      stats.orbitCount += 1;
    },
  },
  {
    id: 'nova',
    name: 'ノヴァパルス',
    desc: '周期的に全方位弾を放つ。弾数と周期が伸びる',
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
 * @param {number} [level]
 * @returns {UpgradeDef[]}
 */
export function rollChoices(ranks, rng, count = 3, level = 1) {
  const pool = UPGRADES.filter((u) => (ranks[u.id] || 0) < u.max);
  if (pool.length === 0) {
    return [];
  }
  const remaining = pool.slice();
  const out = [];
  while (out.length < Math.min(count, pool.length) && remaining.length > 0) {
    const weights = remaining.map((u) => {
      if (level <= 6 && (u.id === 'orbit' || u.id === 'nova')) return 5;
      return 1;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng.next() * total;
    let idx = remaining.length - 1;
    for (let i = 0; i < remaining.length; i += 1) {
      r -= weights[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(remaining.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * @param {object} stats
 * @returns {object}
 */
function cloneStats(stats) {
  return {
    fireInterval: stats.fireInterval,
    bulletDamage: stats.bulletDamage,
    projectileCount: stats.projectileCount,
    pierce: stats.pierce,
    speed: stats.speed,
    maxHp: stats.maxHp,
    hp: stats.hp,
    magnet: stats.magnet,
    orbitCount: stats.orbitCount,
    novaLevel: stats.novaLevel,
    lifesteal: stats.lifesteal,
    bulletSpeed: stats.bulletSpeed,
    bulletLife: stats.bulletLife,
    regen: stats.regen,
  };
}

/**
 * @param {string} key
 * @param {number} v
 * @returns {string}
 */
export function formatStat(key, v) {
  if (key === 'fireInterval') return `${v.toFixed(2)}s`;
  if (key === 'bulletDamage') return `${Math.round(v)}`;
  if (key === 'projectileCount') return `${v | 0}`;
  if (key === 'pierce') return `${v | 0}`;
  if (key === 'speed') return `${Math.round(v)}`;
  if (key === 'maxHp') return `${Math.round(v)}`;
  if (key === 'magnet') return `${Math.round(v)}`;
  if (key === 'orbitCount') return `${v | 0}`;
  if (key === 'novaLevel') return `${v | 0}`;
  if (key === 'lifesteal') return `${Math.round(v * 100)}%`;
  if (key === 'bulletSpeed') return `${Math.round(v)}`;
  if (key === 'regen') return `${v.toFixed(1)}/s`;
  return String(v);
}

const DIFF_KEYS = [
  'fireInterval',
  'bulletDamage',
  'projectileCount',
  'pierce',
  'speed',
  'maxHp',
  'magnet',
  'orbitCount',
  'novaLevel',
  'lifesteal',
  'bulletSpeed',
  'regen',
];

/**
 * カード用の現在ランクと数値差分。
 * @param {UpgradeDef} def
 * @param {object} stats
 * @param {Record<string, number>} ranks
 * @returns {{rank: number, nextRank: number, max: number, deltaText: string}}
 */
export function describeUpgrade(def, stats, ranks) {
  const rank = ranks[def.id] || 0;
  const before = cloneStats(stats);
  const after = cloneStats(stats);
  def.apply(after, rank + 1);
  const parts = [];
  for (let i = 0; i < DIFF_KEYS.length; i += 1) {
    const key = DIFF_KEYS[i];
    if (Math.abs((after[key] || 0) - (before[key] || 0)) < 1e-6) continue;
    if (key === 'orbitCount' || key === 'novaLevel') continue;
    parts.push(`${formatStat(key, before[key])}→${formatStat(key, after[key])}`);
  }
  if (def.id === 'orbit') parts.push(describeOrbit(before.orbitCount, after.orbitCount));
  if (def.id === 'nova') parts.push(describeNova(before.novaLevel, after.novaLevel));
  return {
    rank,
    nextRank: rank + 1,
    max: def.max,
    deltaText: parts.join('  '),
  };
}

/**
 * @param {number} before
 * @param {number} after
 * @returns {string}
 */
export function describeOrbit(before, after) {
  const r0 = before <= 0 ? 0 : CONFIG.orbit.radiusBase + before * CONFIG.orbit.radiusStep;
  const r1 = CONFIG.orbit.radiusBase + after * CONFIG.orbit.radiusStep;
  return `刃 ${before}本→${after}本  半径 ${Math.round(r0)}→${Math.round(r1)}`;
}

/**
 * @param {number} before
 * @param {number} after
 * @returns {string}
 */
export function describeNova(before, after) {
  const n0 = before <= 0 ? 0 : CONFIG.nova.shotsBase + before * CONFIG.nova.shotsStep;
  const n1 = CONFIG.nova.shotsBase + after * CONFIG.nova.shotsStep;
  const t0 = before <= 0 ? 0 : Math.max(CONFIG.nova.cdMin, CONFIG.nova.cdBase - before * CONFIG.nova.cdStep);
  const t1 = Math.max(CONFIG.nova.cdMin, CONFIG.nova.cdBase - after * CONFIG.nova.cdStep);
  if (before <= 0) return `全方位 ${n1}発  周期 ${t1.toFixed(2)}s`;
  return `全方位 ${n0}発→${n1}発  周期 ${t0.toFixed(2)}s→${t1.toFixed(2)}s`;
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
