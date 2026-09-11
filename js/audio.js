/**
 * Web Audio 合成。外部音声ファイルなしで射撃・爆発・UIを鳴らす。
 */
export class AudioSynth {
  constructor() {
    /** @type {AudioContext | null} */
    this.ac = null;
    /** @type {GainNode | null} */
    this.master = null;
    /** @type {BiquadFilterNode | null} */
    this.filter = null;
    this.muted = false;
    this._shootGate = 0;
    this._expGate = 0;
    this._gemGate = 0;
    /** @type {AudioBuffer | null} */
    this._noise = null;
    this._ambienceStarted = false;
    /** @type {OscillatorNode[]} */
    this._ambNodes = [];
  }

  /**
   * ユーザ操作後に呼ぶ。自動再生ポリシー回避。
   */
  resume() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.22;
      this.filter = this.ac.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 9000;
      this.master.connect(this.filter);
      this.filter.connect(this.ac.destination);
      this._noise = this._makeNoise(this.ac);
    }
    if (this.ac.state === 'suspended') {
      this.ac.resume();
    }
    if (!this._ambienceStarted) {
      this._startAmbience();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ac) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.22, this.ac.currentTime, 0.05);
    }
    return this.muted;
  }

  /**
   * @param {AudioContext} ac
   * @returns {AudioBuffer}
   */
  _makeNoise(ac) {
    const len = ac.sampleRate * 0.4;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  _startAmbience() {
    if (!this.ac || !this.master) return;
    this._ambienceStarted = true;
    const ac = this.ac;
    const types = /** @type {OscillatorType[]} */ (['sine', 'triangle']);
    const freqs = [55, 82.5];
    for (let i = 0; i < freqs.length; i += 1) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = types[i];
      osc.frequency.value = freqs[i];
      g.gain.value = 0.04;
      osc.connect(g);
      g.connect(this.master);
      osc.start();
      this._ambNodes.push(osc);
    }
  }

  /**
   * @param {number} freq
   * @param {number} dur
   * @param {OscillatorType} type
   * @param {number} gain
   * @param {number} [slide]
   */
  _tone(freq, dur, type, gain, slide = 0) {
    if (!this.ac || !this.master || this.muted) return;
    const ac = this.ac;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide !== 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    }
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /**
   * @param {number} dur
   * @param {number} gain
   * @param {number} freq
   */
  _burst(dur, gain, freq) {
    if (!this.ac || !this.master || !this._noise || this.muted) return;
    const ac = this.ac;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = this._noise;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  shoot() {
    const now = performance.now();
    if (now < this._shootGate) return;
    this._shootGate = now + 70;
    this._tone(920 + Math.random() * 280, 0.045, 'square', 0.045, 180);
  }

  explosion(big = false) {
    if (!big) {
      const now = performance.now();
      if (now < this._expGate) return;
      this._expGate = now + 45;
    }
    this._burst(big ? 0.32 : 0.16, big ? 0.55 : 0.28, big ? 220 : 380);
    this._tone(big ? 140 : 210, big ? 0.28 : 0.12, 'sawtooth', big ? 0.12 : 0.06, -80);
  }

  hit() {
    this._tone(240, 0.06, 'triangle', 0.08, -40);
  }

  gem() {
    const now = performance.now();
    if (now < this._gemGate) return;
    this._gemGate = now + 40;
    this._tone(1240, 0.05, 'sine', 0.05, 400);
  }

  hurt() {
    this._burst(0.12, 0.22, 180);
    this._tone(160, 0.18, 'sawtooth', 0.1, -90);
  }

  levelUp() {
    this._tone(523, 0.1, 'square', 0.09);
    setTimeout(() => this._tone(659, 0.1, 'square', 0.09), 80);
    setTimeout(() => this._tone(784, 0.16, 'square', 0.1), 160);
  }

  ui() {
    this._tone(720, 0.06, 'triangle', 0.06);
  }

  warning() {
    this._tone(220, 0.35, 'sawtooth', 0.14, 40);
    setTimeout(() => this._tone(196, 0.4, 'sawtooth', 0.14, -20), 200);
  }

  death() {
    this._tone(330, 0.5, 'sawtooth', 0.16, -220);
    this._burst(0.4, 0.3, 140);
  }

  victory() {
    this._tone(392, 0.14, 'square', 0.1);
    setTimeout(() => this._tone(523, 0.14, 'square', 0.1), 120);
    setTimeout(() => this._tone(659, 0.14, 'square', 0.1), 240);
    setTimeout(() => this._tone(784, 0.28, 'square', 0.12), 360);
  }
}
