import Phaser from 'phaser';
import { getLevels } from './GameScene.js';

function lighten(hex, amt) {
    const r = Math.min(255, ((hex >> 16) & 0xFF) + amt);
    const g = Math.min(255, ((hex >> 8)  & 0xFF) + amt);
    const b = Math.min(255, ( hex        & 0xFF) + amt);
    return (r << 16) | (g << 8) | b;
}

function darken(hex, amt) {
    const r = Math.max(0, ((hex >> 16) & 0xFF) - amt);
    const g = Math.max(0, ((hex >> 8)  & 0xFF) - amt);
    const b = Math.max(0, ( hex        & 0xFF) - amt);
    return (r << 16) | (g << 8) | b;
}

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'Menu' });
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        this.createBackground(W, H);
        this.createTopBar(W, H);
        this.createProgressArea(W, H);
        this.createAntHero(W, H);
        this.createSidePanels(W, H);
        this.createLevelButtons(W, H);
        this.createBottomNav(W, H);
    }

    // ── Background ─────────────────────────────────────────────────────────────
    createBackground(W, H) {
        const g = this.add.graphics();

        // Sky
        g.fillStyle(0x87CEEB);
        g.fillRect(0, 0, W, H * 0.55);

        // Green ground
        g.fillStyle(0x5DBE61);
        g.fillRect(0, H * 0.50, W, H * 0.50);

        // Darker ground
        g.fillStyle(0x4CAF50);
        g.fillRect(0, H * 0.56, W, H * 0.44);

        // Rolling hills
        g.fillStyle(0x66BB6A);
        g.fillEllipse(-50, H * 0.54, 280, 140);
        g.fillEllipse(W + 50, H * 0.54, 280, 140);
        g.fillEllipse(W / 2, H * 0.60, 240, 100);

        // Clouds
        g.fillStyle(0xFFFFFF, 0.85);
        this.drawCloud(g, 70, H * 0.12, 0.7);
        this.drawCloud(g, W - 80, H * 0.08, 0.5);
        this.drawCloud(g, W * 0.55, H * 0.15, 0.6);

        // Ant hole
        g.fillStyle(0x1A1A1A);
        g.fillEllipse(W * 0.68, H * 0.745, 90, 38);
        g.fillStyle(0x2C2C2C);
        g.fillEllipse(W * 0.68, H * 0.735, 80, 28);

        // Small grass tufts
        g.fillStyle(0x388E3C);
        for (let x = 0; x < W; x += 22) {
            const yy = H * 0.56 + Math.sin(x * 0.3) * 4;
            g.fillRect(x, yy - 8, 3, 10);
            g.fillRect(x + 7, yy - 5, 3, 7);
            g.fillRect(x + 14, yy - 9, 3, 11);
        }
    }

    drawCloud(g, cx, cy, scale) {
        const r = 28 * scale;
        g.fillCircle(cx, cy, r);
        g.fillCircle(cx - r * 0.8, cy + r * 0.2, r * 0.8);
        g.fillCircle(cx + r * 0.8, cy + r * 0.2, r * 0.8);
        g.fillCircle(cx + r * 1.4, cy + r * 0.4, r * 0.65);
        g.fillCircle(cx - r * 1.4, cy + r * 0.4, r * 0.65);
    }

    // ── Top Bar ────────────────────────────────────────────────────────────────
    createTopBar(W, H) {
        // Ant avatar
        const av = this.add.graphics();
        av.fillStyle(0xFFFFFF, 0.92);
        av.fillRoundedRect(8, 8, 58, 58, 12);
        av.lineStyle(2, 0xCCCCCC);
        av.strokeRoundedRect(8, 8, 58, 58, 12);
        this.drawMiniAnt(37, 37);

        // Coins
        const coinBg = this.add.graphics();
        coinBg.fillStyle(0xFFFFFF, 0.92);
        coinBg.fillRoundedRect(72, 14, 116, 36, 18);
        this.add.text(88, 32, '⭐', { fontSize: '18px' }).setOrigin(0.5);
        this.add.text(134, 32, '1 670', {
            fontSize: '16px', fontStyle: 'bold', color: '#4E342E',
        }).setOrigin(0.5);
        const plusG = this.add.graphics();
        plusG.fillStyle(0x43A047);
        plusG.fillCircle(182, 32, 11);
        this.add.text(182, 32, '+', { fontSize: '15px', fontStyle: 'bold', color: '#FFF' }).setOrigin(0.5);

        // Hearts
        const heartBg = this.add.graphics();
        heartBg.fillStyle(0xFFFFFF, 0.92);
        heartBg.fillRoundedRect(196, 14, 134, 36, 18);
        this.add.text(215, 32, '❤️', { fontSize: '17px' }).setOrigin(0.5);
        this.add.text(270, 32, '5  FULL', {
            fontSize: '13px', fontStyle: 'bold', color: '#C62828',
        }).setOrigin(0.5);

        // Settings cog
        const cogBg = this.add.graphics();
        cogBg.fillStyle(0xFFFFFF, 0.92);
        cogBg.fillCircle(W - 28, 37, 24);
        this.add.text(W - 28, 37, '⚙️', { fontSize: '22px' }).setOrigin(0.5);
    }

    drawMiniAnt(cx, cy) {
        const g = this.add.graphics();
        g.fillStyle(0xFFC107);
        g.fillCircle(cx, cy + 6, 12);  // body
        g.fillCircle(cx, cy - 5, 10);  // head

        g.fillStyle(0xFFFFFF);
        g.fillCircle(cx - 4, cy - 7, 3.5);
        g.fillCircle(cx + 4, cy - 7, 3.5);

        g.fillStyle(0x000000);
        g.fillCircle(cx - 4, cy - 7, 2);
        g.fillCircle(cx + 4, cy - 7, 2);

        g.lineStyle(2, 0xA0522D);
        g.beginPath(); g.moveTo(cx - 2, cy - 14); g.lineTo(cx - 6, cy - 20); g.strokePath();
        g.beginPath(); g.moveTo(cx + 2, cy - 14); g.lineTo(cx + 6, cy - 20); g.strokePath();
        g.fillStyle(0xA0522D);
        g.fillCircle(cx - 6, cy - 21, 2);
        g.fillCircle(cx + 6, cy - 21, 2);
    }

    // ── Progress Area ──────────────────────────────────────────────────────────
    createProgressArea(W, H) {
        const py = 76;

        // Progress bar bg
        const pBg = this.add.graphics();
        pBg.fillStyle(0xFFFFFF, 0.9);
        pBg.fillRoundedRect(W / 2 - 148, py, 296, 42, 14);

        // Fill 30% of the bar
        const pFill = this.add.graphics();
        pFill.fillStyle(0xFFD600);
        pFill.fillRoundedRect(W / 2 - 144, py + 4, 82, 34, 10);

        // Shine on bar
        pFill.fillStyle(0xFFFFFF, 0.35);
        pFill.fillRoundedRect(W / 2 - 144, py + 4, 82, 16, 10);

        // Text
        this.add.text(W / 2, py + 21, '3 / 10', {
            fontSize: '15px', fontStyle: 'bold', color: '#4E342E',
        }).setOrigin(0.5);

        // Wand on left
        this.add.text(W / 2 - 152, py + 21, '🪄', { fontSize: '22px' }).setOrigin(0.5);

        // x5 badge
        const x5G = this.add.graphics();
        x5G.fillStyle(0xFF5722);
        x5G.fillRoundedRect(W / 2 - 168, py - 18, 42, 22, 6);
        this.add.text(W / 2 - 147, py - 7, 'x5', {
            fontSize: '13px', fontStyle: 'bold', color: '#FFD700',
        }).setOrigin(0.5);

        // Coins on right
        this.add.text(W / 2 + 164, py + 21, 'x50', {
            fontSize: '14px', fontStyle: 'bold', color: '#4E342E',
        }).setOrigin(0.5);
        this.add.text(W / 2 + 142, py + 21, '🪙', { fontSize: '18px' }).setOrigin(0.5);

        // Time label
        this.add.text(W / 2 - 6, py + 40, '19h 40m', {
            fontSize: '11px', color: '#6D4C41',
        }).setOrigin(0.5);
    }

    // ── Ant Hero Character ─────────────────────────────────────────────────────
    createAntHero(W, H) {
        const cx = W * 0.40;
        const cy = H * 0.56;

        // Shadow
        const g = this.add.graphics();
        g.fillStyle(0x000000, 0.18);
        g.fillEllipse(cx + 8, cy + 88, 95, 22);

        this.drawBigAnt(cx, cy);

        // Level cube above ant head
        this.drawLevelCube(cx + 8, cy - 108, 86);
    }

    drawLevelCube(cx, cy, size) {
        const g = this.add.graphics();
        const topH = 14;
        const sideW = 10;
        const col = 0x5B9BD5;
        const colL = lighten(col, 50);
        const colD = darken(col, 40);

        // Front
        g.fillStyle(col);
        g.fillRect(cx - size / 2, cy - size / 2 + topH, size - sideW, size - topH);

        // Top
        g.fillStyle(colL);
        g.fillRect(cx - size / 2, cy - size / 2, size - sideW, topH);

        // Right
        g.fillStyle(colD);
        g.fillRect(cx + size / 2 - sideW, cy - size / 2 + topH, sideW, size - topH);

        // Outline
        g.lineStyle(2, 0x1565C0, 0.5);
        g.strokeRect(cx - size / 2, cy - size / 2, size, size);

        // Level text
        this.add.text(cx - sideW / 2, cy + 4, 'LEVEL\n71', {
            fontSize: '22px', fontStyle: 'bold', color: '#FFFFFF',
            align: 'center', stroke: '#1565C0', strokeThickness: 4,
        }).setOrigin(0.5);
    }

    drawBigAnt(cx, cy) {
        const g = this.add.graphics();

        // Legs (behind body)
        g.lineStyle(6, 0xC68642);
        const legs = [
            [cx - 30, cy + 10, cx - 60, cy - 5],
            [cx - 30, cy + 28, cx - 62, cy + 28],
            [cx - 30, cy + 46, cx - 58, cy + 60],
            [cx + 30, cy + 10, cx + 60, cy - 5],
            [cx + 30, cy + 28, cx + 62, cy + 28],
            [cx + 30, cy + 46, cx + 58, cy + 60],
        ];
        legs.forEach(([x1, y1, x2, y2]) => {
            g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
        });

        // Abdomen
        g.fillStyle(0xFFC107);
        g.fillEllipse(cx, cy + 50, 62, 78);
        g.fillStyle(0xFFD740, 0.5);
        g.fillEllipse(cx - 8, cy + 40, 28, 44);

        // Thorax
        g.fillStyle(0xFFC107);
        g.fillEllipse(cx, cy + 12, 52, 42);
        g.fillStyle(0xFFD740, 0.4);
        g.fillEllipse(cx - 6, cy + 6, 22, 26);

        // Head
        g.fillStyle(0xFFC107);
        g.fillCircle(cx, cy - 22, 34);
        g.fillStyle(0xFFD740, 0.4);
        g.fillCircle(cx - 6, cy - 26, 18);

        // Eye sclera
        g.fillStyle(0xFFFFFF);
        g.fillCircle(cx - 14, cy - 24, 12);
        g.fillCircle(cx + 14, cy - 24, 12);

        // Iris
        g.fillStyle(0x8D6E63);
        g.fillCircle(cx - 13, cy - 24, 9);
        g.fillCircle(cx + 13, cy - 24, 9);

        // Pupils
        g.fillStyle(0x000000);
        g.fillCircle(cx - 12, cy - 24, 5.5);
        g.fillCircle(cx + 12, cy - 24, 5.5);

        // Shine
        g.fillStyle(0xFFFFFF);
        g.fillCircle(cx - 10, cy - 27, 2.5);
        g.fillCircle(cx + 14, cy - 27, 2.5);

        // Smile
        g.lineStyle(3, 0x5D4037);
        g.beginPath();
        g.moveTo(cx - 8, cy - 10);
        g.lineTo(cx - 2, cy - 6);
        g.lineTo(cx + 8, cy - 10);
        g.strokePath();

        // Antennae
        g.lineStyle(4, 0xA0522D);
        g.beginPath(); g.moveTo(cx - 10, cy - 52); g.lineTo(cx - 28, cy - 80); g.strokePath();
        g.beginPath(); g.moveTo(cx + 10, cy - 52); g.lineTo(cx + 28, cy - 80); g.strokePath();
        g.fillStyle(0xA0522D);
        g.fillCircle(cx - 28, cy - 81, 5.5);
        g.fillCircle(cx + 28, cy - 81, 5.5);
    }

    // ── Side Panels ────────────────────────────────────────────────────────────
    createSidePanels(W, H) {
        const panels = [
            { y: H * 0.37, icon: '🎫', label: '26d 19h', color: 0x7B1FA2 },
            { y: H * 0.49, icon: '📺', label: 'No Ads!', color: 0xE64A19 },
            { y: H * 0.61, icon: '📅', label: 'Daily',   color: 0xFF8F00 },
        ];

        panels.forEach(({ y, icon, label, color }) => {
            const g = this.add.graphics();
            g.fillStyle(color);
            g.fillRoundedRect(W - 72, y - 32, 68, 64, 12);
            g.lineStyle(2, lighten(color, 40));
            g.strokeRoundedRect(W - 72, y - 32, 68, 64, 12);

            this.add.text(W - 38, y - 8, icon, { fontSize: '26px' }).setOrigin(0.5);
            this.add.text(W - 38, y + 18, label, { fontSize: '10px', color: '#FFFFFF' }).setOrigin(0.5);

            // Red dot notification
            const dot = this.add.graphics();
            dot.fillStyle(0xE53935);
            dot.fillCircle(W - 10, y - 32, 9);
            this.add.text(W - 10, y - 32, '!', { fontSize: '11px', fontStyle: 'bold', color: '#FFF' }).setOrigin(0.5);
        });

        // Balloon badge on left
        const ballG = this.add.graphics();
        ballG.fillStyle(0xFFFFFF, 0.92);
        ballG.fillCircle(55, H * 0.48, 40);
        ballG.lineStyle(2, 0xCCCCCC);
        ballG.strokeCircle(55, H * 0.48, 40);
        this.add.text(55, H * 0.46, '🎈', { fontSize: '30px' }).setOrigin(0.5);
        this.add.text(55, H * 0.48 + 22, '19h 40m', { fontSize: '9px', color: '#444' }).setOrigin(0.5);
    }

    // ── Play Button ────────────────────────────────────────────────────────────
    createLevelButtons(W, H) {
        // Título de sección
        this.add.text(W / 2, H * 0.700, 'Selecciona Nivel', {
            fontSize: '18px', fontStyle: 'bold',
            color: '#FFFFFF', stroke: '#1B5E20', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(2);

        // Lista dinámica: todos los LEVEL_N definidos en LevelData.js.
        // Cuadrícula de 5 × 3 por página (hasta 100 niveles con paginación).
        this.levels    = getLevels();
        this.levelPage = 0;
        this.levelGrid = this.add.container(0, 0).setDepth(2);
        this._drawLevelPage(W, H);
    }

    _drawLevelPage(W, H) {
        const PER_ROW = 5, ROWS = 3, PER_PAGE = PER_ROW * ROWS;
        const pages = Math.max(1, Math.ceil(this.levels.length / PER_PAGE));
        this.levelPage = Phaser.Math.Clamp(this.levelPage, 0, pages - 1);
        this.levelGrid.removeAll(true);

        const slice = this.levels.slice(this.levelPage * PER_PAGE, (this.levelPage + 1) * PER_PAGE);
        const cellW = 64, cellH = 50;
        const x0 = W / 2 - ((PER_ROW - 1) * cellW) / 2;
        const y0 = H * 0.745;

        slice.forEach((lv, i) => {
            const bx = x0 + (i % PER_ROW) * cellW;
            const by = y0 + Math.floor(i / PER_ROW) * cellH;
            this._makeLevelChip(bx, by, lv);
        });

        // Paginación
        if (pages > 1) {
            const py = y0 + ROWS * cellH - 8;
            const mk = (x, label, dir) => {
                const t = this.add.text(x, py, label, {
                    fontSize: '20px', fontStyle: 'bold', color: '#FFFFFF',
                    stroke: '#1B5E20', strokeThickness: 3,
                }).setOrigin(0.5).setInteractive({ useHandCursor: true });
                t.on('pointerdown', () => { this.levelPage += dir; this._drawLevelPage(W, H); });
                this.levelGrid.add(t);
            };
            mk(W / 2 - 60, '◀', -1);
            mk(W / 2 + 60, '▶', 1);
            this.levelGrid.add(this.add.text(W / 2, py, `${this.levelPage + 1} / ${pages}`, {
                fontSize: '13px', color: '#FFFFFF', stroke: '#1B5E20', strokeThickness: 2,
            }).setOrigin(0.5));
        }
    }

    // Botón compacto de nivel: número grande + tamaño del tablero
    _makeLevelChip(bx, by, lv) {
        const bw = 56, bh = 42, rad = 12;
        const palette = [
            [0x43A047, 0x66BB6A, 0x1B5E20],
            [0x1565C0, 0x1E88E5, 0x0D47A1],
            [0x6A1B9A, 0x9C27B0, 0x4A148C],
            [0xEF6C00, 0xFB8C00, 0xE65100],
            [0xC62828, 0xE53935, 0xB71C1C],
        ];
        const [colorMain, colorShine, colorShadow] = palette[(lv.id - 1) % palette.length];

        const shadowG = this.add.graphics();
        shadowG.fillStyle(colorShadow, 0.8);
        shadowG.fillRoundedRect(bx - bw / 2, by - bh / 2 + 4, bw, bh, rad);

        const btnG = this.add.graphics();
        btnG.fillStyle(colorMain);
        btnG.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, rad);
        btnG.fillStyle(colorShine);
        btnG.fillRoundedRect(bx - bw / 2 + 3, by - bh / 2 + 3, bw - 6, bh * 0.34, (bh * 0.34) / 2);

        const txt = this.add.text(bx, by - 5, String(lv.id), {
            fontSize: '20px', fontStyle: 'bold',
            color: '#FFFFFF', stroke: colorShadow, strokeThickness: 3,
        }).setOrigin(0.5);
        const sub = this.add.text(bx, by + 13, `${lv.data.cols}×${lv.data.rows}`, {
            fontSize: '9px', color: '#E8F5E9',
        }).setOrigin(0.5);

        btnG.setInteractive(
            new Phaser.Geom.Rectangle(bx - bw / 2, by - bh / 2, bw, bh),
            Phaser.Geom.Rectangle.Contains
        );
        btnG.on('pointerover', () => btnG.setAlpha(0.9));
        btnG.on('pointerout',  () => btnG.setAlpha(1));
        btnG.on('pointerdown', () => {
            this.tweens.add({
                targets: [btnG, txt, sub], scaleX: 0.93, scaleY: 0.93,
                duration: 90, yoyo: true,
                onComplete: () => this.scene.start('Game', { levelId: lv.id }),
            });
        });
        this.levelGrid.add([shadowG, btnG, txt, sub]);
    }

    _makeLevelBtn(bx, by, label, sublabel, levelId, _W, _H) {
        const bw  = 210;
        const bh  = 44;
        const rad = bh / 2;
        const colorMain  = levelId === 4 ? 0x0044A3 : levelId === 3 ? 0x6A1B9A : levelId === 2 ? 0x1565C0 : 0x43A047;
        const colorShine = levelId === 4 ? 0x1A66CC : levelId === 3 ? 0x9C27B0 : levelId === 2 ? 0x1E88E5 : 0x66BB6A;
        const colorShadow = levelId === 4 ? 0x002B6D : levelId === 3 ? 0x4A148C : levelId === 2 ? 0x0D47A1 : 0x1B5E20;

        // Sombra
        const shadowG = this.add.graphics();
        shadowG.fillStyle(colorShadow, 0.8);
        shadowG.fillRoundedRect(bx - bw / 2, by - bh / 2 + 5, bw, bh, rad);

        // Botón
        const btnG = this.add.graphics();
        btnG.fillStyle(colorMain);
        btnG.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, rad);
        btnG.fillStyle(colorShine);
        btnG.fillRoundedRect(bx - bw / 2 + 4, by - bh / 2 + 4, bw - 8, bh * 0.36, (bh * 0.36) / 2);

        // Texto principal
        const txt = this.add.text(bx, by - 5, label, {
            fontSize: '22px', fontStyle: 'bold',
            color: '#FFFFFF', stroke: colorShadow, strokeThickness: 3,
        }).setOrigin(0.5).setDepth(2);

        // Sub-etiqueta (tamaño del tablero)
        this.add.text(bx, by + 13, sublabel, {
            fontSize: '13px', color: '#CCFFCC',
        }).setOrigin(0.5).setDepth(2);

        // Interactividad
        btnG.setInteractive(
            new Phaser.Geom.Rectangle(bx - bw / 2, by - bh / 2, bw, bh),
            Phaser.Geom.Rectangle.Contains
        );
        btnG.on('pointerover',  () => { btnG.setAlpha(0.9); });
        btnG.on('pointerout',   () => { btnG.setAlpha(1);   });
        btnG.on('pointerdown',  () => {
            this.tweens.add({
                targets: [btnG, txt], scaleX: 0.93, scaleY: 0.93,
                duration: 90, yoyo: true,
                onComplete: () => this.scene.start('Game', { levelId }),
            });
        });
    }

    // ── Bottom Navigation ──────────────────────────────────────────────────────
    createBottomNav(W, H) {
        const navY = H - 62;

        // Background strip
        const navBg = this.add.graphics();
        navBg.fillStyle(0x1E88E5);
        navBg.fillRoundedRect(0, navY - 12, W, 74, 12);

        const items = [
            { x: W * 0.10, icon: '🏆', label: '' },
            { x: W * 0.30, icon: '🎁', label: '' },
            { x: W * 0.50, icon: '🏠', label: 'Home', selected: true },
            { x: W * 0.70, icon: '🍄', label: '' },
            { x: W * 0.90, icon: '⭐', label: '' },
        ];

        items.forEach(({ x, icon, label, selected }) => {
            if (selected) {
                const selG = this.add.graphics();
                selG.fillStyle(0x1565C0);
                selG.fillRoundedRect(x - 36, navY - 18, 72, 80, 18);
            }
            this.add.text(x, navY + 4, icon, { fontSize: '28px' }).setOrigin(0.5);
            if (label) {
                this.add.text(x, navY + 34, label, { fontSize: '12px', color: '#FFFFFF' }).setOrigin(0.5);
            }
        });
    }
}
