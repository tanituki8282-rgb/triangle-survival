/**
 * 画面状態とゲームループ。タイトル〜リザルトまでを繋ぐ。
 */

import { World } from './world.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { AudioSynth } from './audio.js';
import { UI } from './ui.js';
import { CONFIG } from './config.js';

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.input = new Input();
    this.audio = new AudioSynth();
    this.ui = new UI();
    /** @type {World} */
    this.world = new World();
    /** @type {'title'|'play'|'levelup'|'pause'|'result'} */
    this.mode = 'title';
    this._timeScale = 1;
    this.last = 0;
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    /** @type {import('./upgrades.js').UpgradeDef[]} */
    this.choices = [];
    this.raf = 0;
    const q = new URLSearchParams(window.location.search);
    this._debug = q.get('debug') === '1';

    this._onResize = () => {
      this.renderer.resize();
      this.world.setView(this.renderer.w, this.renderer.h);
    };
  }

  start() {
    this.input.bind();
    this.renderer.resize();
    this.world.setView(this.renderer.w, this.renderer.h);
    window.addEventListener('resize', this._onResize);
    this.ui.setMode('title');
    this.ui.muteBtn.addEventListener('click', () => {
      this.audio.resume();
      this.ui.setMuted(this.audio.toggleMute());
    });
    document.getElementById('btn-start').addEventListener('click', () => this.beginRun());
    document.getElementById('btn-retry').addEventListener('click', () => this.beginRun());
    document.getElementById('btn-title').addEventListener('click', () => this.toTitle());
    document.getElementById('btn-resume').addEventListener('click', () => {
      this.mode = 'play';
      this.ui.setMode('play');
    });
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  beginRun() {
    this.audio.resume();
    this.audio.ui();
    this.world = new World();
    this.world.setView(this.renderer.w, this.renderer.h);
    this._applyDebugFlags(this.world);
    this.mode = 'play';
    this.ui.setMode('play');
    this.choices = [];
  }

  /**
   * 検証用クエリ。本番プレイでは使わない。
   * ?god=1 無敵 / ?boss=1 即ボス / ?fast=3 時間加速
   * @param {World} world
   */
  _applyDebugFlags(world) {
    const q = new URLSearchParams(window.location.search);
    this._timeScale = Math.max(1, Number(q.get('fast') || 1) || 1);
    this._debug = q.get('debug') === '1';
    if (q.get('god') === '1') {
      world.god = true;
      world.stats.maxHp = 9999;
      world.stats.hp = 9999;
    }
    if (q.get('boss') === '1') {
      world.time = CONFIG.bossTime;
    }
  }

  toTitle() {
    this.audio.ui();
    this.mode = 'title';
    this.ui.setMode('title');
  }

  /**
   * @param {number} now
   */
  frame(now) {
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, raw);
    this._fpsAcc += raw;
    this._fpsFrames += 1;
    if (this._fpsAcc >= 0.4) {
      this.fps = this._fpsFrames / this._fpsAcc;
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }

    this._handleHotkeys();

    if (this.mode === 'play') {
      this.world.update(dt * (this._timeScale || 1), this.input.moveAxis());
      this._consumeEvents();
      this.ui.updateHud(this.world);
      if (this.world.victory || this.world.aftermath > 0) {
        if (this.world.over) this._enterResult();
      } else if (this.world.pendingLevels > 0) {
        this._enterLevelUp();
      } else if (this.world.over) {
        this._enterResult();
      }
    } else if (this.mode === 'levelup') {
      this._handleLevelKeys();
    }

    const paused = this.mode !== 'play';
    if (this.mode !== 'title') {
      this.renderer.draw(this.world, dt, {
        fps: this.fps,
        paused,
        levelup: this.mode === 'levelup',
        showFps: this._debug,
        hideBullets: this.mode === 'levelup',
        fade: this.world.fade || 0,
      });
    } else {
      this._drawTitleBg(dt);
    }

    this.input.endFrame();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * タイトルは静かなグリッドだけ動かして世界観を出す。
   * @param {number} dt
   */
  _drawTitleBg(dt) {
    const dummy = this.world;
    dummy.camX += dt * 12;
    dummy.camY += dt * 8;
    dummy.shake = 0;
    dummy.killFlash = 0;
    dummy.stats.iFrame = 0;
    dummy.stats.flash = 0;
    dummy.combo = 0;
    this.renderer.draw(dummy, dt, { fps: this.fps, paused: true, title: true });
  }

  _handleHotkeys() {
    if (this.mode === 'title' && (this.input.just('enter') || this.input.just(' ') || this.input.just('space'))) {
      this.beginRun();
      return;
    }
    if (this.mode === 'play' && (this.input.just('escape') || this.input.just('p'))) {
      this.mode = 'pause';
      this.ui.setMode('pause');
      this.audio.ui();
      return;
    }
    if (this.mode === 'pause' && (this.input.just('escape') || this.input.just('p') || this.input.just('enter'))) {
      this.mode = 'play';
      this.ui.setMode('play');
      return;
    }
    if (this.mode === 'result' && (this.input.just('enter') || this.input.just('r'))) {
      this.beginRun();
    }
    if (this.input.just('m')) {
      this.audio.resume();
      this.ui.setMuted(this.audio.toggleMute());
    }
  }

  _handleLevelKeys() {
    for (let i = 0; i < this.choices.length; i += 1) {
      if (this.input.just(String(i + 1))) {
        this._pick(this.choices[i]);
        return;
      }
    }
  }

  _enterLevelUp() {
    if (this.world.victory || this.world.aftermath > 0) {
      this.world.pendingLevels = 0;
      return;
    }
    this.choices = this.world.rollLevelChoices();
    if (this.choices.length === 0) {
      this.world.pendingLevels = 0;
      return;
    }
    this.mode = 'levelup';
    this.ui.setMode('levelup');
    this.ui.showChoices(this.choices, (def) => this._pick(def), this.world);
    this.audio.levelUp();
  }

  /**
   * @param {import('./upgrades.js').UpgradeDef} def
   */
  _pick(def) {
    this.world.pickUpgrade(def);
    this.audio.ui();
    if (this.world.pendingLevels > 0) {
      this._enterLevelUp();
    } else {
      this.mode = 'play';
      this.ui.setMode('play');
    }
  }

  _enterResult() {
    this.mode = 'result';
    this.ui.setMode('result');
    this.ui.showResult(this.world);
    this.ui.updateHud(this.world);
  }

  _consumeEvents() {
    const ev = this.world.drainEvents();
    for (let i = 0; i < ev.length; i += 1) {
      const name = ev[i];
      if (name === 'shoot') this.audio.shoot();
      else if (name === 'explode') this.audio.explosion(false);
      else if (name === 'bossKill') this.audio.explosion(true);
      else if (name === 'hurt') this.audio.hurt();
      else if (name === 'gem') this.audio.gem();
      else if (name === 'vacuum') this.audio.gem();
      else if (name === 'warning') this.audio.warning();
      else if (name === 'boss') this.audio.warning();
      else if (name === 'death') this.audio.death();
      else if (name === 'victory') this.audio.victory();
      else if (name === 'nova') this.audio.shoot();
    }
  }
}
