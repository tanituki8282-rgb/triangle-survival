/**
 * Canvas 2D 描画。幾何学図形と加算合成で射撃／爆発を見せる。
 */

import { CONFIG } from './config.js';

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    /** @type {CanvasRenderingContext2D} */
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.dpr = 1;
    this.w = 1280;
    this.h = 720;
    this.t = 0;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.w = Math.max(640, window.innerWidth);
    this.h = Math.max(360, window.innerHeight);
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * @param {import('./world.js').World} world
   * @param {number} dt
   * @param {{fps: number, paused: boolean, title?: boolean}} extra
   */
  draw(world, dt, extra) {
    this.t += dt;
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const shake = extra.title ? 0 : world.shake;
    const ox = (Math.random() - 0.5) * shake;
    const oy = (Math.random() - 0.5) * shake;
    const camX = world.camX - w / 2 + ox;
    const camY = world.camY - h / 2 + oy;

    ctx.fillStyle = '#07080f';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(-camX, -camY);
    this._grid(ctx, camX, camY, w, h);
    if (!extra.title) {
      this._gems(ctx, world);
      this._eBullets(ctx, world);
      this._enemies(ctx, world);
      this._pBullets(ctx, world);
      this._orbits(ctx, world);
      this._player(ctx, world);
      this._particles(ctx, world);
    }
    ctx.restore();

    if (!extra.title) {
      if (world.killFlash > 0) {
        ctx.fillStyle = `rgba(255,230,120,${world.killFlash * 0.06})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (world.stats.iFrame > 0 && world.stats.flash > 0) {
        ctx.fillStyle = `rgba(255,80,100,${world.stats.flash * 0.08})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (world.bossWarningPlayed && !world.bossSpawned) {
        this._warning(ctx, w, h);
      }
      this._minimapHint(ctx, world, extra.fps);
    }
    if (extra.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX
   * @param {number} camY
   * @param {number} w
   * @param {number} h
   */
  _grid(ctx, camX, camY, w, h) {
    const step = 64;
    const x0 = Math.floor(camX / step) * step;
    const y0 = Math.floor(camY / step) * step;
    ctx.strokeStyle = 'rgba(80, 100, 160, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x < camX + w + step; x += step) {
      ctx.moveTo(x, camY - 2);
      ctx.lineTo(x, camY + h + 2);
    }
    for (let y = y0; y < camY + h + step; y += step) {
      ctx.moveTo(camX - 2, y);
      ctx.lineTo(camX + w + 2, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(90, 220, 255, 0.05)';
    const cx = Math.round(camX / (step * 4)) * step * 4;
    const cy = Math.round(camY / (step * 4)) * step * 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 180, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./world.js').World} world
   */
  _player(ctx, world) {
    const p = world.stats;
    const blink = p.iFrame > 0 && Math.floor(this.t * 18) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.35;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.shadowColor = '#7ef9ff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#e8ffff';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-11, 10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-11, -10);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#7ef9ff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-8, 5);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-8, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;

    const ratio = p.hp / p.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(p.x - 16, p.y + 16, 32, 4);
    ctx.fillStyle = ratio > 0.35 ? '#7ef9ff' : '#ff5d73';
    ctx.fillRect(p.x - 16, p.y + 16, 32 * ratio, 4);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./world.js').World} world
   */
  _orbits(ctx, world) {
    const p = world.stats;
    if (p.orbitCount <= 0) return;
    const radius = 42 + p.orbitCount * 8;
    ctx.fillStyle = '#ffe566';
    ctx.shadowColor = '#ffe566';
    ctx.shadowBlur = 10;
    for (let i = 0; i < p.orbitCount; i += 1) {
      const a = p.orbitAngle + (i / p.orbitCount) * Math.PI * 2;
      const x = p.x + Math.cos(a) * radius;
      const y = p.y + Math.sin(a) * radius;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-5, 5);
      ctx.lineTo(-5, -5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./world.js').World} world
   */
  _enemies(ctx, world) {
    for (let i = 0; i < world.enemies.length; i += 1) {
      const e = world.enemies[i];
      if (!e.alive) continue;
      if (Math.abs(e.x - world.camX) > this.w * 0.7 || Math.abs(e.y - world.camY) > this.h * 0.7) continue;
      const def = CONFIG.enemies[e.kind];
      const flash = e.flash > 0;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.kind === 'boss' ? e.angle : e.angle || 0);
      ctx.fillStyle = flash ? '#ffffff' : def.color;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = e.kind === 'boss' ? 24 : 8;
      if (e.kind === 'grunt') {
        ctx.beginPath();
        ctx.arc(0, 0, e.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'spreader') {
        ctx.beginPath();
        ctx.moveTo(0, -e.r);
        ctx.lineTo(e.r, 0);
        ctx.lineTo(0, e.r);
        ctx.lineTo(-e.r, 0);
        ctx.closePath();
        ctx.fill();
      } else if (e.kind === 'spiral') {
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const a = (k / 6) * Math.PI * 2;
          const fn = k === 0 ? ctx.moveTo : ctx.lineTo;
          fn.call(ctx, Math.cos(a) * e.r, Math.sin(a) * e.r);
        }
        ctx.closePath();
        ctx.fill();
      } else if (e.kind === 'tank') {
        ctx.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-e.r + 4, -e.r + 4, e.r * 2 - 8, e.r * 2 - 8);
      } else if (e.kind === 'dasher') {
        if (e.state === 1) {
          ctx.strokeStyle = 'rgba(128,237,153,0.7)';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(80, 0);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(e.r + 2, 0);
        ctx.lineTo(-e.r, e.r * 0.85);
        ctx.lineTo(-e.r * 0.4, 0);
        ctx.lineTo(-e.r, -e.r * 0.85);
        ctx.closePath();
        ctx.fill();
      } else if (e.kind === 'boss') {
        ctx.strokeStyle = flash ? '#fff' : '#ffd166';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 8 + Math.sin(this.t * 3) * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        for (let k = 0; k < 8; k += 1) {
          const a = (k / 8) * Math.PI * 2;
          const rr = k % 2 === 0 ? e.r : e.r * 0.62;
          const fn = k === 0 ? ctx.moveTo : ctx.lineTo;
          fn.call(ctx, Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#14000a';
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (e.kind === 'boss' || e.maxHp >= 80) {
        const bw = e.kind === 'boss' ? 86 : 28;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw, 4);
        ctx.fillStyle = e.kind === 'boss' ? '#ffd166' : '#ff8fab';
        ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw * (e.hp / e.maxHp), 4);
      }
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./world.js').World} world
   */
  _pBullets(ctx, world) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffe566';
    ctx.shadowColor = '#ffe566';
    ctx.shadowBlur = 10;
    for (let i = 0; i < world.pBullets.length; i += 1) {
      const b = world.pBullets[i];
      if (!b.alive) continue;
      const ang = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.ellipse(0, 0, b.r * 2.4, b.r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./world.js').World} world
   */
  _eBullets(ctx, world) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < world.eBullets.length; i += 1) {
      const b = world.eBullets[i];
      if (!b.alive) continue;
      ctx.fillStyle = b.color || '#ff6b9d';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(1.4, b.r * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./world.js').World} world
   */
  _gems(ctx, world) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#5dff7a';
    ctx.shadowColor = '#5dff7a';
    ctx.shadowBlur = 12;
    for (let i = 0; i < world.gems.length; i += 1) {
      const g = world.gems[i];
      if (!g.alive) continue;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(this.t * 2 + g.x * 0.01);
      ctx.beginPath();
      ctx.moveTo(0, -g.r - 1);
      ctx.lineTo(g.r, 0);
      ctx.lineTo(0, g.r + 1);
      ctx.lineTo(-g.r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./world.js').World} world
   */
  _particles(ctx, world) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < world.particles.length; i += 1) {
      const q = world.particles[i];
      if (!q.alive) continue;
      const a = Math.max(0, q.life / q.maxLife);
      ctx.globalAlpha = a;
      ctx.strokeStyle = q.color;
      ctx.fillStyle = q.color;
      if (q.ring) {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r + (1 - a) * 22, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r * (0.6 + a), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   */
  _warning(ctx, w, h) {
    const pulse = 0.45 + Math.sin(this.t * 8) * 0.25;
    ctx.fillStyle = `rgba(255, 40, 80, ${pulse * 0.12})`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = `rgba(255, 210, 80, ${0.7 + Math.sin(this.t * 10) * 0.3})`;
    ctx.font = '700 42px Orbitron, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WARNING', w / 2, 92);
    ctx.font = '700 16px "Zen Kaku Gothic New", sans-serif';
    ctx.fillText('プリズムオーバーロード接近', w / 2, 120);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./world.js').World} world
   * @param {number} fps
   */
  _minimapHint(ctx, world, fps) {
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(220,235,255,0.75)';
    ctx.textAlign = 'right';
    ctx.fillText(`${fps | 0} FPS`, this.w - 16, this.h - 42);
    if (world.combo >= 4) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe566';
      ctx.font = '700 18px Orbitron, sans-serif';
      ctx.fillText(`${world.combo} HIT`, this.w / 2, 64);
    }
  }
}
