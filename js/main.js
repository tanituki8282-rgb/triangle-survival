/**
 * エントリ。Canvas を取得してゲームを起動する。
 */
import { Game } from './game.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const game = new Game(canvas);
game.start();
