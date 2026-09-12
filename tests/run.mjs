/**
 * Node から呼べる純粋ロジックの回帰テスト。
 */
import { circlesOverlap, dist2, RNG, SpatialHash, xpToNext } from '../js/math.js';
import { applyUpgrade, describeNova, describeOrbit, describeUpgrade, rollChoices, UPGRADES } from '../js/upgrades.js';
import { CONFIG, FAUCET, KIND_CAPS } from '../js/config.js';
import { World } from '../js/world.js';

let failed = 0;
let passed = 0;

/**
 * @param {string} name
 * @param {boolean} cond
 */
function assert(name, cond) {
  if (cond) {
    passed += 1;
    console.log(`ok  ${name}`);
  } else {
    failed += 1;
    console.error(`NG  ${name}`);
  }
}

assert('circles overlap when touching', circlesOverlap(0, 0, 5, 10, 0, 5));
assert('circles miss when far', !circlesOverlap(0, 0, 5, 20, 0, 5));
assert('dist2 origin', dist2(0, 0, 3, 4) === 25);
assert('xp grows', xpToNext(3, 6, 1.28) > xpToNext(1, 6, 1.28));

const rng = new RNG(1);
const a = rng.next();
const rng2 = new RNG(1);
assert('rng deterministic', a === rng2.next());

const hash = new SpatialHash(32);
hash.insert({ x: 10, y: 10, r: 8, id: 1 });
let found = 0;
hash.query(12, 12, 10, () => {
  found += 1;
});
assert('spatial hash hits nearby', found >= 1);

const ranks = {};
const stats = {
  fireInterval: 0.2,
  bulletDamage: 10,
  projectileCount: 1,
  pierce: 0,
  speed: 255,
  maxHp: 100,
  hp: 80,
  magnet: 96,
  vacuum: 0,
  orbitCount: 0,
  novaLevel: 0,
  lifesteal: 0,
  bulletSpeed: 560,
  bulletLife: 0.85,
  regen: 0,
};
const power = UPGRADES.find((u) => u.id === 'power');
applyUpgrade(stats, power, ranks);
assert('power raises damage', stats.bulletDamage > 10);
assert('rank recorded', ranks.power === 1);

const choices = rollChoices({ rapid: 6, power: 6, spread: 5, pierce: 4, mobility: 5, armor: 6, magnet: 5, vacuum: 1, orbit: 4, nova: 4, vamp: 3, velocity: 4, regen: 4 }, new RNG(3), 3);
assert('empty when maxed', choices.length === 0);

const world = new World(42);
world.setView(1280, 720);
world.spawnEnemy('grunt', 80, 0);
assert('spawn increments count', world.enemyCount === 1);
const grunt = world.enemies.find((e) => e.alive);
world._damageEnemy(grunt, 999, 80, 0);
assert('kill increments', world.kills === 1);
assert('xp pending or gems', world.xp > 0 || world.gems.some((g) => g.alive));

world.stats.x = 0;
world.stats.y = 0;
world.stats.iFrame = 0;
world._hurt(30, 10, 0);
assert('hurt reduces hp', world.stats.hp === CONFIG.player.maxHp - 30);
assert('iframe granted', world.stats.iFrame > 0);
assert('hurt knockback separates pile', world.stats.x < -40);

world.pendingLevels = 0;
world.xp = 0;
world.level = 1;
world.xpNeed = xpToNext(1, CONFIG.xp.base, CONFIG.xp.growth);
world._addXp(world.xpNeed);
assert('level up queues choice', world.level === 2 && world.pendingLevels === 1);

const w2 = new World(7);
w2.setView(800, 600);
const pos = w2._spawnPos();
const far = Math.hypot(pos.x - w2.stats.x, pos.y - w2.stats.y) > 300;
assert('spawn outside view-ish', far);

