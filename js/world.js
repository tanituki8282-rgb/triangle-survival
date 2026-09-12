/**
 * ワールドシミュレーション。
 * 自機・敵・弾・経験値・ボス・パーティクルを1フレームで更新する。
 */

import { BOSS_KIND_CAPS, CONFIG, FAUCET, KIND_CAPS, WAVES } from './config.js';
import { RNG, SpatialHash, circlesOverlap, dist2, lerp, lerpAngle, norm, xpToNext } from './math.js';
import { applyUpgrade, rollChoices, describeUpgrade } from './upgrades.js';

/**
 * @param {number} cap
 * @param {() => object} factory
 * @returns {object[]}
 */
function makePool(cap, factory) {
  const arr = [];
  for (let i = 0; i < cap; i += 1) {
    const e = factory();
    e.alive = false;
    arr.push(e);
  }
  return arr;
}

/**
 * @param {object[]} pool
 * @returns {object | null}
 */
function alloc(pool) {
  for (let i = 0; i < pool.length; i += 1) {
    if (!pool[i].alive) return pool[i];
  }
  return null;
}

export class World {
  /**
   * @param {number} [seed]
   */
  constructor(seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.hash = new SpatialHash(CONFIG.cellSize);

    this.time = 0;
    this.kills = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = xpToNext(1, CONFIG.xp.base, CONFIG.xp.growth);
    this.pendingLevels = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.bossWarningPlayed = false;
    this.over = false;
    this.victory = false;
    this.god = false;
    this.bossGrace = 0;
    this.aftermath = 0;
    this.fade = 0;
    this.shake = 0;
    this.shakeCd = 0;
    this.hitstop = 0;
    this.killFlash = 0;
    /** @type {string[]} */
    this.events = [];

    this.stats = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      r: CONFIG.player.radius,
      hitR: CONFIG.player.hitRadius,
      speed: CONFIG.player.speed,
      hp: CONFIG.player.maxHp,
      maxHp: CONFIG.player.maxHp,
      fireInterval: CONFIG.player.fireInterval,
      fireCd: 0,
      bulletSpeed: CONFIG.player.bulletSpeed,
      bulletRadius: CONFIG.player.bulletRadius,
      bulletDamage: CONFIG.player.bulletDamage,
      bulletLife: CONFIG.player.bulletLife,
      projectileCount: CONFIG.player.projectileCount,
      pierce: CONFIG.player.pierce,
      magnet: CONFIG.player.magnet,
      vacuum: 0,
      vacuumTimer: 0,
      iFrame: 0,
      regen: CONFIG.player.regen,
      lifesteal: CONFIG.player.lifesteal,
      orbitCount: 0,
      orbitAngle: 0,
      novaLevel: 0,
      novaCd: 2.2,
    };

    /** @type {Record<string, number>} */
    this.ranks = {};
    this.spawnCd = 0.4;
    this.enemyCount = 0;
    /** @type {Record<string, number>} */
    this.kindCounts = { grunt: 0, spreader: 0, spiral: 0, tank: 0, dasher: 0, boss: 0 };

    this.enemies = makePool(CONFIG.maxEnemies + 2, () => ({
      alive: false,
      kind: 'grunt',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 10,
      hp: 1,
      maxHp: 1,
      fireCd: 0,
      angle: 0,
      phase: 0,
      state: 0,
      stateT: 0,
      flash: 0,
      flinch: 0,
      telegraph: 0,
      shotIndex: 0,
      beat: 0,
    }));

    this.pBullets = makePool(CONFIG.maxPlayerBullets, () => ({
      alive: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 3,
      dmg: 1,
      life: 1,
      pierce: 0,
      /** @type {Set<number> | null} */
      hit: null,
    }));

    this.eBullets = makePool(CONFIG.maxEnemyBullets, () => ({
      alive: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 4,
      dmg: 8,
      life: 2,
      hue: 0,
      turn: 0,
      turnLife: 0,
    }));

    this.gems = makePool(CONFIG.maxGems, () => ({
      alive: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      value: 1,
      r: CONFIG.xp.gemRadius,
      age: 0,
      /** @type {'xp'|'vacuum'} */
      kind: 'xp',
    }));

    this.particles = makePool(CONFIG.maxParticles, () => ({
      alive: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      r: 2,
      color: '#fff',
      additive: true,
    }));

