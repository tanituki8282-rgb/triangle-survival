/**
 * ワールドシミュレーション。
 * 自機・敵・弾・経験値・ボス・パーティクルを1フレームで更新する。
 */

import { CONFIG, WAVES, KIND_CAPS } from './config.js';
import { RNG, SpatialHash, circlesOverlap, dist2, lerp, lerpAngle, norm, xpToNext } from './math.js';
import { applyUpgrade, rollChoices } from './upgrades.js';

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
    this.shake = 0;
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
    }));

    this.gems = makePool(CONFIG.maxGems, () => ({
      alive: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      value: 1,
      r: CONFIG.xp.gemRadius,
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
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      dt *= 0.15;
      if (dt < 0) dt = 0;
    }

    this.time += dt;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    this.killFlash = Math.max(0, this.killFlash - dt * 3);
    this.shake = Math.max(0, this.shake - dt * CONFIG.camera.shakeDecay);
    this.stats.iFrame = Math.max(0, this.stats.iFrame - dt);
    this.stats.flash = Math.max(0, (this.stats.flash || 0) - dt);

    this._updatePlayer(dt, move);
    this._updateOrbits(dt);
    this._spawn(dt);
    this._updateEnemies(dt);
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
      this.shake = Math.max(this.shake, 18);
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
      p.novaCd = Math.max(0.85, 2.35 - p.novaLevel * 0.28);
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
    const count = 8 + p.novaLevel * 4;
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
    let best = null;
    let bestD = r2;
    for (let i = 0; i < this.enemies.length; i += 1) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      const d = dist2(p.x, p.y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
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
    const radius = 42 + p.orbitCount * 8;
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
      this.emit('warning');
    }
    if (!this.bossSpawned && this.time >= CONFIG.bossTime) {
      this._spawnBoss();
    }

    let wave = WAVES[0];
    for (let i = 0; i < WAVES.length; i += 1) {
      if (this.time >= WAVES[i].t) wave = WAVES[i];
    }
    let interval = wave.interval;
    if (this.bossSpawned && !this.bossDefeated) interval *= 2.4;
    if (this.bossDefeated) interval *= 0.85;

    this.spawnCd -= dt;
    while (this.spawnCd <= 0) {
      this.spawnCd += interval;
      if (this.enemyCount >= CONFIG.maxEnemies) break;
      const kind = this._pickKind(wave.kinds);
      if (!kind) break;
      const pos = this._spawnPos();
      this.spawnEnemy(kind, pos.x, pos.y);
    }
  }

  /**
   * @param {string[]} kinds
   * @returns {string | null}
   */
  _pickKind(kinds) {
    const shuffled = this.rng.shuffle(kinds);
    for (let i = 0; i < shuffled.length; i += 1) {
      const k = shuffled[i];
      if (this.kindCounts[k] < KIND_CAPS[k]) return k;
    }
    if (this.kindCounts.grunt < KIND_CAPS.grunt) return 'grunt';
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
    e.pattern = 0;
    this.enemyCount += 1;
    this.kindCounts[kind] += 1;
    return e;
  }

  _spawnBoss() {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    const p = this.stats;
    const b = this.spawnEnemy('boss', p.x + 320, p.y - 40);
    if (b) {
      b.hp = CONFIG.enemies.boss.hp;
      b.maxHp = b.hp;
      b.pattern = 0;
      b.stateT = 0;
    }
    this.emit('boss');
    this.shake = 12;
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
      if (e.kind === 'boss') {
        this._updateBoss(e, dt);
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
        e.fireCd -= dt;
        if (e.fireCd <= 0 && d < 460) {
          e.fireCd = def.fireInterval;
          const base = Math.atan2(dy, dx);
          for (let k = -1; k <= 1; k += 1) {
            this._spawnEBullet(e.x, e.y, base + k * 0.22, 150, 4.2, '#c77dff', 9);
          }
        }
      } else if (e.kind === 'spiral') {
        e.vx = (dx / d) * def.speed;
        e.vy = (dy / d) * def.speed;
        e.fireCd -= dt;
        if (e.fireCd <= 0 && d < 520) {
          e.fireCd = def.fireInterval;
          e.phase += 0.42;
          this._spawnEBullet(e.x, e.y, e.phase, 135, 4, '#4cc9f0', 8);
        }
      } else if (e.kind === 'tank') {
        e.vx = (dx / d) * def.speed;
        e.vy = (dy / d) * def.speed;
        e.fireCd -= dt;
        if (e.fireCd <= 0 && d < 500) {
          e.fireCd = def.fireInterval;
          this._spawnEBullet(e.x, e.y, Math.atan2(dy, dx), 120, 7.5, '#f4a261', 14);
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
   * ボス：3段階の読みやすい弾幕と突進。
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

    if (e.stateT > 0) return;

    if (phase === 1) {
      e.stateT = 0.85;
      const base = Math.atan2(dy, dx);
      for (let k = -2; k <= 2; k += 1) {
        this._spawnEBullet(e.x, e.y, base + k * 0.16, 175, 5.5, '#ff6b9d', 11);
      }
      if (this.rng.next() < 0.35) {
        this._ringBullets(e.x, e.y, 10, e.phase, 130, '#ff2d6a');
      }
    } else if (phase === 2) {
      e.stateT = 0.11;
      const arms = 3;
      for (let a = 0; a < arms; a += 1) {
        const ang = e.phase * 1.7 + (a / arms) * Math.PI * 2;
        this._spawnEBullet(e.x, e.y, ang, 148, 4.6, '#ffd166', 10);
      }
      if (this.rng.next() < 0.08) {
        const base = Math.atan2(dy, dx);
        for (let k = -1; k <= 1; k += 1) {
          this._spawnEBullet(e.x, e.y, base + k * 0.12, 210, 5, '#ffffff', 11);
        }
      }
    } else {
      e.stateT = 0.7;
      this._ringBullets(e.x, e.y, 16, e.phase, 155, '#ff2d6a');
      this._ringBullets(e.x, e.y, 12, e.phase + 0.2, 120, '#7ef9ff');
      const base = Math.atan2(dy, dx);
      this._spawnEBullet(e.x, e.y, base, 230, 8, '#ffffff', 16);
      if (this.kindCounts.grunt < 20) {
        const pos = this._spawnPos();
        this.spawnEnemy('grunt', pos.x, pos.y);
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
   */
  _spawnEBullet(x, y, angle, speed, r, color, dmg) {
    const b = alloc(this.eBullets);
    if (!b) return;
    b.alive = true;
    b.x = x;
    b.y = y;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.r = r;
    b.dmg = dmg;
    b.life = CONFIG.bullets.enemyLife;
    b.color = color;
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
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || dist2(b.x, b.y, this.stats.x, this.stats.y) > maxD * maxD) {
        b.alive = false;
      }
    }
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
    p.x += n.x * CONFIG.player.knockback * 0.12;
    p.y += n.y * CONFIG.player.knockback * 0.12;
    this.shake = Math.max(this.shake, 7);
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
    e.alive = false;
    this.enemyCount = Math.max(0, this.enemyCount - 1);
    this.kindCounts[e.kind] = Math.max(0, this.kindCounts[e.kind] - 1);
    const def = CONFIG.enemies[e.kind];
    this.kills += 1;
    this.combo += 1;
    this.comboTimer = 1.6;
    this.score += def.score + this.combo * 2;
    this.killFlash = Math.min(1, this.killFlash + 0.12);
    this.shake = Math.max(this.shake, e.kind === 'boss' ? 20 : e.kind === 'tank' ? 5 : 2.2);

    const gemN = e.kind === 'boss' ? 12 : e.kind === 'tank' ? 3 : 1;
    for (let i = 0; i < gemN; i += 1) {
      this._spawnGem(
        e.x + this.rng.range(-12, 12),
        e.y + this.rng.range(-12, 12),
        e.kind === 'boss' ? 8 : def.xp,
      );
    }
    this._burst(e.x, e.y, def.color, e.kind === 'boss' ? 48 : 12 + e.r * 0.4, 90 + e.r * 4, 0.28);
    this._ring(e.x, e.y, def.color, e.r + 8);
    this.emit(e.kind === 'boss' ? 'bossKill' : 'explode');

    if (this.stats.lifesteal > 0) {
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.maxHp * this.stats.lifesteal * 0.12);
    }

    if (e.kind === 'boss') {
      this.bossDefeated = true;
      this.victory = true;
      this.over = true;
      this.emit('victory');
      this._burst(e.x, e.y, '#ffffff', 64, 420, 0.7);
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} value
   */
  _spawnGem(x, y, value) {
    const g = alloc(this.gems);
    if (!g) {
      this._addXp(value);
      return;
    }
    g.alive = true;
    g.x = x;
    g.y = y;
    g.vx = this.rng.range(-40, 40);
    g.vy = this.rng.range(-40, 40);
    g.value = value;
    g.r = CONFIG.xp.gemRadius;
  }

  /**
   * @param {number} dt
   */
  _updateGems(dt) {
    const p = this.stats;
    const mag2 = p.magnet * p.magnet;
    const pick2 = 16 * 16;
    for (let i = 0; i < this.gems.length; i += 1) {
      const g = this.gems[i];
      if (!g.alive) continue;
      const d2 = dist2(g.x, g.y, p.x, p.y);
      if (d2 < mag2) {
        const n = norm(p.x - g.x, p.y - g.y);
        const pull = CONFIG.xp.gemSpeed * (1.1 - Math.sqrt(d2) / p.magnet);
        g.vx = n.x * pull;
        g.vy = n.y * pull;
      } else {
        g.vx *= 0.92;
        g.vy *= 0.92;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (d2 < pick2) {
        g.alive = false;
        this._addXp(g.value);
        this.emit('gem');
      }
    }
  }

  /**
   * @param {number} n
   */
  _addXp(n) {
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
    return rollChoices(this.ranks, this.rng, 3);
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