w2.stats.projectileCount = 3;
w2._firePlayer(0);
const shots = w2.pBullets.filter((b) => b.alive).length;
assert('spread fires 3', shots === 3);

const vac = new World(5);
vac.setView(1280, 720);
vac.spawnEnemy('grunt', 220, 40);
const farGrunt = vac.enemies.find((e) => e.alive);
vac._killEnemy(farGrunt);
for (let i = 0; i < 90; i += 1) {
  vac.update(1 / 60, { x: 0, y: 0 });
}
assert('default does not vacuum distant gems', vac.gems.some((g) => g.alive && g.kind !== 'vacuum'));
assert('distant gem not auto collected', vac.xp === 0 && vac.level === 1 && vac.pendingLevels === 0);

const vacOn = new World(5);
vacOn.setView(1280, 720);
vacOn.stats.vacuum = 1;
vacOn.spawnEnemy('grunt', 220, 40);
vacOn._killEnemy(vacOn.enemies.find((e) => e.alive));
for (let i = 0; i < 90; i += 1) {
  vacOn.update(1 / 60, { x: 0, y: 0 });
}
assert('vacuum upgrade collects distant gems', vacOn.xp > 0 || vacOn.level > 1 || vacOn.pendingLevels > 0);

const aged = new World(9);
aged.setView(1280, 720);
aged._spawnGem(420, 0, 3, 'xp');
const agedGem = aged.gems.find((g) => g.alive);
agedGem.age = 30;
for (let i = 0; i < 45; i += 1) {
  aged.update(1 / 60, { x: 0, y: 0 });
}
const stillAged = aged.gems.find((g) => g.alive && g.kind === 'xp');
assert('aged gems stay put without vacuum', stillAged && Math.abs(stillAged.x - 420) < 40);

const core = new World(6);
core.setView(800, 600);
core._spawnGem(16, 0, 0, 'vacuum');
for (let i = 0; i < 20; i += 1) {
  core.update(1 / 60, { x: 0, y: 0 });
}
assert('vacuum core grants timed vacuum', core.stats.vacuumTimer > 10);

const smoke = new World(99);
smoke.setView(1280, 720);
let threw = false;
try {
  for (let i = 0; i < 120; i += 1) {
    smoke.update(1 / 60, { x: 1, y: 0 });
  }
} catch (err) {
  threw = true;
  console.error(err);
}
assert('2s sim does not throw', !threw);
assert('2s sim spawned something', smoke.enemyCount > 0 || smoke.kills > 0);
assert('player still alive early', smoke.stats.hp > 0);

const late = new World(123);
late.setView(1280, 720);
late.god = true;
late.stats.bulletDamage = 80;
for (let i = 0; i < 108 * 60; i += 1) {
  late.update(1 / 60, { x: Math.sin(i / 40), y: Math.cos(i / 55) });
}
assert('boss spawned near 105s', late.bossSpawned);
assert('warning fired', late.bossWarningPlayed);

const rapid = UPGRADES.find((u) => u.id === 'rapid');
const info = describeUpgrade(rapid, {
  fireInterval: 0.2,
  bulletDamage: 10,
  projectileCount: 1,
  pierce: 0,
  speed: 255,
  maxHp: 120,
  hp: 120,
  magnet: 78,
  vacuum: 0,
  orbitCount: 0,
  novaLevel: 0,
  lifesteal: 0,
  bulletSpeed: 560,
  bulletLife: 0.85,
  regen: 0.7,
}, {});
assert('card shows rank 0 to 1', info.rank === 0 && info.nextRank === 1);
assert('rapid delta has seconds', info.deltaText.includes('0.20s') && info.deltaText.includes('→'));

let spotlight = 0;
for (let i = 0; i < 40; i += 1) {
  const c = rollChoices({}, new RNG(1000 + i), 3, 2);
  if (c.some((u) => u.id === 'orbit' || u.id === 'nova')) spotlight += 1;
}
assert('early rolls often include orbit or nova', spotlight >= 22);

