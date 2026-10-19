import Phaser from 'phaser';
import antUrl from '../assets/ant.png';
import antH0 from '../assets/ants/h0.png';
import antH1 from '../assets/ants/h1.png';
import antH2 from '../assets/ants/h2.png';
import antH3 from '../assets/ants/h3.png';
import antH4 from '../assets/ants/h4.png';
import antH5 from '../assets/ants/h5.png';

export class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'Preload' });
    }

    preload() {
        this.load.image('ant', antUrl);
        // Frames de animación de caminado (h0–h5, patas en distintas posiciones)
        this.load.image('ant_h0', antH0);
        this.load.image('ant_h1', antH1);
        this.load.image('ant_h2', antH2);
        this.load.image('ant_h3', antH3);
        this.load.image('ant_h4', antH4);
        this.load.image('ant_h5', antH5);
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        this.createBg(W, H);
        this.createDecorations(W, H);
        this.createLogo(W, H);
        this.createLoadingBar(W, H);
    }

    createBg(W, H) {
        const bg = this.add.graphics();
        bg.fillStyle(0x2E8B3A);
        bg.fillRect(0, 0, W, H);

        // Radial lighter center
        bg.fillStyle(0x45A855, 0.5);
        bg.fillEllipse(W * 0.5, H * 0.42, W * 0.85, H * 0.55);

        // Darker bottom strip (grass)
        bg.fillStyle(0x236B2A);
        bg.fillRect(0, H * 0.82, W, H * 0.18);

        // Grass blades
        bg.fillStyle(0x2E8B3A);
        for (let x = 0; x < W; x += 8) {
            const h = 10 + Math.sin(x * 0.4) * 5;
            bg.fillTriangle(x, H * 0.82, x + 4, H * 0.82 - h, x + 8, H * 0.82);
        }
    }

    createDecorations(W, H) {
        // Flowers in corners
        this.drawFlower(28, 75, 0x64B5F6, 18);
        this.drawFlower(W - 28, 75, 0xFFD54F, 16);
        this.drawFlower(28, H - 90, 0x64B5F6, 14);
        this.drawFlower(W - 28, H - 90, 0xFFD54F, 18);

        // Grass patches
        for (let i = 0; i < 14; i++) {
            const gx = 20 + i * 34;
            const gy = H * 0.85 + (i % 2) * 10;
            const g = this.add.graphics();
            g.fillStyle(0x1B5E20, 0.7);
            g.fillRect(gx, gy, 3, 12);
            g.fillRect(gx + 5, gy + 3, 3, 9);
            g.fillRect(gx + 10, gy + 1, 3, 11);
        }
    }

    drawFlower(x, y, petalColor, size) {
        const g = this.add.graphics();
        g.fillStyle(petalColor);
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            g.fillCircle(x + Math.cos(a) * size * 0.7, y + Math.sin(a) * size * 0.7, size * 0.55);
        }
        g.fillStyle(0xFFF176);
        g.fillCircle(x, y, size * 0.45);
    }

    createLogo(W, H) {
        // Sparkle star
        this.add.text(W / 2 + 85, H / 2 - 90, '✦', {
            fontSize: '30px',
            color: '#FFD700',
            stroke: '#E65100',
            strokeThickness: 2,
        }).setOrigin(0.5);

        // COLONY text — blue bold with white outline
        this.add.text(W / 2, H / 2 - 42, 'COLONY', {
            fontSize: '66px',
            fontStyle: 'bold',
            color: '#FFFFFF',
            stroke: '#1565C0',
            strokeThickness: 10,
        }).setOrigin(0.5);

        // FLOW text — yellow-orange
        this.add.text(W / 2, H / 2 + 36, 'FLOW', {
            fontSize: '66px',
            fontStyle: 'bold',
            color: '#FFD600',
            stroke: '#E65100',
            strokeThickness: 10,
        }).setOrigin(0.5);
    }

    createLoadingBar(W, H) {
        const barW = 280;
        const barH = 30;
        const barX = (W - barW) / 2;
        const barY = H - 90;

        // Bar track
        const track = this.add.graphics();
        track.fillStyle(0x1B5E20, 0.8);
        track.fillRoundedRect(barX, barY, barW, barH, barH / 2);
        track.lineStyle(2, 0x81C784);
        track.strokeRoundedRect(barX, barY, barW, barH, barH / 2);

        // Bar fill
        const fill = this.add.graphics();

        // Percentage text
        const pct = this.add.text(W / 2, barY + barH / 2, '0%', {
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#FFFFFF',
        }).setOrigin(0.5).setDepth(5);

        let progress = 0;

        const updateBar = () => {
            progress = Math.min(100, progress + 1.8 + Math.random() * 2.5);

            const fw = Math.max(0, (barW - 8) * (progress / 100));
            fill.clear();
            fill.fillStyle(0xFFD600);
            fill.fillRoundedRect(barX + 4, barY + 4, fw, barH - 8, (barH - 8) / 2);

            // Shine stripe
            fill.fillStyle(0xFFFFFF, 0.3);
            fill.fillRoundedRect(barX + 4, barY + 4, fw, (barH - 8) * 0.4, (barH - 8) / 2);

            pct.setText(Math.floor(progress) + '%');

            if (progress >= 100) {
                this.time.delayedCall(350, () => this.scene.start('Menu'));
            }
        };

        this.time.addEvent({
            delay: 20,
            repeat: 55,
            callback: updateBar,
        });
    }
}
