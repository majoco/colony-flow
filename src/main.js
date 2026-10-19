import Phaser from 'phaser';
import { BootScene }    from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { MenuScene }    from './scenes/MenuScene.js';
import { GameScene }    from './scenes/GameScene.js';

const config = {
    type: Phaser.AUTO,
    width: 480,
    height: 908,
    parent: 'app',
    backgroundColor: '#F5E6D3',
    scene: [BootScene, PreloadScene, MenuScene, GameScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 480,
        height: 908,
    },
    input: {
        activePointers: 3,
    },
    render: {
        antialias: true,
        roundPixels: false,
    },
};

new Phaser.Game(config);
