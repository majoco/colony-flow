import Phaser from 'phaser';
import { BootScene }    from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { MenuScene }    from './scenes/MenuScene.js';
import { GameScene }    from './scenes/GameScene.js';

// Altura lógica del juego: proporción 9:20 como el juego de referencia (484×1080).
// Ancho fijo 480; altura mínima 1067 (9:20). En móviles aún más altos se extiende
// hasta 1120 para que la publicidad quede pegada al borde inferior real.
// En escritorio FIT deja franjas laterales, igual que en la referencia.
const GAME_W = 480;
const vw = Math.max(1, window.innerWidth);
const vh = Math.max(1, window.innerHeight);
const GAME_H = Math.round(Phaser.Math.Clamp(GAME_W * (vh / vw), 1067, 1120));

const config = {
    type: Phaser.AUTO,
    width: GAME_W,
    height: GAME_H,
    parent: 'app',
    backgroundColor: '#F5E6D3',
    scene: [BootScene, PreloadScene, MenuScene, GameScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_W,
        height: GAME_H,
    },
    input: {
        activePointers: 3,
    },
    render: {
        antialias: true,
        roundPixels: false,
    },
};

const game = new Phaser.Game(config);
// Referencia global para depuración desde la consola del navegador (p. ej. window.__game.scene)
window.__game = game;