const arena = new World(8);
arena.setView(1280, 720);
arena._spawnEBullet(10, 0, 0, 40, 4, '#ff4a2a', 9);
assert('pre-boss bullets exist', arena.eBullets.some((b) => b.alive));
arena._spawnBoss();
assert('boss spawn clears bullets', !arena.eBullets.some((b) => b.alive));
assert('boss grace window', arena.bossGrace >= 2);
assert('iframe on boss spawn', arena.stats.iFrame > 0);

const fl = new World(3);
fl.setView(800, 600);
const g = fl.spawnEnemy('grunt', 40, 0);
fl._damageEnemy(g, 1, 0, 0);
assert('hit flinch', g.alive && g.flinch > 0);

const after = new World(4);
after.setView(1280, 720);
const boss = after.spawnEnemy('boss', 80, 0);
after._killEnemy(boss);
assert('boss kill delays result', after.victory && !after.over && after.aftermath > 0);
for (let i = 0; i < 160; i += 1) after.update(1 / 60, { x: 0, y: 0 });
assert('aftermath then over', after.over && after.victory);

const dens = new World(21);
dens.setView(1280, 720);
dens.god = true;
for (let i = 0; i < 60 * 60; i += 1) {
  dens.update(1 / 60, { x: Math.sin(i / 30) * 0.4, y: Math.cos(i / 40) * 0.4 });
  while (dens.pendingLevels > 0) {
    const c = dens.rollLevelChoices();
    if (!c[0]) break;
    dens.pickUpgrade(c[0]);
  }
}
assert('one-minute crowd', dens.kills + dens.enemyCount >= 90);

const warn = new World(31);
warn.setView(1280, 720);
warn.god = true;
warn.spawnEnemy('spiral', 90, 0);
warn.spawnEnemy('spreader', 70, 30);
warn._spawnEBullet(0, 0, 0, 80, 4, '#ff4a2a', 9);
warn.time = CONFIG.bossTime - CONFIG.bossWarning - 0.05;
let warnBullets = 0;
for (let i = 0; i < 3.5 * 60; i += 1) {
  warn.update(1 / 60, { x: 0, y: 0 });
  if (warn.bossWarningPlayed && !warn.bossSpawned) {
    warnBullets = Math.max(warnBullets, warn.eBullets.filter((b) => b.alive).length);
  }
}
assert('warning window started', warn.bossWarningPlayed && !warn.bossSpawned);
assert('zero enemy bullets during warning', warnBullets === 0);

const lock = new World(32);
lock.setView(1280, 720);
lock.god = true;
lock.time = CONFIG.bossTime;
lock.update(1 / 60, { x: 0, y: 0 });
assert('debug-like immediate lock', lock.bossWarningPlayed && (lock.bossSpawned || lock.bossGrace > 0));
assert('immediate lock has no ebullets', !lock.eBullets.some((b) => b.alive));

const flavorOrbit = describeOrbit(0, 1);
const flavorNova = describeNova(0, 1);
assert('orbit flavor has blades and radius', flavorOrbit.includes('本') && flavorOrbit.includes('半径'));
assert('nova flavor has shots and period', flavorNova.includes('発') && flavorNova.includes('周期'));
const orbitCard = describeUpgrade(UPGRADES.find((u) => u.id === 'orbit'), {
  fireInterval: 0.2,
  bulletDamage: 10,
  projectileCount: 1,
  pierce: 0,
  speed: 255,
  maxHp: 120,
  hp: 120,
  magnet: 78,
  vacuum: 0,
  orbitCount: 0,
  novaLevel: 0,
  lifesteal: 0,
  bulletSpeed: 560,
  bulletLife: 0.85,
  regen: 0.7,
}, {});
assert('orbit card not just 0→1', orbitCard.deltaText.includes('刃') && orbitCard.deltaText.includes('半径'));

