/**
 * DOM HUD／タイトル／レベルアップ／リザルト。
 * Canvas 上の文字情報を読みやすく重ねる。
 */

/**
 * @param {number} sec
 * @returns {string}
 */
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export class UI {
  constructor() {
    this.title = document.getElementById('title-screen');
    this.levelup = document.getElementById('levelup-screen');
    this.result = document.getElementById('result-screen');
    this.pause = document.getElementById('pause-screen');
    this.hud = document.getElementById('hud');
    this.hpFill = document.getElementById('hp-fill');
    this.xpFill = document.getElementById('xp-fill');
    this.hpText = document.getElementById('hp-text');
    this.lvText = document.getElementById('lv-text');
    this.timeText = document.getElementById('time-text');
    this.killText = document.getElementById('kill-text');
    this.vacuumText = document.getElementById('vacuum-text');
    this.cards = document.getElementById('upgrade-cards');
    this.bossBar = document.getElementById('boss-bar');
    this.bossFill = document.getElementById('boss-fill');
    this.muteBtn = document.getElementById('mute-btn');
  }

  /**
   * @param {'title'|'play'|'levelup'|'pause'|'result'} mode
   */
  setMode(mode) {
    this.title.classList.toggle('hidden', mode !== 'title');
    this.levelup.classList.toggle('hidden', mode !== 'levelup');
    this.result.classList.toggle('hidden', mode !== 'result');
    this.pause.classList.toggle('hidden', mode !== 'pause');
    this.hud.classList.toggle('hidden', mode === 'title');
  }

  /**
   * @param {import('./world.js').World} world
   */
  updateHud(world) {
    const p = world.stats;
    const hpPct = Math.max(0, p.hp / p.maxHp) * 100;
    const xpPct = (world.xp / world.xpNeed) * 100;
    this.hpFill.style.width = `${hpPct}%`;
    this.xpFill.style.width = `${xpPct}%`;
    this.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    this.lvText.textContent = `Lv ${world.level}`;
    this.timeText.textContent = formatTime(world.time);
    this.killText.textContent = `${world.kills}`;
    if (this.vacuumText) {
      const full = (p.vacuum || 0) > 0;
      const timed = (p.vacuumTimer || 0) > 0;
      this.vacuumText.classList.toggle('hidden', !full && !timed);
      if (full) this.vacuumText.textContent = 'VACUUM';
      else if (timed) this.vacuumText.textContent = `VACUUM ${Math.ceil(p.vacuumTimer)}`;
    }

    let boss = null;
    for (let i = 0; i < world.enemies.length; i += 1) {
      const e = world.enemies[i];
      if (e.alive && e.kind === 'boss') {
        boss = e;
        break;
      }
    }
    if (boss) {
      this.bossBar.classList.remove('hidden');
      this.bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
    } else {
      this.bossBar.classList.add('hidden');
    }
  }

  /**
   * @param {import('./upgrades.js').UpgradeDef[]} choices
   * @param {(def: import('./upgrades.js').UpgradeDef) => void} onPick
   * @param {import('./world.js').World} world
   */
  showChoices(choices, onPick, world) {
    this.cards.innerHTML = '';
    choices.forEach((def, idx) => {
      const info = world.describeChoice(def);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card';
      btn.innerHTML = `<span class="key">${idx + 1}</span><span class="glyph">${def.glyph}</span><strong>${def.name}</strong><span class="rank">RANK ${info.rank}→${info.nextRank} / ${info.max}</span><p>${def.desc}</p><p class="delta">${info.deltaText}</p>`;
      btn.addEventListener('click', () => onPick(def));
      this.cards.appendChild(btn);
    });
  }

  /**
   * @param {import('./world.js').World} world
   */
  showResult(world) {
    document.getElementById('result-title').textContent = world.victory
      ? 'エリア掃討'
      : '機体喪失';
    document.getElementById('result-sub').textContent = world.victory
      ? 'プリズムオーバーロードを撃破した'
      : '弾幕の海に沈んだ';
    document.getElementById('stat-time').textContent = formatTime(world.time);
    document.getElementById('stat-kills').textContent = String(world.kills);
    document.getElementById('stat-level').textContent = String(world.level);
    document.getElementById('stat-score').textContent = String(world.score);
    this.result.classList.toggle('win', world.victory);
    this.result.classList.toggle('lose', !world.victory);
  }

  /**
   * @param {boolean} muted
   */
  setMuted(muted) {
    this.muteBtn.textContent = muted ? 'SE OFF' : 'SE ON';
    this.muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }
}
