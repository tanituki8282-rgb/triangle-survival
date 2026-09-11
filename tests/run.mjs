/**
 * Node から呼べる純粋ロジックの回帰テスト。
 */
import { circlesOverlap, dist2, RNG, SpatialHash, xpToNext } from '../js/math.js';
import { applyUpgrade, rollChoices, UPGRADES } from '../js/upgrades.js';
import { CONFIG } from '../js/config.js';
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

const choices = rollChoices({ rapid: 6, power: 6, spread: 5, pierce: 4, mobility: 5, armor: 6, magnet: 5, orbit: 4, nova: 4, vamp: 3, velocity: 4, regen: 4 }, new RNG(3), 3);
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
assert('vacuum collects distant gem xp', vac.xp > 0 || vac.level > 1 || vac.pendingLevels > 0);

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