const vacCard = describeUpgrade(UPGRADES.find((u) => u.id === 'vacuum'), {
  fireInterval: 0.2,
  bulletDamage: 10,
  projectileCount: 1,
  pierce: 0,
  speed: 255,
  maxHp: 120,
  hp: 120,
  magnet: 78,
  vacuum: 0,
  orbitCount: 0,
  novaLevel: 0,
  lifesteal: 0,
  bulletSpeed: 560,
  bulletLife: 0.85,
  regen: 0.7,
}, {});
assert('vacuum card shows ON', vacCard.deltaText.includes('OFF→ON'));

const after2 = new World(5);
after2.setView(1280, 720);
const boss2 = after2.spawnEnemy('boss', 80, 0);
after2._killEnemy(boss2);
after2._addXp(999);
assert('aftermath blocks level queue', after2.pendingLevels === 0 && after2.victory);
for (let i = 0; i < 20; i += 1) after2.update(1 / 60, { x: 0, y: 0 });
assert('aftermath still no level queue', after2.pendingLevels === 0 && !after2.over);

const bossRun = new World(44);
bossRun.setView(1280, 720);
bossRun.god = true;
bossRun.time = CONFIG.bossTime;
for (let i = 0; i < 8 * 60; i += 1) {
  bossRun.update(1 / 60, { x: 0.2, y: 0 });
}
assert('boss fight trash capped', bossRun.kindCounts.grunt <= 8);
assert('few elites in boss', bossRun.kindCounts.spreader <= 2 && bossRun.kindCounts.spiral <= 1);

assert('grunt contact hurts on mistake', CONFIG.enemies.grunt.contact >= 6);
assert('dasher pressure raised', CONFIG.enemies.dasher.contact >= 8 && KIND_CAPS.dasher >= 6);
assert('iframe shorter than pile-melt patch', CONFIG.player.iFrame <= 0.75 && CONFIG.player.iFrame >= 0.5);
assert('default magnet is local', CONFIG.player.magnet <= 90);
assert('no age-based map vacuum', CONFIG.xp.vacuumAge == null);

/**
 * 近くの敵の重心から逃げつつ円を描く。平均的なカイト操作の近似。
 * @param {World} w
 * @param {number} i
 * @returns {{x: number, y: number}}
 */
function kiteInput(w, i) {
  const p = w.stats;
  let cx = 0;
  let cy = 0;
  let wsum = 0;
  for (let ei = 0; ei < w.enemies.length; ei += 1) {
    const e = w.enemies[ei];
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 240 && d > 0.1) {
      const wt = 1 / d;
      cx += e.x * wt;
      cy += e.y * wt;
      wsum += wt;
    }
  }
  if (wsum <= 0) {
    return { x: Math.sin(i / 40), y: Math.cos(i / 55) };
  }
  cx /= wsum;
  cy /= wsum;
  let dx = p.x - cx;
  let dy = p.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  return { x: dx * 0.82 - dy * 0.52, y: dy * 0.82 + dx * 0.52 };
}

/**
 * @param {World} w
 */
function drainLevelUps(w) {
  while (w.pendingLevels > 0) {
    const c = w.rollLevelChoices();
    if (!c[0]) break;
    w.pickUpgrade(c[0]);
  }
}

const survivalSeeds = [3, 11, 21, 42, 77, 99];
let survivedMinute = 0;
for (let s = 0; s < survivalSeeds.length; s += 1) {
  const run = new World(survivalSeeds[s]);
  run.setView(1280, 720);
  let alive = true;
  for (let i = 0; i < 60 * 60; i += 1) {
    run.update(1 / 60, kiteInput(run, i));
    drainLevelUps(run);
    if (run.over || run.stats.hp <= 0) {
      alive = false;
      break;
    }
  }
  if (alive) survivedMinute += 1;
}
assert('average kiting survives about 60s', survivedMinute >= 5);

