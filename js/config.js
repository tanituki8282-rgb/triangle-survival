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
  /** ボス出現後、弾幕と近接を止める余白 */
  bossGrace: 2.6,
  /** 撃破後のスロー余韻 */
  aftermath: 2.4,
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
    maxHp: 120,
    fireInterval: 0.2,
    bulletSpeed: 560,
    bulletRadius: 3.4,
    bulletDamage: 10,
    bulletLife: 0.85,
    projectileCount: 1,
    pierce: 0,
    magnet: 280,
    iFrame: 0.72,
    regen: 0.7,
    lifesteal: 0,
    knockback: 90,
  },

  xp: {
    base: 6,
    growth: 1.28,
    gemRadius: 8,
    gemSpeed: 620,
    vacuumAge: 0.45,
  },

  /** @type {Record<EnemyKind, object>} */
  enemies: {
    grunt: {
      radius: 10,
      hp: 14,
      speed: 86,
      xp: 1,
      color: '#ff5d73',
      contact: 10,
      score: 10,
    },
    spreader: {
      radius: 13,
      hp: 26,
      speed: 62,
      xp: 2,
      color: '#c77dff',
      contact: 12,
      score: 22,
      fireInterval: 2.15,
      preferredRange: 230,
    },
    spiral: {
      radius: 14,
      hp: 34,
      speed: 48,
      xp: 3,
      color: '#d65cff',
      contact: 12,
      score: 30,
      fireInterval: 0.16,
    },
    tank: {
      radius: 20,
      hp: 90,
      speed: 36,
      xp: 5,
      color: '#f4a261',
      contact: 16,
      score: 45,
      fireInterval: 2.6,
    },
    dasher: {
      radius: 12,
      hp: 20,
      speed: 70,
      xp: 2,
      color: '#ff8c42',
      contact: 13,
      score: 24,
      dashSpeed: 420,
      windup: 0.38,
      dashTime: 0.28,
      cooldown: 1.35,
    },
    boss: {
      radius: 52,
      hp: 1650,
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
    /** 敵弾は危険色で統一。自機シアンと混ぜない */
    danger: '#ff4a2a',
    dangerHot: '#ff7a32',
    dangerGold: '#ffb347',
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
  { t: 0, interval: 0.72, batch: 1, kinds: ['grunt'] },
  { t: 12, interval: 0.5, batch: 1, kinds: ['grunt', 'grunt', 'grunt', 'spreader'] },
  { t: 28, interval: 0.38, batch: 2, kinds: ['grunt', 'grunt', 'grunt', 'spreader', 'dasher'] },
  { t: 48, interval: 0.28, batch: 2, kinds: ['grunt', 'grunt', 'grunt', 'grunt', 'spreader', 'dasher'] },
  { t: 60, interval: 0.22, batch: 3, kinds: ['grunt', 'grunt', 'grunt', 'grunt', 'spreader', 'dasher', 'spiral'] },
  { t: 78, interval: 0.2, batch: 3, kinds: ['grunt', 'grunt', 'grunt', 'spreader', 'dasher', 'spiral', 'tank'] },
  { t: 100, interval: 0.2, batch: 2, kinds: ['grunt', 'grunt', 'spreader', 'dasher', 'spiral', 'tank'] },
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
