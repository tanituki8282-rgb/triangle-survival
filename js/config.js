/**
 * ゲーム定数とバランス値。
 * 批評家レビューを反映した「数分遊べる」縦スライス用。
 */

/** @typedef {'grunt'|'spreader'|'spiral'|'tank'|'dasher'|'boss'} EnemyKind */

export const CONFIG = {
  /** 仮想ピクセル。内部シミュレーションはこの単位 */
  targetFps: 60,
  maxDt: 1 / 20,
  /** 生存時間（秒）。この時刻にボス出現 */
  bossTime: 105,
  bossWarning: 4,
  /** 同時存在上限（ボス除く） */
  maxEnemies: 160,
  maxPlayerBullets: 220,
  maxEnemyBullets: 280,
  maxGems: 180,
  maxParticles: 420,
  maxOrbits: 8,
  worldPadding: 80,
  cellSize: 72,

  player: {
    radius: 11,
    hitRadius: 8,
    speed: 255,
    maxHp: 100,
    fireInterval: 0.2,
    bulletSpeed: 560,
    bulletRadius: 3.4,
    bulletDamage: 10,
    bulletLife: 0.85,
    projectileCount: 1,
    pierce: 0,
    magnet: 96,
    iFrame: 0.55,
    regen: 0,
    lifesteal: 0,
    knockback: 90,
  },

  xp: {
    base: 6,
    growth: 1.28,
    gemRadius: 5,
    gemSpeed: 420,
  },

  /** @type {Record<EnemyKind, object>} */
  enemies: {
    grunt: {
      radius: 10,
      hp: 14,
      speed: 86,
      xp: 1,
      color: '#ff5d73',
      contact: 14,
      score: 10,
    },
    spreader: {
      radius: 13,
      hp: 26,
      speed: 62,
      xp: 2,
      color: '#c77dff',
      contact: 16,
      score: 22,
      fireInterval: 2.15,
      preferredRange: 230,
    },
    spiral: {
      radius: 14,
      hp: 34,
      speed: 48,
      xp: 3,
      color: '#4cc9f0',
      contact: 16,
      score: 30,
      fireInterval: 0.16,
    },
    tank: {
      radius: 20,
      hp: 90,
      speed: 36,
      xp: 5,
      color: '#f4a261',
      contact: 22,
      score: 45,
      fireInterval: 2.6,
    },
    dasher: {
      radius: 12,
      hp: 20,
      speed: 70,
      xp: 2,
      color: '#80ed99',
      contact: 18,
      score: 24,
      dashSpeed: 420,
      windup: 0.38,
      dashTime: 0.28,
      cooldown: 1.35,
    },
    boss: {
      radius: 52,
      hp: 2100,
      speed: 42,
      xp: 80,
      color: '#ff2d6a',
      contact: 28,
      score: 2000,
    },
  },

  bullets: {
    enemySpeed: 165,
    enemyRadius: 4.2,
    enemyLife: 3.6,
    enemyDamage: 9,
  },

  camera: {
    lerp: 8,
    shakeDecay: 6,
  },
};

/**
 * 経過時間に応じた湧き設定。
 * interval は1体あたり秒、kinds は重み付き抽選。
 */
export const WAVES = [
  { t: 0, interval: 0.95, kinds: ['grunt'] },
  { t: 12, interval: 0.78, kinds: ['grunt', 'grunt', 'spreader'] },
  { t: 28, interval: 0.64, kinds: ['grunt', 'grunt', 'spreader', 'dasher'] },
  { t: 48, interval: 0.52, kinds: ['grunt', 'grunt', 'spreader', 'dasher', 'spiral'] },
  { t: 70, interval: 0.44, kinds: ['grunt', 'spreader', 'dasher', 'spiral', 'tank'] },
  { t: 92, interval: 0.4, kinds: ['grunt', 'spreader', 'dasher', 'spiral', 'tank'] },
  { t: 130, interval: 0.36, kinds: ['grunt', 'spreader', 'dasher', 'spiral', 'tank'] },
];

/** 種ごとの同時存在上限。弾幕の可読性を守る */
export const KIND_CAPS = {
  grunt: 140,
  spreader: 10,
  spiral: 3,
  tank: 6,
  dasher: 12,
  boss: 1,
};