const pile = new World(2);
pile.setView(1280, 720);
for (let i = 0; i < 24; i += 1) {
  const a = (i / 24) * Math.PI * 2;
  pile.spawnEnemy('grunt', Math.cos(a) * 14, Math.sin(a) * 14);
}
for (let i = 0; i < 3; i += 1) {
  pile.spawnEnemy('dasher', 18 + i * 6, 0);
}
for (let i = 0; i < 12 * 60; i += 1) {
  pile.update(1 / 60, kiteInput(pile, i));
  drainLevelUps(pile);
}
assert('contact pile does not melt in 12s', pile.stats.hp > 0 && !pile.over);

const p3 = new World(8);
p3.setView(1280, 720);
p3.god = true;
p3.bossGrace = 0;
const bossBody = p3.spawnEnemy('boss', 0, -200);
bossBody.hp = bossBody.maxHp * 0.2;
bossBody.stateT = 0;
p3._updateBoss(bossBody, 1 / 60);
const p3n = p3.eBullets.filter((b) => b.alive).length;
assert('phase3 ring is a readable staircase', p3n <= 12 && p3n >= 8);

const quiet = new World(12);
quiet.setView(800, 600);
let quietPeak = 0;
for (let i = 0; i < 6; i += 1) {
  const gq = quiet.spawnEnemy('grunt', 40 + i * 8, 0);
  quiet._killEnemy(gq);
  quietPeak = Math.max(quietPeak, quiet.shake);
}
for (let i = 0; i < 20; i += 1) {
  quiet.update(1 / 60, { x: 0, y: 0 });
  quietPeak = Math.max(quietPeak, quiet.shake);
}
assert('normal kills barely shake', quietPeak < 1);

const spike = new World(13);
spike.setView(800, 600);
let spikePeak = 0;
for (let i = 0; i < 10; i += 1) {
  const gs = spike.spawnEnemy('grunt', 50, i * 4);
  spike._killEnemy(gs);
  spikePeak = Math.max(spikePeak, spike.shake);
}
assert('combo spike can shake a little', spikePeak >= CONFIG.camera.shakeMin && spikePeak <= CONFIG.camera.shakeMax);

const bossShake = new World(14);
bossShake.setView(1280, 720);
bossShake._spawnBoss();
assert('boss spawn shakes briefly', bossShake.shake >= CONFIG.camera.shakeMin && bossShake.shake <= CONFIG.camera.shakeMax);
for (let i = 0; i < 40; i += 1) {
  bossShake.update(1 / 60, { x: 0, y: 0 });
}
assert('boss shake decays quickly', bossShake.shake < 1.5);

const idle = new World(17);
idle.setView(1280, 720);
for (let i = 0; i < 28 * 60; i += 1) {
  idle.update(1 / 60, { x: 0, y: 0 });
  drainLevelUps(idle);
  if (idle.over) break;
}
assert('standing still is not a free first run', idle.stats.hp < CONFIG.player.maxHp - 5 || idle.over);

assert('aimer faucet not a crowd', KIND_CAPS.spreader <= 8);
assert('binder faucet capped', KIND_CAPS.spiral <= 4);
assert('faucet curve is readable', FAUCET.curveTurn > 0.5 && FAUCET.curveTurn < 2.5);

const aimW = new World(10);
aimW.setView(1280, 720);
aimW.spawnCd = 9999;
aimW.stats.x = 0;
aimW.stats.y = 0;
const aimer = aimW.spawnEnemy('spreader', 240, 0);
aimer.shotIndex = 0;
aimW._fireAimer(aimer);
const aimed = aimW.eBullets.find((b) => b.alive);
assert('aimer fires toward player', Boolean(aimed) && aimed.vx < -100 && Math.abs(aimed.vy) < 30);

