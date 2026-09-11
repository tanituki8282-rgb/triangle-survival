/**
 * ベクトル・乱数・円衝突・空間ハッシュ。
 * ホットパス用の純粋関数をまとめる。
 */

/**
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function len(x, y) {
  return Math.hypot(x, y);
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} [eps]
 * @returns {{x: number, y: number}}
 */
export function norm(x, y, eps = 1e-8) {
  const l = Math.hypot(x, y);
  if (l < eps) {
    return { x: 0, y: 0 };
  }
  return { x: x / l, y: y / l };
}

/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {number}
 */
export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} ar
 * @param {number} bx
 * @param {number} by
 * @param {number} br
 * @returns {boolean}
 */
export function circlesOverlap(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * 線形合同法。アップグレード抽選の再現性用。
 */
export class RNG {
  /**
   * @param {number} seed
   */
  constructor(seed) {
    this.s = seed >>> 0;
  }

  /** @returns {number} 0..1 */
  next() {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }

  /**
   * @param {number} a
   * @param {number} b
   * @returns {number}
   */
  range(a, b) {
    return a + (b - a) * this.next();
  }

  /**
   * @param {number} n
   * @returns {number}
   */
  int(n) {
    return (this.next() * n) | 0;
  }

  /**
   * @template T
   * @param {T[]} arr
   * @returns {T}
   */
  pick(arr) {
    return arr[this.int(arr.length)];
  }

  /**
   * @template T
   * @param {T[]} arr
   * @returns {T[]}
   */
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
}

/**
 * 粗い空間ハッシュ。敵を入れて弾・自機から近傍を取る。
 */
export class SpatialHash {
  /**
   * @param {number} cellSize
   */
  constructor(cellSize) {
    this.cellSize = cellSize;
    /** @type {Map<number, object[]>} */
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  /**
   * @param {number} ix
   * @param {number} iy
   * @returns {number}
   */
  _key(ix, iy) {
    return ((ix & 0xffff) << 16) ^ (iy & 0xffff);
  }

  /**
   * @param {object} entity
   */
  insert(entity) {
    const cs = this.cellSize;
    const r = entity.r;
    const minX = Math.floor((entity.x - r) / cs);
    const maxX = Math.floor((entity.x + r) / cs);
    const minY = Math.floor((entity.y - r) / cs);
    const maxY = Math.floor((entity.y + r) / cs);
    for (let iy = minY; iy <= maxY; iy += 1) {
      for (let ix = minX; ix <= maxX; ix += 1) {
        const k = this._key(ix, iy);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = [];
          this.cells.set(k, bucket);
        }
        bucket.push(entity);
      }
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} r
   * @param {(e: object) => void} fn
   */
  query(x, y, r, fn) {
    const cs = this.cellSize;
    const minX = Math.floor((x - r) / cs);
    const maxX = Math.floor((x + r) / cs);
    const minY = Math.floor((y - r) / cs);
    const maxY = Math.floor((y + r) / cs);
    for (let iy = minY; iy <= maxY; iy += 1) {
      for (let ix = minX; ix <= maxX; ix += 1) {
        const bucket = this.cells.get(this._key(ix, iy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 1) {
          fn(bucket[i]);
        }
      }
    }
  }
}

/**
 * 次レベルに必要な累計XPではなく「今のレベルから次までの量」。
 * @param {number} level
 * @param {number} base
 * @param {number} growth
 * @returns {number}
 */
export function xpToNext(level, base, growth) {
  return Math.round(base * Math.pow(growth, Math.max(0, level - 1)));
}
