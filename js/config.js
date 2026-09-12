/**
 * ゲーム定数とバランス値。
 * 人間プレイテスト（揺れ・ジェム回収・難易度）を反映した縦スライス用。
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
    /** 近距離だけ吸い寄せる。全域吸引は強化／レアコア限定 */
    magnet: 78,
    /** 接触後の無敵。群れから抜けられるが連打は通る */
    iFrame: 0.68,
    regen: 0.65,
    lifesteal: 0,
    /** 被弾時に群れから抜け出す距離の係数元 */
    knockback: 125,
  },

  /** 衛星刃・ノヴァの見た目数値。カード文言と同期する */
  orbit: {
    radiusBase: 42,
    radiusStep: 8,
  },
  nova: {
    shotsBase: 8,
    shotsStep: 4,
    cdBase: 2.35,
    cdStep: 0.28,
    cdMin: 0.85,
  },

  xp: {
    base: 6,
    growth: 1.28,
    gemRadius: 8,
    gemSpeed: 480,
    vacuumRadius: 12,
    /** レアコア取得後の全域吸引秒数 */
    vacuumPickupTime: 18,
  },

  /** @type {Record<EnemyKind, object>} */
  enemies: {
    grunt: {
      radius: 10,
      hp: 14,
      speed: 94,
      xp: 1,
      color: '#ff5d73',
      /** ミスは痛く、積み重なると溶ける */
      contact: 6,
      score: 10,
    },
    spreader: {
      radius: 13,
      hp: 26,
      speed: 66,
      xp: 2,
      color: '#c77dff',
      contact: 10,
      score: 22,
      fireInterval: 1.85,
      preferredRange: 230,
    },
    spiral: {
      radius: 14,
      hp: 34,
      speed: 50,
      xp: 3,
      color: '#d65cff',
      contact: 10,
      score: 30,
      fireInterval: 0.15,
    },
    tank: {
      radius: 20,
      hp: 90,
      speed: 36,
      xp: 5,
      color: '#f4a261',
      contact: 16,
      score: 45,
      fireInterval: 2.25,
    },
    dasher: {
      radius: 12,
      hp: 20,
      speed: 74,
      xp: 2,
      color: '#ff8c42',
      contact: 8,
      score: 24,
      dashSpeed: 350,
      windup: 0.38,
      dashTime: 0.28,
      cooldown: 1.65,
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
    enemySpeed: 175,
    enemyRadius: 4.2,
    enemyLife: 3.6,
    enemyDamage: 11,
    /** 敵弾は危険色で統一。自機シアンと混ぜない */
    danger: '#ff4a2a',
    dangerHot: '#ff7a32',
    dangerGold: '#ffb347',
  },

  camera: {
    lerp: 8,
    /** 短い減衰。群れ掃討ではほぼ揺れない */
    shakeDecay: 22,
    shakeMax: 7,
    shakeMin: 4,
    shakeCooldown: 0.7,
    /** ボス出現／撃破／死亡だけクールを貫通できる */
    shakeOverride: 6,
    comboShakeEvery: 10,
  },
};

/**
 * 経過時間に応じた湧き設定。
 * interval は1体あたり秒、kinds は重み付き抽選。
 * 60秒帯は batch 2 のまま。batch 3 に戻すと接触溶けしやすい。
 */
export const WAVES = [
  { t: 0, interval: 0.52, batch: 1, kinds: ['grunt'] },
  { t: 8, interval: 0.4, batch: 1, kinds: ['grunt', 'grunt', 'grunt', 'spreader'] },
  { t: 20, interval: 0.32, batch: 2, kinds: ['grunt', 'grunt', 'grunt', 'spreader', 'dasher'] },
  { t: 36, interval: 0.26, batch: 2, kinds: ['grunt', 'grunt', 'grunt', 'spreader', 'dasher'] },
  { t: 52, interval: 0.22, batch: 2, kinds: ['grunt', 'grunt', 'grunt', 'spreader', 'dasher', 'spiral'] },
  { t: 70, interval: 0.2, batch: 2, kinds: ['grunt', 'grunt', 'spreader', 'dasher', 'spiral', 'tank'] },
  { t: 90, interval: 0.18, batch: 2, kinds: ['grunt', 'grunt', 'spreader', 'dasher', 'spiral', 'tank'] },
];

/** 種ごとの同時存在上限。弾幕の可読性を守る */
export const KIND_CAPS = {
  grunt: 140,
  spreader: 12,
  spiral: 4,
  tank: 6,
  dasher: 6,
  boss: 1,
};

/** ボス戦中の雑魚上限。弾海を濁さない */
export const BOSS_KIND_CAPS = {
  grunt: 8,
  spreader: 2,
  spiral: 1,
  tank: 1,
  dasher: 2,
  boss: 1,
};
