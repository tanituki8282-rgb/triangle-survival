/**
 * キーボード／ポインタ入力。WASD・矢印・ポーズ・レベルアップ選択。
 */
export class Input {
  constructor() {
    /** @type {Set<string>} */
    this.keys = new Set();
    /** @type {Set<string>} */
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) || k === ' ') {
        e.preventDefault();
      }
      if (!this.keys.has(k)) {
        this.pressed.add(k);
      }
      this.keys.add(k);
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.key.toLowerCase());
    };
    this._onMouseMove = (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    };
    this._onMouseDown = () => {
      this.mouseDown = true;
    };
    this._onMouseUp = () => {
      this.mouseDown = false;
    };
    this._onBlur = () => {
      this.keys.clear();
      this.mouseDown = false;
    };
  }

  bind() {
    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
  }

  /**
   * 1フレーム分の「押し直し」を消費する。
   */
  endFrame() {
    this.pressed.clear();
  }

  /**
   * @param {string} k
   * @returns {boolean}
   */
  down(k) {
    return this.keys.has(k);
  }

  /**
   * @param {string} k
   * @returns {boolean}
   */
  just(k) {
    return this.pressed.has(k);
  }

  /**
   * @returns {{x: number, y: number}}
   */
  moveAxis() {
    let x = 0;
    let y = 0;
    if (this.down('a') || this.down('arrowleft')) x -= 1;
    if (this.down('d') || this.down('arrowright')) x += 1;
    if (this.down('w') || this.down('arrowup')) y -= 1;
    if (this.down('s') || this.down('arrowdown')) y += 1;
    const l = Math.hypot(x, y);
    if (l > 1e-6) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }
}