    this.camX = 0;
    this.camY = 0;
    this._eid = 1;
    this._viewW = 1280;
    this._viewH = 720;
  }

  /**
   * @param {number} w
   * @param {number} h
   */
  setView(w, h) {
    this._viewW = w;
    this._viewH = h;
  }

  /**
   * @param {string} name
   */
  emit(name) {
    this.events.push(name);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /**
   * @param {number} dt
   * @param {{x: number, y: number}} move
   */
  update(dt, move) {
    if (this.over) return;
    if (this.aftermath > 0) {
      this._updateAftermath(dt);
      return;
    }
    if (this._isDanmakuLocked()) {
      this._clearEnemyBullets();
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      dt *= 0.15;
      if (dt < 0) dt = 0;
    }
    if (this.bossGrace > 0) {
      this.bossGrace = Math.max(0, this.bossGrace - dt);
      this.stats.iFrame = Math.max(this.stats.iFrame, 0.08);
    }

    this.time += dt;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    this.killFlash = Math.max(0, this.killFlash - dt * 3);
    this.shake = Math.max(0, this.shake - dt * CONFIG.camera.shakeDecay);
    this.shakeCd = Math.max(0, this.shakeCd - dt);
    this.stats.vacuumTimer = Math.max(0, (this.stats.vacuumTimer || 0) - dt);
    this.stats.iFrame = Math.max(0, this.stats.iFrame - dt);
    this.stats.flash = Math.max(0, (this.stats.flash || 0) - dt);

    this._updatePlayer(dt, move);
    this._updateOrbits(dt);
    this._spawn(dt);
    this._updateEnemies(dt);
    if (this._isDanmakuLocked()) {
      this._clearEnemyBullets();
    }
    this._updateBullets(dt);
    this._collide();
    this._updateGems(dt);
    this._updateParticles(dt);

    this.camX = lerp(this.camX, this.stats.x, 1 - Math.exp(-CONFIG.camera.lerp * dt));
    this.camY = lerp(this.camY, this.stats.y, 1 - Math.exp(-CONFIG.camera.lerp * dt));

    if (this.stats.hp <= 0 && !this.over) {
      this.stats.hp = 0;
      this.over = true;
      this.victory = false;
      this.emit('death');
      this._burst(this.stats.x, this.stats.y, '#7ef9ff', 36, 280, 0.45);
      this._addShake(6.5);
    }
  }

  /**
   * 大きな演出だけ短いシェイクを入れる。群れ掃討ではほぼ揺らさない。
   * @param {number} amount
   */
  _addShake(amount) {
    const cam = CONFIG.camera;
    if (amount < cam.shakeMin) return;
    if (this.shakeCd > 0 && amount < cam.shakeOverride) return;
    this.shake = Math.min(cam.shakeMax, Math.max(this.shake, amount));
    this.shakeCd = cam.shakeCooldown;
  }

  /**
   * 真空吸引の強化、またはレアコアの時限効果。
   * @returns {boolean}
   */
  _hasFullVacuum() {
    return (this.stats.vacuum || 0) > 0 || (this.stats.vacuumTimer || 0) > 0;
  }

  /**
   * ボス撃破後のスローとフェード。リザルトは余韻が終わってから。
   * @param {number} dt
   */
  _updateAftermath(dt) {
    this.aftermath = Math.max(0, this.aftermath - dt);
    this.fade = Math.min(1, 1 - this.aftermath / CONFIG.aftermath);
    const slow = dt * 0.28;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.killFlash = Math.max(0, this.killFlash - dt);
    this._updateParticles(slow);
    for (let i = 0; i < this.eBullets.length; i += 1) this.eBullets[i].alive = false;
    for (let i = 0; i < this.pBullets.length; i += 1) {
      const b = this.pBullets[i];
      if (!b.alive) continue;
      b.x += b.vx * slow * 0.4;
      b.y += b.vy * slow * 0.4;
      b.life -= dt;
      if (b.life <= 0) b.alive = false;
    }
    this.camX = lerp(this.camX, this.stats.x, 1 - Math.exp(-6 * dt));
    this.camY = lerp(this.camY, this.stats.y, 1 - Math.exp(-6 * dt));
    if (this.aftermath <= 0) {
      this.over = true;
      this.emit('victory');
    }
  }

  /**
   * @param {number} dt
   * @param {{x: number, y: number}} move
   */
  _updatePlayer(dt, move) {
    const p = this.stats;
    p.x += move.x * p.speed * dt;
    p.y += move.y * p.speed * dt;
    if (move.x !== 0 || move.y !== 0) {
      p.angle = lerpAngle(p.angle, Math.atan2(move.y, move.x), 1 - Math.exp(-14 * dt));
    }
    if (p.regen > 0 && p.hp > 0) {
      p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
    }

    const target = this._nearestEnemy(720);
    const aim = target
      ? Math.atan2(target.y - p.y, target.x - p.x)
      : p.angle;
    if (target) {
      p.angle = lerpAngle(p.angle, aim, 1 - Math.exp(-10 * dt));
    }

    p.fireCd -= dt;
    if (p.fireCd <= 0) {
      this._firePlayer(aim);
      p.fireCd = p.fireInterval;
    }

    p.novaCd -= dt;
    if (p.novaLevel > 0 && p.novaCd <= 0) {
      this._fireNova();
      p.novaCd = Math.max(CONFIG.nova.cdMin, CONFIG.nova.cdBase - p.novaLevel * CONFIG.nova.cdStep);
    }

    if ((move.x !== 0 || move.y !== 0) && this.rng.next() < dt * 18) {
      this._spark(
        p.x - Math.cos(p.angle) * 10,
        p.y - Math.sin(p.angle) * 10,
        -move.x * 40 + this.rng.range(-20, 20),
        -move.y * 40 + this.rng.range(-20, 20),
        '#7ef9ff',
        0.2,
        2,
      );
    }
  }

  /**
   * @param {number} aim
   */
  _firePlayer(aim) {
    const p = this.stats;
    const n = p.projectileCount;
    const spread = n === 1 ? 0 : 0.12 + (n - 2) * 0.03;
    const start = aim - (spread * (n - 1)) / 2;
    for (let i = 0; i < n; i += 1) {
      const a = start + spread * i;
      this._spawnPBullet(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, a);
    }
    this.emit('shoot');
  }

  _fireNova() {
    const p = this.stats;
    const count = CONFIG.nova.shotsBase + p.novaLevel * CONFIG.nova.shotsStep;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + p.orbitAngle;
      this._spawnPBullet(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16, a, 1.05);
    }
    this.emit('nova');
    this._ring(p.x, p.y, '#ffe566', 28);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} angle
   * @param {number} [spdMul]
   */
  _spawnPBullet(x, y, angle, spdMul = 1) {
    const b = alloc(this.pBullets);
    if (!b) return;
    const p = this.stats;
    const sp = p.bulletSpeed * spdMul;
    b.alive = true;
    b.x = x;
    b.y = y;
    b.vx = Math.cos(angle) * sp;
    b.vy = Math.sin(angle) * sp;
    b.r = p.bulletRadius;
    b.dmg = p.bulletDamage;
    b.life = p.bulletLife;
    b.pierce = p.pierce;
    b.hit = null;
  }

  /**
   * @param {number} range
   * @returns {object | null}
   */
  _nearestEnemy(range) {
    const p = this.stats;
    const r2 = range * range;
    let boss = null;
    let best = null;
    let bestD = r2;
    for (let i = 0; i < this.enemies.length; i += 1) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      const d = dist2(p.x, p.y, e.x, e.y);
      if (e.kind === 'boss') boss = e;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    // ボス戦は雑魚より本体を優先して撃つ
    if (boss && dist2(p.x, p.y, boss.x, boss.y) < range * range * 2.2) {
      return boss;
    }
    return best;
  }

  /**
   * @param {number} dt
   */
  _updateOrbits(dt) {
    const p = this.stats;
    p.orbitAngle += dt * (1.8 + p.orbitCount * 0.25);
    if (p.orbitCount <= 0) return;
    const radius = CONFIG.orbit.radiusBase + p.orbitCount * CONFIG.orbit.radiusStep;
    for (let i = 0; i < p.orbitCount; i += 1) {
      const a = p.orbitAngle + (i / p.orbitCount) * Math.PI * 2;
      const ox = p.x + Math.cos(a) * radius;
      const oy = p.y + Math.sin(a) * radius;
      for (let j = 0; j < this.enemies.length; j += 1) {
        const e = this.enemies[j];
        if (!e.alive) continue;
        if (circlesOverlap(ox, oy, 10, e.x, e.y, e.r)) {
          this._damageEnemy(e, 18 * dt * (1 + p.orbitCount * 0.15), ox, oy);
        }
      }
    }
  }

  /**
   * @param {number} dt
   */
  _spawn(dt) {
    if (this.over) return;
    const warningAt = CONFIG.bossTime - CONFIG.bossWarning;
    if (!this.bossWarningPlayed && this.time >= warningAt && !this.bossSpawned) {
      this.bossWarningPlayed = true;
      this._clearEnemyBullets();
      this.stats.iFrame = Math.max(this.stats.iFrame, 1.0);
      this.emit('warning');
    }
    if (!this.bossSpawned && this.time >= CONFIG.bossTime) {
      this._spawnBoss();
    }
    if (this._isDanmakuLocked()) {
      this._clearEnemyBullets();
      this.spawnCd = Math.max(this.spawnCd, 0.25);
      return;
    }

    let wave = WAVES[0];
    for (let i = 0; i < WAVES.length; i += 1) {
      if (this.time >= WAVES[i].t) wave = WAVES[i];
    }
    let interval = wave.interval;
    let batch = wave.batch || 1;
    let kinds = wave.kinds;
    if (this.bossSpawned && !this.bossDefeated) {
      interval *= 7;
      batch = 1;
      kinds = ['grunt'];
    }
    if (this.bossDefeated) interval *= 0.85;

    this.spawnCd -= dt;
    while (this.spawnCd <= 0) {
      this.spawnCd += interval;
      if (this.enemyCount >= CONFIG.maxEnemies) break;
      for (let n = 0; n < batch; n += 1) {
        if (this.enemyCount >= CONFIG.maxEnemies) break;
        const kind = this._pickKind(kinds);
        if (!kind) break;
        const pos = this._spawnPos();
        this.spawnEnemy(kind, pos.x, pos.y);
      }
    }
  }

  /**
   * @param {string[]} kinds
   * @returns {string | null}
   */
  _pickKind(kinds) {
    const caps = this.bossSpawned && !this.bossDefeated ? BOSS_KIND_CAPS : KIND_CAPS;
    const shuffled = this.rng.shuffle(kinds);
    for (let i = 0; i < shuffled.length; i += 1) {
      const k = shuffled[i];
      if (this.kindCounts[k] < caps[k]) return k;
    }
    if (this.kindCounts.grunt < caps.grunt) return 'grunt';
    return null;
  }

  /**
   * 画面外の円周上に湧かせ、カメラ内にいきなり出さない。
   * @returns {{x: number, y: number}}
   */
  _spawnPos() {
    const margin = 80;
    const hw = this._viewW * 0.5 + margin;
    const hh = this._viewH * 0.5 + margin;
    const edge = this.rng.int(4);
    const jitter = this.rng.range(-1, 1);
    let x = this.stats.x;
    let y = this.stats.y;
    if (edge === 0) {
      x -= hw;
      y += jitter * hh;
    } else if (edge === 1) {
      x += hw;
      y += jitter * hh;
    } else if (edge === 2) {
      y -= hh;
      x += jitter * hw;
    } else {
      y += hh;
      x += jitter * hw;
    }
    return { x, y };
  }

  /**
   * @param {string} kind
   * @param {number} x
   * @param {number} y
   * @returns {object | null}
   */
  spawnEnemy(kind, x, y) {
    const e = alloc(this.enemies);
    if (!e) return null;
    const def = CONFIG.enemies[kind];
    e.alive = true;
    e.id = this._eid++;
    e.kind = kind;
    e.x = x;
    e.y = y;
    e.vx = 0;
    e.vy = 0;
    e.r = def.radius;
    e.hp = def.hp;
    e.maxHp = def.hp;
    e.fireCd = this.rng.range(0.2, def.fireInterval || 1);
    e.angle = this.rng.range(0, Math.PI * 2);
    e.phase = this.rng.range(0, Math.PI * 2);
    e.state = 0;
    e.stateT = 0;
    e.flash = 0;
    e.flinch = 0;
    e.pattern = 0;
    e.telegraph = 0;
    e.shotIndex = 0;
    e.beat = 0;
    e.farCd = 0.4;
    e.farShot = 0;
    this.enemyCount += 1;
    this.kindCounts[kind] += 1;
    return e;
  }

  _spawnBoss() {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    this._clearEnemyBullets();
    this._knockbackTrash();
    this.bossGrace = CONFIG.bossGrace;
    this.stats.iFrame = Math.max(this.stats.iFrame, 1.5);
    const p = this.stats;
    const dist = Math.max(this._viewW, this._viewH) * 0.42;
    const ang = this.rng.range(0, Math.PI * 2);
    const b = this.spawnEnemy('boss', p.x + Math.cos(ang) * dist, p.y + Math.sin(ang) * dist);
    if (b) {
      b.hp = CONFIG.enemies.boss.hp;
      b.maxHp = b.hp;
      b.pattern = 0;
      b.stateT = CONFIG.bossGrace;
    }
    this.emit('boss');
    this._addShake(6.5);
    this._ring(p.x, p.y, '#ffd166', 48);
  }

  /** 警告開始〜grace終了まで敵弾を出さない */
  _isDanmakuLocked() {
    if (this.bossDefeated) return false;
    const warningAt = CONFIG.bossTime - CONFIG.bossWarning;
    if (this.time + 1e-6 >= warningAt && !this.bossSpawned) return true;
    if (this.bossWarningPlayed && !this.bossSpawned) return true;
    if (this.bossGrace > 0) return true;
    return false;
  }

  /** @deprecated 旧名。ロック判定は _isDanmakuLocked */
  _isArenaClearing() {
    return this._isDanmakuLocked();
  }

  _clearEnemyBullets() {
    for (let i = 0; i < this.eBullets.length; i += 1) {
      this.eBullets[i].alive = false;
    }
  }

  /** 自機周辺の雑魚を弾き、密着スポーンキルを防ぐ */
  _knockbackTrash() {
    const p = this.stats;
    for (let i = 0; i < this.enemies.length; i += 1) {
      const e = this.enemies[i];
      if (!e.alive || e.kind === 'boss') continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 280) {
        const n = d < 1e-3 ? { x: 1, y: 0 } : norm(e.x - p.x, e.y - p.y);
        const force = d < 110 ? 520 : 360;
        e.vx = n.x * force;
        e.vy = n.y * force;
        e.x += n.x * 36;
        e.y += n.y * 36;
        e.flinch = 0.7;
      }
    }
  }

  /**
   * @param {number} dt
   */
  _updateEnemies(dt) {
    const p = this.stats;
    for (let i = 0; i < this.enemies.length; i += 1) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      e.flash = Math.max(0, e.flash - dt * 8);
      e.flinch = Math.max(0, (e.flinch || 0) - dt);
      if (e.kind === 'boss') {
        this._updateBoss(e, dt);
        continue;
      }
      if (e.flinch > 0) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 0.88;
        e.vy *= 0.88;
        continue;
      }
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const def = CONFIG.enemies[e.kind];

      if (e.kind === 'grunt') {
        e.vx = (dx / d) * def.speed;
        e.vy = (dy / d) * def.speed;
      } else if (e.kind === 'spreader') {
        const pref = def.preferredRange;
        const err = d - pref;
        const seek = err > 0 ? 1 : -0.55;
        e.vx = (dx / d) * def.speed * seek;
        e.vy = (dy / d) * def.speed * seek;
        e.vx += -dy / d * 22;
        this._tickFaucet(e, dt, d, def.fireRange || 500, () => this._fireAimer(e));
      } else if (e.kind === 'spiral') {
        e.vx = (dx / d) * def.speed;
        e.vy = (dy / d) * def.speed;
        this._tickFaucet(e, dt, d, def.fireRange || 540, () => this._fireBinder(e));
      } else if (e.kind === 'tank') {
        e.vx = (dx / d) * def.speed;
        e.vy = (dy / d) * def.speed;
        e.fireCd -= dt;
        if (!this._isArenaClearing() && e.fireCd <= 0 && d < 500) {
          e.fireCd = def.fireInterval;
          this._spawnEBullet(e.x, e.y, Math.atan2(dy, dx), 128, 7.5, CONFIG.bullets.dangerGold, CONFIG.bullets.enemyDamage + 4);
        }
      } else if (e.kind === 'dasher') {
        e.stateT -= dt;
        if (e.state === 0) {
          e.vx = (dx / d) * def.speed;
          e.vy = (dy / d) * def.speed;
          if (d < 260 && e.stateT <= 0) {
            e.state = 1;
            e.stateT = def.windup;
            e.flash = 1;
          }
        } else if (e.state === 1) {
          e.vx *= 0.85;
          e.vy *= 0.85;
          if (e.stateT <= 0) {
            e.state = 2;
            e.stateT = def.dashTime;
            const nrm = norm(p.x - e.x, p.y - e.y);
            e.vx = nrm.x * def.dashSpeed;
            e.vy = nrm.y * def.dashSpeed;
          }
        } else {
          if (e.stateT <= 0) {
            e.state = 0;
            e.stateT = def.cooldown;
          }
        }
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.angle = Math.atan2(e.vy, e.vx);
    }
  }

  /**
   * 蛇口の予兆→発射。死亡時は _silenceFaucet で予兆ごと止める。
   * @param {object} e
   * @param {number} dt
   * @param {number} d
   * @param {number} range
   * @param {() => void} fire
   */
  _tickFaucet(e, dt, d, range, fire) {
    if (this._isArenaClearing()) {
      e.telegraph = 0;
      return;
    }
    e.fireCd -= dt;
    if (e.telegraph > 0) {
      e.telegraph -= dt;
      if (e.telegraph <= 0 && e.alive) fire();
      return;
    }
    if (e.fireCd <= 0 && d < range) {
      const def = CONFIG.enemies[e.kind];
      e.fireCd = def.fireInterval;
      e.telegraph = def.telegraph || 0.18;
      e.flash = 1;
    }
  }

  /**
   * エイマー：単発狙い。3発に1発は曲がり狙いで立ち位置ずらしを要求する。
   * @param {object} e
   */
  _fireAimer(e) {
    const p = this.stats;
    const base = Math.atan2(p.y - e.y, p.x - e.x);
    e.shotIndex = (e.shotIndex || 0) + 1;
    if (e.shotIndex % FAUCET.aimerCurveEvery === 0) {
      this._spawnEBullet(e.x, e.y, base, 152, 4.4, CONFIG.bullets.dangerHot, CONFIG.bullets.enemyDamage, {
        turn: FAUCET.curveTurn,
        turnLife: FAUCET.curveLife,
      });
      return;
    }
    this._spawnEBullet(e.x, e.y, base, 188, 4.2, CONFIG.bullets.danger, CONFIG.bullets.enemyDamage);
  }

  /**
   * バインダー：奇数は中央空け n-way（セルフミス）、偶数は斜め十字レーン。
   * @param {object} e
   */
  _fireBinder(e) {
    const p = this.stats;
    const base = Math.atan2(p.y - e.y, p.x - e.x);
    const def = CONFIG.enemies.spiral;
    e.shotIndex = (e.shotIndex || 0) + 1;
    if (e.shotIndex % 2 === 1) {
      this._fireSkipCenter(e.x, e.y, base, def.ways, def.waySpread, 158, 4.1, CONFIG.bullets.danger, CONFIG.bullets.enemyDamage);
      return;
    }
    const lane = base + Math.PI / 4;
    for (let k = 0; k < 4; k += 1) {
      this._spawnEBullet(e.x, e.y, lane + k * (Math.PI / 2), 132, 4.3, CONFIG.bullets.dangerGold, CONFIG.bullets.enemyDamage);
    }
  }

  /**
   * 自機方向の中央を空けた n-way。立ち止まりはこの隙間に入れるが、エイマーが罰する。
   * @param {number} x
   * @param {number} y
   * @param {number} base
   * @param {number} ways
   * @param {number} spread
   * @param {number} spd
   * @param {number} r
   * @param {string} color
   * @param {number} dmg
   */
  _fireSkipCenter(x, y, base, ways, spread, spd, r, color, dmg) {
    const half = (ways - 1) / 2;
    for (let k = 0; k < ways; k += 1) {
      const slot = k - half;
      if (slot === 0) continue;
      this._spawnEBullet(x, y, base + slot * spread, spd, r, color, dmg);
    }
  }

  /**
   * 撃破で蛇口を即閉じる。予兆中の発射も残さない。
   * @param {object} e
   */
  _silenceFaucet(e) {
    e.telegraph = 0;
    e.fireCd = 99;
    e.state = 0;
    e.stateT = 0;
  }

  /**
   * 中〜遠距離の細い供給。近いほど本体ボレーだけで、離れるほど合間を埋める。
   * @param {object} e
   * @param {number} dt
   * @param {number} d
   * @param {boolean} far
   * @param {number} base
   */
  _tickBossRangePressure(e, dt, d, far, base) {
    if (!far || this.bossGrace > 0 || this._isArenaClearing()) return;
    const t = Math.max(0, Math.min(1, (d - FAUCET.bossFarRange) / 260));
    const interval = 0.78 - t * 0.34;
    e.farCd = (e.farCd == null ? 0.4 : e.farCd) - dt;
    if (e.farCd > 0) return;
    e.farCd = interval;
    e.farShot = (e.farShot || 0) + 1;
    this._spawnEBullet(e.x, e.y, base, 186 + t * 24, 5.1, CONFIG.bullets.dangerHot, 11);
    if (e.farShot % 2 === 0) {
      this._fireSkipCenter(e.x, e.y, base, 5, 0.4, 124, 4.2, CONFIG.bullets.dangerGold, 10);
    }
    if (e.farShot % 4 === 0) {
      this._spawnEBullet(e.x, e.y, base, 148, 4.7, CONFIG.bullets.danger, 10, {
        turn: FAUCET.curveTurn * 0.75,
        turnLife: 1.25,
      });
    }
  }

  /**
   * ボス：狙い＋柵＋稀な曲がりを階段で足す。遠距離カイトが空き地にならないようにする。
   * @param {object} e
   * @param {number} dt
   */
  _updateBoss(e, dt) {
    const p = this.stats;
    const def = CONFIG.enemies.boss;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const hpRatio = e.hp / e.maxHp;
    const phase = hpRatio > 0.66 ? 1 : hpRatio > 0.33 ? 2 : 3;
    const far = d > FAUCET.bossFarRange;

    const pref = 210;
    const seek = d > pref ? 1 : -0.4;
    e.vx = (dx / d) * def.speed * seek;
    e.vy = (dy / d) * def.speed * seek;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.angle += dt * (0.6 + phase * 0.25);
    e.phase += dt;
    e.stateT -= dt;
    e.pattern = phase;

    const base = Math.atan2(dy, dx);
    // 距離が開くほど合間に狙い／柵を足し、カイト空き地を潰す
    this._tickBossRangePressure(e, dt, d, far, base);

    if (this.bossGrace > 0 || e.stateT > 0) return;

    e.beat = (e.beat || 0) + 1;

    if (phase === 1) {
      e.stateT = far ? 0.82 : 0.98;
      if (e.beat % 2 === 1) {
        for (let k = -1; k <= 1; k += 1) {
          this._spawnEBullet(e.x, e.y, base + k * 0.2, far ? 178 : 165, 5.5, CONFIG.bullets.danger, 11);
        }
        if (far) {
          this._spawnEBullet(e.x, e.y, base, 205, 5.2, CONFIG.bullets.dangerHot, 11);
        }
      } else {
        this._fireSkipCenter(e.x, e.y, base, 5, 0.38, 150, 4.6, CONFIG.bullets.dangerGold, 10);
      }
      if (this.rng.next() < 0.16) {
        this._ringBullets(e.x, e.y, 8, e.phase, 125, CONFIG.bullets.dangerHot);
      }
    } else if (phase === 2) {
      e.stateT = far ? 0.2 : 0.22;
      const arms = 2;
      for (let a = 0; a < arms; a += 1) {
        const ang = e.phase * 1.55 + (a / arms) * Math.PI * 2;
        this._spawnEBullet(e.x, e.y, ang, 140, 4.6, CONFIG.bullets.dangerGold, 10);
      }
      if (e.beat % 7 === 0) {
        this._spawnEBullet(e.x, e.y, base, 198, 5.5, CONFIG.bullets.dangerHot, 11);
      }
      if (e.beat % 10 === 0) {
        this._spawnEBullet(e.x, e.y, base, 156, 4.8, CONFIG.bullets.danger, 10, {
          turn: FAUCET.curveTurn * 0.85,
          turnLife: 1.15,
        });
      }
      if (far && e.beat % 6 === 0) {
        this._fireSkipCenter(e.x, e.y, base, 5, 0.4, 148, 4.4, CONFIG.bullets.danger, 10);
      }
    } else {
      if (e.beat % 2 === 1) {
        e.stateT = 1.15;
        this._ringBullets(e.x, e.y, 10, e.phase, 148, CONFIG.bullets.danger);
        this._spawnEBullet(e.x, e.y, base, 210, 8, CONFIG.bullets.dangerHot, 14);
        if (far) {
          this._spawnEBullet(e.x, e.y, base, 188, 5.4, CONFIG.bullets.danger, 11);
        }
      } else {
        e.stateT = 1.05;
        this._fireSkipCenter(e.x, e.y, base, 5, 0.36, 160, 4.6, CONFIG.bullets.dangerGold, 10);
        this._spawnEBullet(e.x, e.y, base, 168, 5.2, CONFIG.bullets.dangerHot, 12, {
          turn: FAUCET.curveTurn * 0.8,
          turnLife: 1.2,
        });
      }
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} n
   * @param {number} rot
   * @param {number} spd
   * @param {string} color
   */
  _ringBullets(x, y, n, rot, spd, color) {
    for (let i = 0; i < n; i += 1) {
      const a = rot + (i / n) * Math.PI * 2;
      this._spawnEBullet(x, y, a, spd, 4.4, color, 10);
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} angle
   * @param {number} speed
   * @param {number} r
   * @param {string} color
   * @param {number} dmg
   * @param {{turn?: number, turnLife?: number, life?: number}} [opts]
   */
  _spawnEBullet(x, y, angle, speed, r, color, dmg, opts) {
    if (this._isArenaClearing()) return;
    const b = alloc(this.eBullets);
    if (!b) return;
    b.alive = true;
    b.x = x;
    b.y = y;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.r = r;
    b.dmg = dmg;
    b.life = opts && opts.life ? opts.life : CONFIG.bullets.enemyLife;
    b.color = color;
    b.turn = opts && opts.turn ? opts.turn : 0;
    b.turnLife = opts && opts.turnLife ? opts.turnLife : 0;
  }

  /**
   * @param {number} dt
   */
  _updateBullets(dt) {
    const maxD = Math.hypot(this._viewW, this._viewH) + 200;
    for (let i = 0; i < this.pBullets.length; i += 1) {
      const b = this.pBullets[i];
      if (!b.alive) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || dist2(b.x, b.y, this.stats.x, this.stats.y) > maxD * maxD) {
        b.alive = false;
      }
    }
    for (let i = 0; i < this.eBullets.length; i += 1) {
      const b = this.eBullets[i];
      if (!b.alive) continue;
      this._steerEnemyBullet(b, dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || dist2(b.x, b.y, this.stats.x, this.stats.y) > maxD * maxD) {
        b.alive = false;
      }
    }
  }

  /**
   * 曲がり狙い弾を読める曲率で自機へ寄せる。死亡した蛇口からはもう出ない。
   * @param {object} b
   * @param {number} dt
   */
  _steerEnemyBullet(b, dt) {
    if (!(b.turn > 0) || !(b.turnLife > 0)) return;
    b.turnLife -= dt;
    const desired = Math.atan2(this.stats.y - b.y, this.stats.x - b.x);
    const current = Math.atan2(b.vy, b.vx);
    let delta = desired - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxStep = b.turn * dt;
    if (delta > maxStep) delta = maxStep;
    if (delta < -maxStep) delta = -maxStep;
    const ang = current + delta;
    const spd = Math.hypot(b.vx, b.vy);
    b.vx = Math.cos(ang) * spd;
    b.vy = Math.sin(ang) * spd;
  }

  _collide() {
    this.hash.clear();
    for (let i = 0; i < this.enemies.length; i += 1) {
      const e = this.enemies[i];
      if (e.alive) this.hash.insert(e);
    }

    const seen = new Set();
    for (let i = 0; i < this.pBullets.length; i += 1) {
      const b = this.pBullets[i];
      if (!b.alive) continue;
      seen.clear();
      this.hash.query(b.x, b.y, b.r + 28, (e) => {
        if (!e.alive || seen.has(e.id)) return;
        seen.add(e.id);
        if (!circlesOverlap(b.x, b.y, b.r, e.x, e.y, e.r)) return;
        if (b.hit && b.hit.has(e.id)) return;
        if (!b.hit) b.hit = new Set();
        b.hit.add(e.id);
        this._damageEnemy(e, b.dmg, b.x, b.y);
        if (b.pierce <= 0) {
          b.alive = false;
        } else {
          b.pierce -= 1;
        }
      });
    }

    const p = this.stats;
    if (p.iFrame <= 0 && p.hp > 0) {
      let hit = false;
      this.hash.query(p.x, p.y, p.hitR + 56, (e) => {
        if (!e.alive || hit) return;
        if (circlesOverlap(p.x, p.y, p.hitR, e.x, e.y, e.r * 0.85)) {
          this._hurt(CONFIG.enemies[e.kind].contact, e.x, e.y);
          hit = true;
        }
      });
      if (!hit) {
        for (let i = 0; i < this.eBullets.length; i += 1) {
          const b = this.eBullets[i];
          if (!b.alive) continue;
          if (circlesOverlap(p.x, p.y, p.hitR, b.x, b.y, b.r * 0.78)) {
            b.alive = false;
            this._hurt(b.dmg, b.x, b.y);
            this._spark(b.x, b.y, 0, 0, '#ffffff', 0.15, 4);
            break;
          }
        }
      }
    }
  }

  /**
   * @param {number} dmg
   * @param {number} sx
   * @param {number} sy
   */
  _hurt(dmg, sx, sy) {
    const p = this.stats;
    if (this.god || p.iFrame > 0) return;
    p.hp -= dmg;
    p.iFrame = CONFIG.player.iFrame;
    p.flash = 1;
    const n = norm(p.x - sx, p.y - sy);
    // 接触の群れから押し出し、無敵解除直後の再重ねを減らす
    const push = CONFIG.player.knockback * 0.5;
    p.x += n.x * push;
    p.y += n.y * push;
    this.emit('hurt');
    this._burst(p.x, p.y, '#ff8fab', 10, 140, 0.25);
  }

  /**
   * @param {object} e
   * @param {number} dmg
   * @param {number} hx
   * @param {number} hy
   */
  _damageEnemy(e, dmg, hx, hy) {
    if (!e.alive) return;
    e.hp -= dmg;
    e.flash = 1;
    e.flinch = e.kind === 'boss' ? 0.05 : 0.12;
    const n = norm(e.x - hx, e.y - hy);
    const kick = e.kind === 'boss' ? 48 : 210;
    e.vx += n.x * kick;
    e.vy += n.y * kick;
    if (e.kind === 'boss') {
      this.hitstop = Math.max(this.hitstop, 0.018);
    }
    this._spark(hx, hy, this.rng.range(-40, 40), this.rng.range(-40, 40), '#ffe566', 0.12, 2.2);
    if (e.hp <= 0) {
      this._killEnemy(e);
    }
  }

  /**
   * @param {object} e
   */
  _killEnemy(e) {
    if (!e.alive) return;
    this._silenceFaucet(e);
    e.alive = false;
    this.enemyCount = Math.max(0, this.enemyCount - 1);
    this.kindCounts[e.kind] = Math.max(0, this.kindCounts[e.kind] - 1);
    const def = CONFIG.enemies[e.kind];
    this.kills += 1;
    this.combo += 1;
    this.comboTimer = 1.6;
    this.score += def.score + this.combo * 2;
    this.killFlash = Math.min(1, this.killFlash + 0.12);
    // 通常キルでは揺らさない。連キルの節目とボスだけ短く叩く
    if (e.kind === 'boss') {
      this._addShake(7);
    } else {
      const every = CONFIG.camera.comboShakeEvery;
      if (this.combo >= every && this.combo % every === 0) {
        this._addShake(4.5);
      }
    }

    const gemN = e.kind === 'boss' ? 12 : e.kind === 'tank' ? 3 : 1;
    for (let i = 0; i < gemN; i += 1) {
      this._spawnGem(
        e.x + this.rng.range(-12, 12),
        e.y + this.rng.range(-12, 12),
        e.kind === 'boss' ? 8 : def.xp,
      );
    }
    this._maybeDropVacuum(e);
    this._burst(e.x, e.y, def.color, e.kind === 'boss' ? 48 : 12 + e.r * 0.4, 90 + e.r * 4, 0.28);
    this._ring(e.x, e.y, def.color, e.r + 8);
    this.emit(e.kind === 'boss' ? 'bossKill' : 'explode');

    if (this.stats.lifesteal > 0) {
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.maxHp * this.stats.lifesteal * 0.12);
    }

    if (e.kind === 'boss') {
      this.bossDefeated = true;
      this.victory = true;
      this.aftermath = CONFIG.aftermath;
      this.fade = 0;
      this._clearEnemyBullets();
      this._burst(e.x, e.y, '#ffffff', 64, 420, 0.7);
    }
  }

  /**
   * タンク／ボスなどから稀に真空コアを落とす。
   * @param {object} e
   */
  _maybeDropVacuum(e) {
    if (e.kind === 'boss') {
      this._spawnGem(e.x, e.y - 18, 0, 'vacuum');
      return;
    }
    const chance = e.kind === 'tank' ? 0.16 : e.kind === 'spiral' ? 0.07 : 0;
    if (chance > 0 && this.rng.next() < chance) {
      this._spawnGem(e.x + 10, e.y - 10, 0, 'vacuum');
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} value
   * @param {'xp'|'vacuum'} [kind]
   */
  _spawnGem(x, y, value, kind = 'xp') {
    const g = alloc(this.gems);
    if (!g) {
      if (kind === 'vacuum') {
        this.stats.vacuumTimer = Math.max(this.stats.vacuumTimer || 0, CONFIG.xp.vacuumPickupTime);
        this.emit('vacuum');
      } else {
        this._addXp(value);
      }
      return;
    }
    g.alive = true;
    g.x = x;
    g.y = y;
    g.vx = this.rng.range(-40, 40);
    g.vy = this.rng.range(-40, 40);
    g.value = value;
    g.kind = kind;
    g.r = kind === 'vacuum' ? CONFIG.xp.vacuumRadius : CONFIG.xp.gemRadius;
    g.age = 0;
  }

  /**
   * 既定は近距離マグネットのみ。時間経過の全域回収はしない。
   * @param {number} dt
   */
  _updateGems(dt) {
    const p = this.stats;
    const magnetR = this._hasFullVacuum() ? 4000 : p.magnet;
    for (let i = 0; i < this.gems.length; i += 1) {
      const g = this.gems[i];
      if (!g.alive) continue;
      g.age += dt;
      const dist = Math.sqrt(dist2(g.x, g.y, p.x, p.y));
      if (dist < magnetR && dist > 0.001) {
        const n = norm(p.x - g.x, p.y - g.y);
        const pull = CONFIG.xp.gemSpeed * (0.7 + Math.min(1.4, dist / 160));
        g.vx = n.x * pull;
        g.vy = n.y * pull;
      } else {
        g.vx *= 0.9;
        g.vy *= 0.9;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      const pick = g.kind === 'vacuum' ? 36 : 30;
      if (dist2(g.x, g.y, p.x, p.y) < pick * pick) {
        g.alive = false;
        if (g.kind === 'vacuum') {
          p.vacuumTimer = Math.max(p.vacuumTimer || 0, CONFIG.xp.vacuumPickupTime);
          this.emit('vacuum');
        } else {
          this._addXp(g.value);
          this.emit('gem');
        }
      }
    }
  }

  /**
   * @param {number} n
   */
  _addXp(n) {
    if (this.victory || this.aftermath > 0) return;
    this.xp += n;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level += 1;
      this.pendingLevels += 1;
      this.xpNeed = xpToNext(this.level, CONFIG.xp.base, CONFIG.xp.growth);
      this.emit('level');
    }
  }

  /**
   * @returns {import('./upgrades.js').UpgradeDef[]}
   */
  rollLevelChoices() {
    return rollChoices(this.ranks, this.rng, 3, this.level);
  }

  /**
   * @param {import('./upgrades.js').UpgradeDef} def
   */
  pickUpgrade(def) {
    applyUpgrade(this.stats, def, this.ranks);
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    this.emit('upgrade');
  }

  /**
   * @param {import('./upgrades.js').UpgradeDef} def
   */
  describeChoice(def) {
    return describeUpgrade(def, this.stats, this.ranks);
  }

  /**
   * @param {number} dt
   */
  _updateParticles(dt) {
    for (let i = 0; i < this.particles.length; i += 1) {
      const q = this.particles[i];
      if (!q.alive) continue;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.96;
      q.vy *= 0.96;
      q.life -= dt;
      if (q.life <= 0) q.alive = false;
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} vx
   * @param {number} vy
   * @param {string} color
   * @param {number} life
   * @param {number} r
   */
  _spark(x, y, vx, vy, color, life, r) {
    const q = alloc(this.particles);
    if (!q) return;
    q.alive = true;
    q.x = x;
    q.y = y;
    q.vx = vx;
    q.vy = vy;
    q.life = life;
    q.maxLife = life;
    q.r = r;
    q.color = color;
    q.additive = true;
    q.ring = false;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} color
   * @param {number} n
   * @param {number} spd
   * @param {number} life
   */
  _burst(x, y, color, n, spd, life) {
    for (let i = 0; i < n; i += 1) {
      const a = this.rng.range(0, Math.PI * 2);
      const s = this.rng.range(spd * 0.25, spd);
      this._spark(x, y, Math.cos(a) * s, Math.sin(a) * s, color, life * this.rng.range(0.5, 1), this.rng.range(1.4, 3.4));
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {string} color
   * @param {number} r
   */
  _ring(x, y, color, r) {
    const q = alloc(this.particles);
    if (!q) return;
    q.alive = true;
    q.x = x;
    q.y = y;
    q.vx = 0;
    q.vy = 0;
    q.life = 0.28;
    q.maxLife = 0.28;
    q.r = r;
    q.color = color;
    q.additive = true;
    q.ring = true;
  }

  counts() {
    let pb = 0;
    let eb = 0;
    let gems = 0;
    let parts = 0;
    for (let i = 0; i < this.pBullets.length; i += 1) if (this.pBullets[i].alive) pb += 1;
    for (let i = 0; i < this.eBullets.length; i += 1) if (this.eBullets[i].alive) eb += 1;
    for (let i = 0; i < this.gems.length; i += 1) if (this.gems[i].alive) gems += 1;
    for (let i = 0; i < this.particles.length; i += 1) if (this.particles[i].alive) parts += 1;
    return {
      enemies: this.enemyCount,
      pBullets: pb,
      eBullets: eb,
      gems,
      parts,
    };
  }
}