const stopW = new World(10);
stopW.setView(1280, 720);
stopW.god = true;
stopW.spawnCd = 9999;
stopW.stats.x = 0;
stopW.stats.y = 80;
stopW.stats.iFrame = 99;
stopW.stats.fireCd = 99;
stopW.stats.fireInterval = 99;
const liveAimer = stopW.spawnEnemy('spreader', 220, 0);
liveAimer.fireCd = 0;
liveAimer.telegraph = 0.01;
for (let i = 0; i < 80; i += 1) {
  stopW.update(1 / 60, { x: 0, y: 0 });
}
const aimerPressure = stopW.eBullets.filter((b) => b.alive).length;
assert('leaving aimer alive builds aimed pressure', aimerPressure >= 1);
stopW._killEnemy(liveAimer);
assert('kill cancels aimer telegraph', liveAimer.telegraph === 0 && !liveAimer.alive);
const afterKill = stopW.eBullets.filter((b) => b.alive).length;
for (let i = 0; i < 90; i += 1) {
  stopW.update(1 / 60, { x: 0, y: 0 });
}
const leftover = stopW.eBullets.filter((b) => b.alive).length;
assert('dead aimer adds no new bullets', leftover <= afterKill);

const bindW = new World(12);
bindW.setView(1280, 720);
bindW.stats.x = 0;
bindW.stats.y = 0;
const binder = bindW.spawnEnemy('spiral', 220, 0);
binder.shotIndex = 0;
bindW._fireBinder(binder);
const lanes = bindW.eBullets.filter((b) => b.alive);
assert('binder skip-center volley', lanes.length >= 3 && lanes.length <= 5);
const aimedAtIdle = lanes.some((b) => b.vx < 0 && Math.abs(b.vy) < 10);
assert('binder leaves a stand-still gap', !aimedAtIdle);
bindW._fireBinder(binder);
const fenced = bindW.eBullets.filter((b) => b.alive).length;
assert('binder then fences panic strafe', fenced >= lanes.length + 3);

const tel = new World(11);
tel.setView(800, 600);
const te = tel.spawnEnemy('spiral', 160, 0);
te.telegraph = 0.25;
te.fireCd = 1;
te.state = 1;
tel._killEnemy(te);
assert('kill silences pending telegraph', te.telegraph === 0 && te.state === 0 && !te.alive);

const cw = new World(13);
cw.setView(1280, 720);
cw.stats.x = 0;
cw.stats.y = 0;
cw._spawnEBullet(200, 0, -Math.PI / 2, 120, 4, '#ff7a32', 10, { turn: 2.2, turnLife: 2 });
const cb = cw.eBullets.find((b) => b.alive);
const vx0 = cb.vx;
for (let i = 0; i < 30; i += 1) {
  cw._updateBullets(1 / 60);
}
assert('curve steers toward player', cb.alive && cb.vx < vx0 - 10);

const farB = new World(15);
farB.setView(1280, 720);
farB.god = true;
farB.bossGrace = 0;
const farBody = farB.spawnEnemy('boss', 0, -420);
farBody.stateT = 0;
farBody.hp = farBody.maxHp * 0.9;
let farPeak = 0;
for (let i = 0; i < 5 * 60; i += 1) {
  farB._updateBoss(farBody, 1 / 60);
  farPeak = Math.max(farPeak, farB.eBullets.filter((b) => b.alive).length);
}
assert('boss far range still presses', farPeak >= 6);
assert('boss far stays readable', farPeak <= 48);

const midB = new World(16);
midB.setView(1280, 720);
midB.god = true;
midB.bossGrace = 0;
const midBody = midB.spawnEnemy('boss', 0, -220);
midBody.stateT = 0;
midBody.hp = midBody.maxHp * 0.5;
let midPeak = 0;
for (let i = 0; i < 4 * 60; i += 1) {
  midB._updateBoss(midBody, 1 / 60);
  midPeak = Math.max(midPeak, midB.eBullets.filter((b) => b.alive).length);
}
assert('boss mid range not a cave wall', midPeak <= 56 && midPeak >= 4);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
