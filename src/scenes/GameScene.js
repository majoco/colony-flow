import Phaser from 'phaser';
import { LEVEL_1, LEVEL_2, CUBE_COLORS, lightenColor, darkenColor } from '../data/LevelData.js';

// ── Layout constants ───────────────────────────────────────────────────────────
const GW = 480;   // game width
const GH = 908;   // game height — incluye 54px para banner de publicidad

// Constantes dinámicas — se reinicializan en create() según el nivel seleccionado
let CELL    = 20;   // px per board cell
let BCOLS   = 20;   // board columns
let BROWS   = 14;   // board rows
let BOARD_W = BCOLS * CELL;
let BOARD_H = BROWS * CELL;
let BOARD_X = (GW - BOARD_W) / 2;
const BOARD_Y = 72;  // posición Y del tablero (fija)

// Cajas
let BOX_ROWS = 4;     // filas de cajas — se recalcula en create() según el nivel
let BOX_H    = 68;    // altura de celda de caja — se puede configurar por nivel (lvl.boxH)
let BOX_COLS = 4;
let BOX_W    = 92;
let BOX_X0   = (GW - BOX_COLS * BOX_W) / 2;

// Agujero y slots — se recalculan en create() según BOARD_H
let HOLE_Y = BOARD_Y + BOARD_H + 70;

const N_SLOTS  = 5;
const SLOT_W   = 80;
const SLOT_H   = 70;
let SLOT_Y   = HOLE_Y + 30;
const SLOT_X0  = (GW - N_SLOTS * SLOT_W) / 2;
let BOX_Y0   = SLOT_Y + SLOT_H + 8;

const ANT_SPEED = 124;  // ms per cell (velocidad base)

// Tamaño visual de la caja (px) — puede ser menor en niveles con muchas columnas
let BOX_SIZE = 62;

// Paleta de colores activa — se asigna en create() según el nivel
let activeCubeColors = CUBE_COLORS;

// ── Helper functions ───────────────────────────────────────────────────────────
function cellPx(r, c) {
    const hc = CELL / 2;
    if (r < 0)     return { x: BOARD_X + c * CELL + hc, y: BOARD_Y - hc };
    if (r >= BROWS) return { x: BOARD_X + c * CELL + hc, y: BOARD_Y + BOARD_H + hc };
    if (c < 0)     return { x: BOARD_X - hc, y: BOARD_Y + r * CELL + hc };
    if (c >= BCOLS) return { x: BOARD_X + BOARD_W + hc, y: BOARD_Y + r * CELL + hc };
    return { x: BOARD_X + c * CELL + hc, y: BOARD_Y + r * CELL + hc };
}

// Fusiona tramos ortogonales collineales consecutivos en un único waypoint más largo.
// Reduce el número de tweens en recorridos rectos → velocidad uniforme en todo el camino.
function mergeCollinear(pts) {
    if (pts.length < 2) return [...pts];
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
        const last = out[out.length - 1];
        const curr = pts[i];
        if (out.length >= 2) {
            const prev = out[out.length - 2];
            const colH = (prev.y === last.y && last.y === curr.y);  // tramo horizontal
            const colV = (prev.x === last.x && last.x === curr.x);  // tramo vertical
            if (colH || colV) { out[out.length - 1] = curr; continue; }
        }
        out.push(curr);
    }
    return out;
}

// ── GameScene ─────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'Game' }); }

    // ── Lifecycle ──────────────────────────────────────────────────────────────
    create() {
        // Seleccionar nivel según parámetro de escena (levelId)
        const lvlId = this.scene.settings.data?.levelId ?? 1;
        const lvl   = lvlId === 2 ? LEVEL_2 : LEVEL_1;
        this.levelData   = lvl;
        this.currentLevel = lvlId;   // guardado para Play Again

        // Reinicializar constantes de layout dinámicas según el nivel seleccionado
        CELL    = lvl.cell    ?? 20;
        BCOLS   = lvl.cols    ?? 20;
        BROWS   = lvl.rows    ?? 14;
        BOARD_W = BCOLS * CELL;
        BOARD_H = BROWS * CELL;
        BOARD_X = (GW - BOARD_W) / 2;
        HOLE_Y  = BOARD_Y + BOARD_H + (lvl.holeGap ?? 70);
        SLOT_Y  = HOLE_Y + 30;
        BOX_Y0  = SLOT_Y + SLOT_H + 8;
        BOX_COLS = lvl.boxCols ?? 4;
        BOX_W    = lvl.boxW    ?? 92;
        BOX_H    = lvl.boxH    ?? 68;   // altura de caja: configurable por nivel
        BOX_X0   = (GW - BOX_COLS * BOX_W) / 2;
        BOX_SIZE = lvl.boxSize ?? 62;
        BOX_ROWS = Math.ceil((lvl.boxes?.length ?? 16) / BOX_COLS); // filas según cajas/columnas
        activeCubeColors = lvl.colors ?? CUBE_COLORS;

        // Mutable board (copy of level grid)
        this.board = lvl.grid.map(row => [...row]);

        // Slot state
        this.slots       = new Array(N_SLOTS).fill(null);  // null | boxObj
        this.antMoving   = new Array(N_SLOTS).fill(false); // ant in-flight?
        this.reserved    = new Set();                       // 'r,c' keys con hormiga en vuelo

        // Box objects array
        this.boxes = lvl.boxes.map((b, i) => ({
            id       : i,
            colorId  : b[0],
            count    : b[1],
            col      : i % BOX_COLS,
            row      : Math.floor(i / BOX_COLS),
            inSlot   : false,
            slotIdx  : -1,
            active    : true,
            origX     : 0,
            origY     : 0,
            container : null,
            countTxt  : null,
        }));

        // Si el nivel define sortBoxes:false, usar el orden manual del array boxes.
        // De lo contrario reordenar por accesibilidad BFS automáticamente.
        if (lvl.sortBoxes === false) {
            // Respetar el orden diseñado en LevelData (skin primero, negro último, etc.)
            this.boxes.forEach((b, i) => {
                b.id  = i;
                b.col = i % BOX_COLS;
                b.row = Math.floor(i / BOX_COLS);
            });
        } else {
            const sortedBoxes = this._computeBoxOrder(this.boxes, this.board);
            sortedBoxes.forEach((b, i) => {
                b.id  = i;
                b.col = i % BOX_COLS;
                b.row = Math.floor(i / BOX_COLS);
            });
            this.boxes = sortedBoxes;
        }

        // Banderas de fin de partida — evitan mostrar la pantalla más de una vez
        this.won  = false;
        this.lost = false;

        // Velocidad de hormigas (modificable con botón 2×)
        // antSpeed se deriva de CELL × msPerPx para que la velocidad en px/s
        // sea idéntica dentro del tablero y en el perimetro (todos los niveles).
        this.msPerPx   = 5;                  // ms por pixel en el camino perimetral (más lento)
        this.antSpeed  = CELL * this.msPerPx; // ms por celda = mismo px/s que el perimetro
        this.speedBoost = false;

        // Cached slot Graphics objects
        this.slotGfx = [];

        // Colas por columna: array de 4 arrays, ordenados por row (primero = top = seleccionable)
        this.colQueues = Array.from({ length: BOX_COLS }, (_, ci) =>
            this.boxes.filter(b => b.col === ci).sort((a, b) => a.row - b.row)
        );

        this.buildScene();

        // Animación de caminado de hormiga: 6 frames, 10 fps, loop infinito
        if (!this.anims.exists('ant_walk')) {
            this.anims.create({
                key       : 'ant_walk',
                frames    : [
                    { key: 'ant_h0' },
                    { key: 'ant_h1' },
                    { key: 'ant_h2' },
                    { key: 'ant_h3' },
                    { key: 'ant_h4' },
                    { key: 'ant_h5' },
                ],
                frameRate : 10,
                repeat    : -1,
            });
        }

        // Ant dispatch loop — 200 ms por tick (todos los niveles)
        this.time.addEvent({
            delay     : 200,
            callback  : this.tickSlots,
            callbackScope: this,
            loop      : true,
        });
    }

    // ── Scene construction ─────────────────────────────────────────────────────
    buildScene() {
        this.makeBg();
        this.makeHUD();
        this.makeBoard();
        this.makeSlots();
        this.makeBoxGrid();
        this.makeBottomBar();
    }

    // ── Background ─────────────────────────────────────────────────────────────
    makeBg() {
        // Base cálida anaranjada-beige (igual que la imagen de referencia)
        this.add.rectangle(GW / 2, GH / 2, GW, GH, 0xF5D5A0);

        // Patrón de rombos diagonales (argyle) como en la imagen de referencia
        const g = this.add.graphics();
        g.lineStyle(1, 0xE0B870, 0.55);
        const d = 34;   // separación diagonal
        for (let x = -GH; x < GW + GH; x += d) {
            g.lineBetween(x, 0, x + GH, GH);   // líneas \
            g.lineBetween(x, 0, x - GH, GH);   // líneas /
        }
    }

    // ── Top HUD ────────────────────────────────────────────────────────────────
    makeHUD() {
        // Barra semitransparente que se mezcla con el fondo
        const bar = this.add.graphics();
        bar.fillStyle(0xF5D5A0, 0.55);
        bar.fillRect(0, 0, GW, 60);

        // Botón Pausa (izquierda) — blanco redondeado con barras
        const pauseG = this.add.graphics();
        pauseG.fillStyle(0xFFFFFF, 0.95);
        pauseG.fillRoundedRect(10, 9, 50, 44, 12);
        pauseG.lineStyle(2, 0xCCBB99, 0.8);
        pauseG.strokeRoundedRect(10, 9, 50, 44, 12);
        pauseG.fillStyle(0x5D4037);
        pauseG.fillRect(22, 19, 10, 24);
        pauseG.fillRect(38, 19, 10, 24);
        pauseG.setInteractive(
            new Phaser.Geom.Rectangle(10, 9, 50, 44),
            Phaser.Geom.Rectangle.Contains
        );
        pauseG.on('pointerdown', () => this.scene.start('Menu'));

        // Nombre del nivel — centrado, texto grande oscuro
        this.add.text(GW / 2, 31, this.levelData?.name ?? 'Level 1', {
            fontSize: '24px', fontStyle: 'bold', color: '#5D4037',
            stroke: '#F5D5A0', strokeThickness: 3,
        }).setOrigin(0.5);

        // Botón 2× velocidad (derecha) — interactivo, cambia a verde cuando activo
        this.speedBtnBg = this.add.graphics();
        const drawSpeedBtn = () => {
            this.speedBtnBg.clear();
            if (this.speedBoost) {
                this.speedBtnBg.fillStyle(0x43A047, 0.95);
                this.speedBtnBg.fillRoundedRect(GW - 74, 9, 64, 44, 12);
                this.speedBtnBg.lineStyle(2, 0x2E7D32, 0.9);
            } else {
                this.speedBtnBg.fillStyle(0xFFFFFF, 0.95);
                this.speedBtnBg.fillRoundedRect(GW - 74, 9, 64, 44, 12);
                this.speedBtnBg.lineStyle(2, 0xCCBB99, 0.8);
            }
            this.speedBtnBg.strokeRoundedRect(GW - 74, 9, 64, 44, 12);
        };
        drawSpeedBtn();

        this.speedBtnTxt = this.add.text(GW - 42, 31, '▶▶ 2×', {
            fontSize: '14px', fontStyle: 'bold', color: '#5D4037',
        }).setOrigin(0.5);

        // Zona táctil del botón
        const speedHit = this.add.zone(GW - 74, 9, 64, 44).setOrigin(0, 0);
        speedHit.setInteractive();
        speedHit.on('pointerdown', () => {
            this.speedBoost = !this.speedBoost;
            // updateSpeed recalcula antSpeed/msPerPx considerando también auto-2x
            this.updateSpeed();
            // El botón visual solo refleja el toggle manual del usuario
            this.speedBtnTxt.setStyle({
                color: this.speedBoost ? '#FFFFFF' : '#5D4037',
            });
            drawSpeedBtn();
        });
    }

    // ── Board & frame ──────────────────────────────────────────────────────────
    makeBoard() {
        const FRAME_PAD = 16;
        const fx = BOARD_X - FRAME_PAD;        // 40-16 = 24
        const fy = BOARD_Y - FRAME_PAD;        // 72-16 = 56
        const fw = BOARD_W + FRAME_PAD * 2;    // 400+32 = 432
        const fh = BOARD_H + FRAME_PAD * 2;    // 280+32 = 312

        // Marco con estilo crema/beige (como en la imagen de referencia)
        const fr = this.add.graphics();

        // Borde externo del marco (marrón dorado oscuro)
        fr.fillStyle(0xC8A060);
        fr.fillRoundedRect(fx, fy, fw, fh, 20);

        // Cuerpo del marco (crema claro)
        fr.fillStyle(0xF2E8CC);
        fr.fillRoundedRect(fx + 4, fy + 4, fw - 8, fh - 8, 18);

        // Interior: fondo blanco para el tablero de cubos
        fr.fillStyle(0xFFFFFF);
        fr.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);

        // Board cubes (single Graphics redrawn on change)
        this.boardGfx = this.add.graphics();
        this.redrawBoard();

        // Agujero de hormigas — usa la constante HOLE_Y
        const hole = this.add.graphics();
        // Elipse principal oscura
        hole.fillStyle(0x2A1A0A);
        hole.fillEllipse(GW / 2, HOLE_Y, 62, 28);
        // Reflejo interior
        hole.fillStyle(0x3D2510);
        hole.fillEllipse(GW / 2, HOLE_Y - 3, 50, 20);
        // Borde marrón claro alrededor del agujero (tierra)
        hole.lineStyle(3, 0x8B5E3C, 0.7);
        hole.strokeEllipse(GW / 2, HOLE_Y, 62, 28);
    }

    // Draw every cube that still exists
    redrawBoard() {
        const g = this.boardGfx;
        g.clear();
        for (let r = 0; r < BROWS; r++) {
            for (let c = 0; c < BCOLS; c++) {
                const cid = this.board[r][c];
                if (cid === 0) continue;
                this.drawCube(g, BOARD_X + c * CELL, BOARD_Y + r * CELL, cid);
            }
        }
    }

    drawCube(g, x, y, colorId) {
        const base = activeCubeColors[colorId];
        if (!base) return;

        const fw = CELL;
        const fh = CELL;

        // Capa 1: color base, celda completa sin gap ni radio
        g.fillStyle(base, 1);
        g.fillRect(x, y, fw, fh);

        if (CELL >= 10) {
            // Capa 2: highlight blanco en top (2px) y left (2px desde abajo del top)
            g.fillStyle(0xffffff, 0.20);
            g.fillRect(x, y, fw, 2);
            g.fillRect(x, y + 2, 2, fh - 2);

            // Capa 3: sombra negra en bottom (2px) y right (2px, sin pisar el corner inferior)
            g.fillStyle(0x000000, 0.28);
            g.fillRect(x, y + fh - 2, fw, 2);
            g.fillRect(x + fw - 2, y, 2, fh - 2);
        } else {
            // Celdas pequeñas: highlight y sombra de 1px
            g.fillStyle(0xffffff, 0.18);
            g.fillRect(x, y, fw, 1);
            g.fillRect(x, y + 1, 1, fh - 1);

            g.fillStyle(0x000000, 0.25);
            g.fillRect(x, y + fh - 1, fw, 1);
            g.fillRect(x + fw - 1, y, 1, fh - 1);
        }

        // Capa 4: borde fino igual que el editor
        g.lineStyle(0.5, 0x000000, 0.22);
        g.strokeRect(x + 0.25, y + 0.25, fw - 0.5, fh - 0.5);
    }

    // ── Slots ──────────────────────────────────────────────────────────────────
    makeSlots() {
        // Fondo de la franja de slots — N_SLOTS=5, SLOT_W=80, 5×80=400, SLOT_X0=40
        const bg = this.add.graphics();
        bg.fillStyle(0xC8914A, 0.18);
        bg.fillRoundedRect(SLOT_X0, SLOT_Y - 5, N_SLOTS * SLOT_W, SLOT_H + 10, 10);

        for (let i = 0; i < N_SLOTS; i++) {
            const sg = this.add.graphics();
            this.slotGfx.push(sg);
            this.drawEmptySlot(i);
        }
    }

    drawEmptySlot(i) {
        const g  = this.slotGfx[i];
        const sx = SLOT_X0 + i * SLOT_W;
        // Slot cuadrado 68×68 — borde blanco visible alrededor de la caja asignada
        const vw = 68;
        const vh = 68;
        const vx = sx + (SLOT_W - vw) / 2;       // 6 px de margen horizontal
        const vy = SLOT_Y + (SLOT_H - vh) / 2;   // 1 px de margen vertical (SLOT_H=70)
        g.clear();
        // Sombra ligera
        g.fillStyle(0x000000, 0.08);
        g.fillRoundedRect(vx + 2, vy + 3, vw, vh, 11);
        // Fondo blanco
        g.fillStyle(0xFFFFFF, 0.92);
        g.fillRoundedRect(vx, vy, vw, vh, 11);
        // Borde gris
        g.lineStyle(2, 0xCCCCCC, 1.0);
        g.strokeRoundedRect(vx, vy, vw, vh, 11);
        // Guía interior
        g.lineStyle(1.5, 0xBBBBBB, 0.50);
        g.strokeRoundedRect(vx + 6, vy + 5, vw - 12, vh - 10, 7);
    }

    drawFilledSlot(i, _box) {
        // La caja ya muestra su color encima del slot.
        // El slot mantiene su apariencia neutra (blanco) para no cambiar de color.
        this.drawEmptySlot(i);
    }

    // ── Box grid ───────────────────────────────────────────────────────────────
    makeBoxGrid() {
        // Grid background
        const gbg = this.add.graphics();
        gbg.fillStyle(0xC8914A, 0.22);
        // Fondo solo del área de las 4 columnas centradas (BOX_X0=80, ancho=320)
        gbg.fillRoundedRect(BOX_X0 + 2, BOX_Y0 - 5, BOX_COLS * BOX_W - 4, BOX_ROWS * BOX_H + 10, 12);

        this.boxes.forEach(box => this.spawnBoxGO(box));
    }

    spawnBoxGO(box) {
        const cx = BOX_X0 + box.col * BOX_W + BOX_W / 2;
        const cy = BOX_Y0 + box.row * BOX_H + BOX_H / 2;
        box.origX = cx;
        box.origY = cy;

        const cont = this.add.container(cx, cy);
        box.container = cont;

        const color  = activeCubeColors[box.colorId];
        const lightC = lightenColor(color, 40);
        const darkC  = darkenColor(color, 48);
        // Tamaño de la caja escala con BOX_SIZE (dinámico por nivel)
        const side   = BOX_SIZE;
        const w      = side;
        const hTotal = side;
        const depthH = Math.max(3, Math.round(side * 0.11));  // franja 3D proporcional
        const r      = Math.max(4, Math.round(side * 0.18));  // radio de esquinas
        box.w = w;
        box.h = hTotal;

        const g = this.add.graphics();

        // ── 1. Rectángulo completo oscuro (forma la franja 3D visible en la base) ──
        g.fillStyle(darkenColor(color, 48));
        g.fillRoundedRect(-w / 2, -hTotal / 2, w, hTotal, r);

        // ── 2. Cara frontal (sin los últimos depthH px) — esquinas sup. redondeadas ──
        g.fillStyle(color);
        g.fillRoundedRect(-w / 2, -hTotal / 2, w, hTotal - depthH, { tl: r, tr: r, bl: 3, br: 3 });

        // ── 3. Brillo superior (franja fina arriba) ──────────────────────────────
        g.fillStyle(lightC);
        g.fillRoundedRect(-w / 2, -hTotal / 2, w, Math.floor((hTotal - depthH) * 0.18), { tl: r, tr: r, bl: 0, br: 0 });

        // ── 4. Borde exterior ────────────────────────────────────────────────────
        g.lineStyle(2, darkC);
        g.strokeRoundedRect(-w / 2, -hTotal / 2, w, hTotal, r);

        cont.add(g);

        // ── Número centrado en la cara frontal (tamaño de fuente proporcional) ──
        const fontSize = Math.max(12, Math.round(side * 0.45)) + 'px';
        const txt = this.add.text(0, -Math.round(depthH / 2), String(box.count), {
            fontSize, fontStyle: 'bold',
            color: '#FFFFFF',
            stroke: '#00000088', strokeThickness: 5,
        }).setOrigin(0.5);
        cont.add(txt);
        box.countTxt = txt;

        // Solo la primera caja de cada columna es arrastrable
        const isFirst = this.colQueues[box.col][0] === box;
        if (isFirst) {
            this.attachDragEvents(box);
        } else {
            cont.setAlpha(0.6);   // atenuar las cajas no seleccionables
        }
    }

    // Habilita interactividad y eventos de drag/tap en un box
    attachDragEvents(box) {
        const cont = box.container;
        const w    = box.w;
        const h    = box.h;

        cont.setAlpha(1);
        cont.setInteractive(
            new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
            Phaser.Geom.Rectangle.Contains
        );
        this.input.setDraggable(cont);

        // Flag para distinguir tap (sin movimiento) de drag
        let dragMoved = false;

        cont.on('dragstart', () => {
            dragMoved = false;
            cont.setDepth(25);
            this.tweens.add({ targets: cont, scaleX: 1.08, scaleY: 1.08, duration: 80 });
        });

        cont.on('drag', (_ptr, dragX, dragY) => {
            dragMoved = true;
            cont.x = dragX;
            cont.y = dragY;
        });

        cont.on('dragend', (ptr) => {
            cont.setDepth(1);

            // En Phaser 4, dragend dispara ANTES que pointerup.
            // Si no hubo arrastre real (tap), dejamos que pointerup haga la asignación.
            // Solo restauramos la escala sin mover la posición.
            if (!dragMoved) {
                this.tweens.add({ targets: cont, scaleX: 1, scaleY: 1, duration: 80 });
                return;
            }

            const si = this.slotAt(ptr.x, ptr.y);

            if (si >= 0 && this.slots[si] === null) {
                // Drag real sobre un slot válido → asignar a ese slot
                this.putBoxInSlot(box, si);
            } else {
                // Snap back a la posición original
                this.tweens.add({
                    targets: cont, x: box.origX, y: box.origY,
                    scaleX: 1, scaleY: 1, duration: 240, ease: 'Back.easeOut',
                });
            }
        });

        // Tap (presionar sin arrastrar) → asignar al primer slot libre izq→der
        cont.on('pointerup', () => {
            if (!dragMoved && !box.inSlot) {
                const si = this.nextAvailableSlot();
                if (si >= 0) this.putBoxInSlot(box, si);
            }
            dragMoved = false;
        });
    }

    // Cuando una caja es colocada en un slot, promueve la siguiente de esa columna
    promoteColumn(col) {
        const queue = this.colQueues[col];
        // Eliminar la primera (ya está en slot)
        queue.shift();

        // Animar las restantes hacia arriba (cada una ocupa la posición anterior)
        queue.forEach((nextBox, i) => {
            const newCy = BOX_Y0 + i * BOX_H + BOX_H / 2;
            nextBox.origY = newCy;
            this.tweens.add({
                targets: nextBox.container,
                y: newCy,
                duration: 240,
                ease: 'Back.easeOut',
                delay: i * 50,   // cascada leve
            });

            // La nueva primera de la columna se vuelve seleccionable
            if (i === 0) {
                this.attachDragEvents(nextBox);
            }
        });
    }

    // Primer slot vacío de izquierda a derecha; -1 si todos ocupados
    nextAvailableSlot() {
        for (let i = 0; i < N_SLOTS; i++) {
            if (this.slots[i] === null) return i;
        }
        return -1;
    }

    slotAt(px, py) {
        if (py < SLOT_Y || py > SLOT_Y + SLOT_H) return -1;
        for (let i = 0; i < N_SLOTS; i++) {
            const sx = SLOT_X0 + i * SLOT_W;
            if (px >= sx && px <= sx + SLOT_W) return i;
        }
        return -1;
    }

    putBoxInSlot(box, si) {
        // Cancelar cualquier tween activo en el contenedor para evitar conflictos
        this.tweens.killTweensOf(box.container);

        this.slots[si] = box;
        box.inSlot  = true;
        box.slotIdx = si;

        // Deshabilitar drag de la caja ahora en slot
        box.container.disableInteractive();
        this.input.setDraggable(box.container, false);

        const tx = SLOT_X0 + si * SLOT_W + SLOT_W / 2;
        const ty = SLOT_Y + SLOT_H / 2;

        this.tweens.add({
            targets: box.container, x: tx, y: ty,
            scaleX: 1, scaleY: 1, duration: 210, ease: 'Back.easeOut',
        });

        this.drawFilledSlot(si, box);

        // Recalcular velocidad: si todos los slots están llenos → auto 2x
        this.updateSpeed();

        // Promover la siguiente caja de la misma columna
        this.promoteColumn(box.col);
    }

    // ── Bottom powerup bar ─────────────────────────────────────────────────────
    makeBottomBar() {
        // BOX_Y0=516 + BOX_ROWS(4)×BOX_H(64) + 8 = 780
        const barY = BOX_Y0 + BOX_ROWS * BOX_H + 8;

        // Línea separadora
        const sep = this.add.graphics();
        sep.lineStyle(2, 0xC8A060, 0.5);
        sep.lineBetween(10, barY, GW - 10, barY);

        // 4 botones de power-up centrados (r=28 → diámetro 56, 4 botones con espacio)
        const icons = ['🍀', '✂️', '🔃', '🌸'];
        const totalW  = (icons.length - 1) * 98;
        const startX  = (GW - totalW) / 2;
        // barY = BOX_Y0(530)+BOX_ROWS(4)×BOX_H(68)+8 = 810 → by=830 → r=24 → max=854 ✓
        const by = barY + 20;

        icons.forEach((icon, i) => {
            const bx = startX + i * 98;

            // Círculo principal beige/crema (estilo de la imagen de referencia)
            const bg = this.add.graphics();
            bg.fillStyle(0xF2E8CC);
            bg.fillCircle(bx, by, 24);
            bg.lineStyle(3, 0xC8A060, 0.9);
            bg.strokeCircle(bx, by, 24);

            this.add.text(bx, by, icon, { fontSize: '22px' }).setOrigin(0.5);

            // Badge "+" verde en la esquina inferior-derecha
            const pG = this.add.graphics();
            pG.fillStyle(0x4CAF50);
            pG.fillCircle(bx + 16, by + 16, 9);
            this.add.text(bx + 16, by + 16, '+', {
                fontSize: '12px', fontStyle: 'bold', color: '#FFFFFF',
            }).setOrigin(0.5);
        });

        // ── Banner de publicidad ────────────────────────────────────────────────
        // Zona reservada en la parte inferior (y=856 → y=908, 52px)
        const adY  = barY + 46;
        const adBg = this.add.graphics();
        adBg.fillStyle(0x1A1A2E, 0.92);
        adBg.fillRect(0, adY, GW, GH - adY);
        // Texto "Publicidad" centrado + placeholder de banner
        this.add.text(GW / 2, adY + 10, 'PUBLICIDAD', {
            fontSize: '10px', letterSpacing: 4,
            color: '#888888',
        }).setOrigin(0.5, 0);
        // Rectángulo placeholder del ad (estilo banner 320×50)
        const adW = 320, adH = 30;
        const adBanner = this.add.graphics();
        adBanner.fillStyle(0x2D2D4E, 1);
        adBanner.fillRoundedRect((GW - adW) / 2, adY + 22, adW, adH, 6);
        adBanner.lineStyle(1, 0x555577, 0.7);
        adBanner.strokeRoundedRect((GW - adW) / 2, adY + 22, adW, adH, 6);
        this.add.text(GW / 2, adY + 22 + adH / 2, '[ Espacio publicitario ]', {
            fontSize: '11px', color: '#6666AA',
        }).setOrigin(0.5);
    }

    // ── Pathfinding (BFS) ──────────────────────────────────────────────────────
    // Returns array of {r, c} or null.
    // r/c can be out-of-bounds (virtual entry point from outside).
    // Prioridad: cubo más abajo (fila mayor), luego más a la izquierda (col menor).
    findPath(targetColor) {
        const board  = this.board;
        const parent = new Map();   // key 'r,c' → parent key
        const queue  = [];
        const found  = [];          // todos los cubos accesibles del color buscado

        const tryEnter = (r, c, fromKey) => {
            if (r < 0 || r >= BROWS || c < 0 || c >= BCOLS) return;
            const key  = `${r},${c}`;
            if (parent.has(key)) return;
            const cell = board[r][c];
            // Cubo del color buscado y no reservado → anotarlo, NO expandir desde él
            if (cell === targetColor && !this.reserved.has(key)) {
                parent.set(key, fromKey);
                found.push(key);
                return;
            }
            // Celda vacía → expandible
            if (cell === 0) {
                parent.set(key, fromKey);
                queue.push(key);
            }
            // Cualquier otro cubo (otro color) → bloquea paso, no se registra
        };

        // Entrar desde los 4 bordes
        for (let c = 0; c < BCOLS; c++) {
            tryEnter(0,         c, `-1,${c}`);
            tryEnter(BROWS - 1, c, `${BROWS},${c}`);
        }
        for (let r = 0; r < BROWS; r++) {
            tryEnter(r, 0,         `${r},-1`);
            tryEnter(r, BCOLS - 1, `${r},${BCOLS}`);
        }

        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        while (queue.length > 0) {
            const curr     = queue.shift();
            const [r, c]   = curr.split(',').map(Number);

            for (const [dr, dc] of dirs) {
                tryEnter(r + dr, c + dc, curr);
            }
        }

        if (found.length === 0) return null;

        // Elegir el mejor cubo: fila más alta (mayor índice = más abajo), luego col más pequeña
        found.sort((a, b) => {
            const [ar, ac] = a.split(',').map(Number);
            const [br, bc] = b.split(',').map(Number);
            if (br !== ar) return br - ar;   // mayor fila primero
            return ac - bc;                   // menor columna primero
        });

        return this.buildPath(parent, found[0]);
    }

    buildPath(parent, endKey) {
        const path = [];
        let key = endKey;
        while (key !== undefined) {
            const [r, c] = key.split(',').map(Number);
            path.unshift({ r, c });
            key = parent.get(key);
        }
        return path;
    }

    // ── Box ordering helpers ───────────────────────────────────────────────────

    // BFS en simBoard: devuelve true si cualquier cubo de colorId es alcanzable
    // desde alguno de los 4 bordes del tablero sin pasar por celdas no-cero ni no-colorId.
    _colorReachableOnBoard(colorId, simBoard) {
        const rows = simBoard.length;
        const cols = simBoard[0]?.length ?? 0;
        const visited = new Set();
        const queue = [];
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];

        const seed = (r, c) => {
            if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
            const key = `${r},${c}`;
            if (visited.has(key)) return false;
            visited.add(key);
            const cell = simBoard[r][c];
            if (cell === colorId) return true;    // encontrado
            if (cell === 0) queue.push([r, c]);   // celda vacía: expandir
            return false;                          // otro color: bloquea
        };

        // Sembrar desde los 4 bordes
        for (let c = 0; c < cols; c++) {
            if (seed(0, c)) return true;
            if (seed(rows - 1, c)) return true;
        }
        for (let r = 1; r < rows - 1; r++) {
            if (seed(r, 0)) return true;
            if (seed(r, cols - 1)) return true;
        }

        while (queue.length > 0) {
            const [r, c] = queue.shift();
            for (const [dr, dc] of dirs) {
                if (seed(r + dr, c + dc)) return true;
            }
        }
        return false;
    }

    // Ordena las cajas para máxima jugabilidad:
    // 1er tier → colores alcanzables desde el borde inicial,
    // tiers siguientes → colores que quedan accesibles tras limpiar el tier anterior.
    // Dentro de cada tier: mayor conteo de cubos primero.
    _computeBoxOrder(boxes, initialBoard) {
        const simBoard  = initialBoard.map(row => [...row]);
        const uniqueIds = [...new Set(boxes.map(b => b.colorId))];
        const remaining = new Set(uniqueIds);
        const colorOrder = [];

        const countOf = cid => boxes.reduce((s, b) => b.colorId === cid ? s + b.count : s, 0);

        while (remaining.size > 0) {
            // Colores del tier actual: accesibles desde el borde en la simulación
            const tier = [...remaining].filter(cid => this._colorReachableOnBoard(cid, simBoard));

            if (tier.length === 0) {
                // Deadlock de simulación — agregar resto en orden original
                for (const cid of remaining) colorOrder.push(cid);
                break;
            }

            // Ordenar tier: más cubos primero (libera más espacio rápidamente)
            tier.sort((a, b) => countOf(b) - countOf(a));

            for (const cid of tier) {
                colorOrder.push(cid);
                remaining.delete(cid);
                // Limpiar este color de la simulación para recalcular el siguiente tier
                for (let r = 0; r < simBoard.length; r++)
                    for (let c = 0; c < simBoard[r].length; c++)
                        if (simBoard[r][c] === cid) simBoard[r][c] = 0;
            }
        }

        // Reordenar: primero por colorOrder, luego por count desc dentro del mismo color
        return boxes.slice().sort((a, b) => {
            const d = colorOrder.indexOf(a.colorId) - colorOrder.indexOf(b.colorId);
            return d !== 0 ? d : b.count - a.count;
        });
    }

    // ── Helpers de movimiento perimetral ──────────────────────────────────────

    // Determina por qué borde del tablero entra el BFS (la celda virtual r,c)
    getEntryEdge(r, c) {
        if (r < 0)      return 'top';
        if (r >= BROWS) return 'bottom';
        if (c < 0)      return 'left';
        return 'right';
    }

    // Waypoints ortogonales: desde (sx,sy) — debajo del tablero —
    // caminando por el perimetro exterior hasta el punto de entrada (ex,ey).
    perimeterToEntry(sx, sy, ex, ey, edge) {
        const bY = BOARD_Y + BOARD_H + CELL / 2;   // nivel inferior exterior
        const tY = BOARD_Y - CELL / 2;              // nivel superior exterior
        const lX = BOARD_X - CELL / 2;              // borde izquierdo exterior
        const rX = BOARD_X + BOARD_W + CELL / 2;   // borde derecho exterior
        const pts = [];

        // 1. Subir hasta el nivel del borde inferior del tablero
        if (sy !== bY) pts.push({ x: sx, y: bY });

        if (edge === 'bottom') {
            // Entrada por abajo: solo desplazarse horizontalmente
            pts.push({ x: ex, y: bY });

        } else if (edge === 'left') {
            // Ir al borde izquierdo, luego subir hasta la fila de entrada
            pts.push({ x: lX, y: bY });
            if (ey < bY) pts.push({ x: lX, y: ey });

        } else if (edge === 'right') {
            // Ir al borde derecho, luego subir hasta la fila de entrada
            pts.push({ x: rX, y: bY });
            if (ey < bY) pts.push({ x: rX, y: ey });

        } else {
            // Entrada por arriba: elegir el lado (izq/der) con menor distancia total
            const leftCost  = Math.abs(sx - lX) + Math.abs(ex - lX);
            const rightCost = Math.abs(sx - rX) + Math.abs(ex - rX);
            const sideX = leftCost <= rightCost ? lX : rX;
            pts.push({ x: sideX, y: bY });
            pts.push({ x: sideX, y: tY });
            pts.push({ x: ex,    y: tY });
        }

        return pts;
    }

    // Waypoints ortogonales: desde el punto de entrada del BFS (ex,ey)
    // caminando por el perimetro hasta el agujero (hx,hy).
    perimeterToHole(ex, ey, hx, hy, edge) {
        const bY = BOARD_Y + BOARD_H + CELL / 2;
        const tY = BOARD_Y - CELL / 2;
        const lX = BOARD_X - CELL / 2;
        const rX = BOARD_X + BOARD_W + CELL / 2;
        const pts = [];

        if (edge === 'bottom') {
            // Ya en el borde inferior: ir directamente al x del agujero
            pts.push({ x: hx, y: bY });

        } else if (edge === 'left') {
            // Bajar por el borde izquierdo hasta el nivel inferior, luego al agujero
            pts.push({ x: lX, y: bY });
            pts.push({ x: hx, y: bY });

        } else if (edge === 'right') {
            pts.push({ x: rX, y: bY });
            pts.push({ x: hx, y: bY });

        } else {
            // Desde arriba: bajar por el lado con menor distancia total
            const leftCost  = Math.abs(ex - lX) + Math.abs(hx - lX);
            const rightCost = Math.abs(ex - rX) + Math.abs(hx - rX);
            const sideX = leftCost <= rightCost ? lX : rX;
            pts.push({ x: sideX, y: tY });
            pts.push({ x: sideX, y: bY });
            pts.push({ x: hx,    y: bY });
        }

        // Tramo final: bajar hasta el agujero
        pts.push({ x: hx, y: hy });
        return pts;
    }

    // Encadena tweens ortogonales a través de un array de waypoints {x,y}.
    // Orienta la hormiga en cada segmento. Llama a onComplete al terminar.
    animateWaypoints(ant, waypoints, msPx, onComplete) {
        let wi = 0;
        const next = () => {
            if (wi >= waypoints.length) { onComplete(); return; }
            const tgt = waypoints[wi];
            const dx  = tgt.x - ant.x;
            const dy  = tgt.y - ant.y;
            const dist = Math.hypot(dx, dy);
            if (dx !== 0 || dy !== 0) ant.rotation = Math.atan2(dy, dx) + Math.PI / 2;
            wi++;
            if (dist < 1) { next(); return; }   // ya está en ese punto, saltar
            this.tweens.add({
                targets: ant, x: tgt.x, y: tgt.y,
                duration: Math.max(1, Math.round(dist * msPx)),
                ease: 'Linear',
                onComplete: next,
            });
        };
        next();
    }

    // ── Ant dispatch loop ──────────────────────────────────────────────────────
    tickSlots() {
        // Escalonar 30 ms entre cada slot para que no liberen hormigas en el mismo instante
        for (let i = 0; i < N_SLOTS; i++) {
            const slotDelay = i * 30;
            if (slotDelay === 0) {
                this._dispatchSlot(i);
            } else {
                this.time.delayedCall(slotDelay, () => this._dispatchSlot(i));
            }
        }
        // Verificar derrota una vez que todos los slots hayan intentado despachar
        this.time.delayedCall(N_SLOTS * 30 + 100, () => this.checkLose());
    }

    // Despacha hasta MAX_PER_TICK hormigas desde un slot en un mismo ciclo,
    // siempre que existan celdas accesibles distintas para cada una.
    _dispatchSlot(i) {
        const MAX_PER_TICK = 3;  // máximo de hormigas concurrentes por slot por tick
        let dispatched = 0;

        while (dispatched < MAX_PER_TICK) {
            const box = this.slots[i];
            if (!box || box.count <= 0) break;

            const path = this.findPath(box.colorId);
            if (!path || path.length < 2) {
                if (dispatched === 0) {
                    console.log(`[slot ${i}] color=${box.colorId} count=${box.count} → sin camino accesible`);
                }
                break;
            }

            const last = path[path.length - 1];
            const key  = `${last.r},${last.c}`;

            // Decrementar contador al DESPACHAR la hormiga (no al llegar al cubo)
            // así el contador refleja cuántas hormigas quedan por liberar
            box.count = Math.max(0, box.count - 1);
            const countStr = String(box.count);
            if (box.countTxt) {
                box.countTxt.setText(countStr);
                this.tweens.add({ targets: box.countTxt, scaleX: 1.4, scaleY: 1.4, duration: 90, yoyo: true });
            }

            console.log(`[slot ${i}] color=${box.colorId} count=${box.count} → hormiga hacia (${last.r},${last.c}) path.len=${path.length}`);
            this.reserved.add(key);
            this.launchAnt(i, box, path);

            // Si era la última hormiga de esta caja, liberar el slot de inmediato
            // para que el jugador pueda colocar otra caja sin esperar el regreso
            if (box.count === 0 && this.slots[i] === box) {
                console.log(`[slot ${i}] último despacho → liberar slot`);
                this.freeSlot(i);
                break;
            }
            dispatched++;
        }
    }

    // ── Ant launch & animation ─────────────────────────────────────────────────
    launchAnt(slotIdx, box, path) {
        const pixels       = path.map(({ r, c }) => cellPx(r, c));
        const virtualEntry = path[0];                           // celda virtual {r,c}
        const entry        = pixels[0];                         // pixel del punto de entrada
        const edge         = this.getEntryEdge(virtualEntry.r, virtualEntry.c);

        const slotCx = SLOT_X0 + slotIdx * SLOT_W + SLOT_W / 2;
        const slotCy = SLOT_Y + SLOT_H / 2;
        const holeX  = GW / 2;
        const holeY  = HOLE_Y;  // usar la constante definida en el módulo

        const MS_PER_PX = this.msPerPx;   // ms/px capturado al despachar — igual en todo el camino

        // Hormiga aparece en el slot con el color de su caja
        const ant = this.makeAntSprite(slotCx, slotCy, box.colorId);

        // ── FASE 3+4: BFS invertido (cubo → entrada) + perimetro → agujero ───
        const doBfsReturn = () => {
            // Tramos rectos fusionados → misma velocidad efectiva que el perimetro
            const returnPath = mergeCollinear([...pixels].reverse());
            this.animateWaypoints(ant, returnPath, MS_PER_PX, () => {
                // Salió del tablero → Fase 4: caminar por perimetro al agujero
                const toHoleWps = this.perimeterToHole(entry.x, entry.y, holeX, holeY, edge);
                console.log(`[ant slot ${slotIdx}] regreso al agujero, waypoints=${toHoleWps.length}`);
                this.animateWaypoints(ant, toHoleWps, MS_PER_PX, () => {
                    console.log(`[ant slot ${slotIdx}] llegó al agujero, count=${box.count}`);
                    // Animación: hormiga (y cubo cargado) se hunde en el agujero
                    this.tweens.add({
                        targets : ant,
                        scaleX  : 0.05,
                        scaleY  : 0.05,
                        y       : ant.y + 7,
                        alpha   : 0,
                        duration: 160,
                        ease    : 'Quad.easeIn',
                        onComplete: () => {
                            ant.destroy();
                            // Verificar que ESTA caja siga en el slot antes de liberarlo.
                            // Una hormiga rezagada podría llamar freeSlot sobre una caja
                            // distinta que el jugador colocó después en el mismo slot.
                            if (box.count <= 0 && this.slots[slotIdx] === box) {
                                console.log(`[slot ${slotIdx}] liberando slot (count=0)`);
                                this.freeSlot(slotIdx);
                            }
                            this.checkWin();
                            this.checkLose();
                        },
                    });
                });
            });
        };

        // ── FASE 1: slot → perimetro del tablero → punto de entrada ──────────
        // ── FASE 2: BFS entrada → cubo (tramos rectos fusionados) ────────────
        const toEntry  = this.perimeterToEntry(slotCx, slotCy, entry.x, entry.y, edge);
        const boardPath = mergeCollinear(pixels);
        this.animateWaypoints(ant, toEntry, MS_PER_PX, () => {
            this.animateWaypoints(ant, boardPath, MS_PER_PX, () => {
                this.onAntArrived(slotIdx, box, path, ant, doBfsReturn);
            });
        });
    }

    onAntArrived(slotIdx, box, path, ant, doReturn) {
        const last      = path[path.length - 1];
        const lastKey   = `${last.r},${last.c}`;

        // Liberar la reserva de esta celda
        this.reserved.delete(lastKey);

        // El contador ya fue decrementado al despachar la hormiga (en tickSlots).
        // Obtener color del cubo ANTES de removerlo (para la animación de carga).
        const cubeColorId = this.board[last.r][last.c];
        const cubeExistia = cubeColorId !== 0;
        const cubePx      = cellPx(last.r, last.c);

        console.log(`[ant slot ${slotIdx}] llegó a (${last.r},${last.c}) cuboExistia=${cubeExistia} count=${box.count}`);
        this.removeCube(last.r, last.c);

        if (!cubeExistia) {
            // No hay cubo que recoger → regresar directamente
            this.time.delayedCall(80, doReturn);
            return;
        }

        // ── Animación: hormiga levanta el cubo en sus mandíbulas (diagonal) ──
        const cs      = CELL - 2;          // tamaño del mini-cubo (18 px)
        const color   = activeCubeColors[cubeColorId];
        const pickup  = this.add.graphics().setDepth(16);

        // Dibujar mini-cubo en el gráfico de pickup
        this._drawCarriedCube(pickup, cs, color);
        pickup.x        = cubePx.x;
        pickup.y        = cubePx.y;
        pickup.rotation = Math.PI / 4;   // 45° diagonal (en mandíbulas)
        pickup.setScale(1.0);

        // Tween: el cubo vuela hacia la hormiga (efecto de recogida)
        this.tweens.add({
            targets : pickup,
            x       : ant.x,
            y       : ant.y - 8,
            scaleX  : 0.68,
            scaleY  : 0.68,
            duration: 190,
            ease    : 'Back.easeOut',
            onComplete: () => {
                // Destruir el gráfico temporal y crear uno dentro del container
                pickup.destroy();

                // Cubo adjunto al container de la hormiga — viaja con ella automáticamente
                const carried = this.add.graphics();
                this._drawCarriedCube(carried, cs, color);
                carried.x        = 0;
                carried.y        = -14;    // encima del cuerpo → posición de las mandíbulas
                carried.rotation = Math.PI / 4;
                carried.setScale(0.68);
                ant.add(carried);          // ant es Container → carried sigue todos sus movimientos

                doReturn();
            },
        });
    }

    // ── Helper: dibuja un mini-cubo 3D sobre el graphics indicado ──────────────
    // El pivot está en el centro del cubo.
    _drawCarriedCube(g, size, color) {
        const r = 2;
        const s = size;
        // Cara lateral (profundidad 3D)
        g.fillStyle(darkenColor(color, 52));
        g.fillRoundedRect(-s / 2 + 2, -s / 2 + 2, s, s, r);
        // Cara frontal
        g.fillStyle(color);
        g.fillRoundedRect(-s / 2, -s / 2, s, s, r);
        // Brillo superior
        g.fillStyle(lightenColor(color, 48));
        g.fillRoundedRect(-s / 2, -s / 2, s, Math.floor(s * 0.38), { tl: r, tr: r, bl: 0, br: 0 });
        // Borde
        g.lineStyle(1.5, darkenColor(color, 38));
        g.strokeRoundedRect(-s / 2, -s / 2, s, s, r);
    }

    // ── Ant sprite — sprite animado con frames h0-h5 ─────────────────────────
    // Devuelve un Container para que el cubo cargado viaje con la hormiga.
    // La cabeza del sprite apunta hacia arriba → atan2(dy,dx)+PI/2 orienta correctamente.
    makeAntSprite(x, y, colorId = null) {
        const cont = this.add.container(x, y).setDepth(15);

        // Sprite animado (sin badge de color)
        const sprite = this.add.sprite(0, 0, 'ant_h0')
            .setScale(0.040);   // imagen ~580 px alto → ~23 px en pantalla
        sprite.play('ant_walk');
        cont.add(sprite);

        return cont;
    }

    // ── Cube removal ───────────────────────────────────────────────────────────
    removeCube(r, c) {
        if (this.board[r][c] === 0) return;

        // Pop flash
        const px  = BOARD_X + c * CELL + CELL / 2;
        const py  = BOARD_Y + r * CELL + CELL / 2;
        const clr = activeCubeColors[this.board[r][c]];
        const fl  = this.add.rectangle(px, py, CELL - 1, CELL - 1, clr).setDepth(12);
        this.tweens.add({
            targets: fl, scaleX: 1.35, scaleY: 1.35, alpha: 0, duration: 220,
            ease: 'Quad.easeOut', onComplete: () => fl.destroy(),
        });

        // Tiny particle burst (4 dots)
        for (let p = 0; p < 4; p++) {
            const angle = (p / 4) * Math.PI * 2;
            const dot   = this.add.arc(px, py, 2, 0, 360, false, clr).setDepth(13);
            this.tweens.add({
                targets: dot, x: px + Math.cos(angle) * 14, y: py + Math.sin(angle) * 14,
                alpha: 0, duration: 280, ease: 'Quad.easeOut',
                onComplete: () => dot.destroy(),
            });
        }

        this.board[r][c] = 0;
        this.redrawBoard();
    }

    // ── Slot cleanup ───────────────────────────────────────────────────────────
    freeSlot(si) {
        const box = this.slots[si];
        if (!box) return;

        this.slots[si] = null;
        box.inSlot   = false;
        box.slotIdx  = -1;
        box.active   = false;
        // Nulificar inmediatamente para que hormigas aún en vuelo no tweeneen
        // un objeto Phaser ya destruido (crash "Cannot read properties of null 'drawImage'")
        box.countTxt = null;

        this.drawEmptySlot(si);

        // Recalcular velocidad: si un slot se libera → quizás dejar de ser auto-2x
        this.updateSpeed();

        if (box.container) {
            // Pop rápido: crece levemente luego desaparece (110 ms total)
            this.tweens.add({
                targets: box.container,
                scaleX: 1.12, scaleY: 1.12,
                duration: 50, ease: 'Quad.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: box.container,
                        scaleX: 0, scaleY: 0, alpha: 0,
                        duration: 110, ease: 'Back.easeIn',
                        onComplete: () => { box.container?.destroy(); box.container = null; },
                    });
                },
            });
        }
    }

    // ── Velocidad dinámica ─────────────────────────────────────────────────────
    // Recalcula antSpeed/msPerPx según botón manual Y según si todos los slots
    // están ocupados (auto-2x). Se llama tras asignar o liberar un slot.
    updateSpeed() {
        const allFull  = this.slots.every(s => s !== null);
        const isFast   = this.speedBoost || allFull;
        // Derivar antSpeed a partir de CELL × msPerPx para que la velocidad en
        // px/s sea siempre igual dentro del tablero y en el perimetro.
        this.msPerPx   = isFast ? 2.5 : 5;
        this.antSpeed  = CELL * this.msPerPx;
    }

    // ── Win condition ──────────────────────────────────────────────────────────
    // ── Win condition — PRIORIDAD MÁXIMA ─────────────────────────────────────
    // Si todos los cubos del tablero fueron removidos → victoria, sin importar
    // el estado de lost (puede haber sido marcado prematuramente por checkLose).
    checkWin() {
        if (this.won) return;
        for (let r = 0; r < BROWS; r++) {
            for (let c = 0; c < BCOLS; c++) {
                if (this.board[r][c] !== 0) return; // aún quedan cubos
            }
        }
        // Victoria: anular cualquier derrota prematura y mostrar pantalla de ganador
        this.won  = true;
        this.lost = false;
        this.time.delayedCall(600, () => this.showWinScreen());
    }

    // ── Lose condition ─────────────────────────────────────────────────────────
    // Se activa cuando la última hormiga llega al hoyo Y no hay más jugadas posibles.
    // NUNCA se activa si el tablero está vacío (eso es condición de victoria).
    checkLose() {
        if (this.won || this.lost) return;

        // Guardia principal: tablero vacío = victoria pendiente, nunca derrota
        let boardEmpty = true;
        outer: for (let r = 0; r < BROWS; r++) {
            for (let c = 0; c < BCOLS; c++) {
                if (this.board[r][c] !== 0) { boardEmpty = false; break outer; }
            }
        }
        if (boardEmpty) return;

        // Hormigas en vuelo → esperar; al aterrizar pueden abrir caminos
        if (this.reserved.size > 0) return;

        // ¿Algún slot activo (count > 0) puede alcanzar un cubo?
        for (const box of this.slots) {
            if (!box || box.count <= 0) continue;
            if (this.findPath(box.colorId)) return;   // puede despachar → no pierde
        }

        // ¿Se puede agregar una caja con cubos accesibles?
        const hasEmptySlot  = this.slots.some(s => s === null);
        const finishingSoon = this.slots.some(s => s && s.count <= 0);
        const canAddBox     = hasEmptySlot || finishingSoon;

        if (canAddBox) {
            const pendingBoxes = this.boxes.filter(b => b.active && b.count > 0 && !b.inSlot);
            for (const b of pendingBoxes) {
                if (this.findPath(b.colorId)) return;   // esa caja puede progresar → no pierde
            }
        }

        // Sin jugadas posibles y tablero no vacío → derrota
        this.lost = true;
        this.time.delayedCall(800, () => this.showLoseScreen());
    }

    showLoseScreen() {
        // Overlay oscuro
        const ov = this.add.graphics().setDepth(50);
        ov.fillStyle(0x000000, 0.60);
        ov.fillRect(0, 0, GW, GH);

        // Tarjeta roja
        const cw = 320, ch = 316;
        const cx = GW / 2, cy = GH / 2;
        const card = this.add.graphics().setDepth(51);
        card.fillStyle(0x7B1111);
        card.fillRoundedRect(cx - cw / 2 + 4, cy - ch / 2 + 4, cw, ch, 20);
        card.fillStyle(0xFFF0F0);
        card.fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 20);

        this.add.text(cx, cy - 80, '😞', { fontSize: '62px' }).setOrigin(0.5).setDepth(52);
        this.add.text(cx, cy - 10, '¡Sin jugadas!', {
            fontSize: '26px', fontStyle: 'bold', color: '#B71C1C',
            stroke: '#FFCDD2', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(52);
        this.add.text(cx, cy + 34, 'Los slots están bloqueados', {
            fontSize: '14px', color: '#7B1111',
        }).setOrigin(0.5).setDepth(52);

        // Botón "Intentar de nuevo"
        const btnG = this.add.graphics().setDepth(52);
        btnG.fillStyle(0xC62828);
        btnG.fillRoundedRect(cx - 90, cy + 70, 180, 46, 23);
        btnG.fillStyle(0xEF5350);
        btnG.fillRoundedRect(cx - 86, cy + 74, 172, 17, 11);

        const btnTxt = this.add.text(cx, cy + 93, 'Intentar de nuevo', {
            fontSize: '17px', fontStyle: 'bold', color: '#FFFFFF',
            stroke: '#7B1111', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(53);

        btnG.setInteractive(
            new Phaser.Geom.Rectangle(cx - 90, cy + 70, 180, 46),
            Phaser.Geom.Rectangle.Contains
        );
        btnG.on('pointerdown', () => this.scene.restart({ levelId: this.currentLevel }));
        btnG.on('pointerover',  () => btnG.setAlpha(0.88));
        btnG.on('pointerout',   () => btnG.setAlpha(1));

        // Botón "Menú"
        const menuG = this.add.graphics().setDepth(52);
        menuG.fillStyle(0x1565C0);
        menuG.fillRoundedRect(cx - 90, cy + 124, 180, 46, 23);
        menuG.fillStyle(0x1E88E5);
        menuG.fillRoundedRect(cx - 86, cy + 128, 172, 17, 11);

        const menuTxt = this.add.text(cx, cy + 147, 'Menú', {
            fontSize: '20px', fontStyle: 'bold', color: '#FFFFFF',
            stroke: '#0D47A1', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(53);

        menuG.setInteractive(
            new Phaser.Geom.Rectangle(cx - 90, cy + 124, 180, 46),
            Phaser.Geom.Rectangle.Contains
        );
        menuG.on('pointerdown', () => this.scene.start('Menu'));
        menuG.on('pointerover',  () => menuG.setAlpha(0.88));
        menuG.on('pointerout',   () => menuG.setAlpha(1));
    }

    showWinScreen() {
        // Darken overlay
        const ov = this.add.graphics().setDepth(50);
        ov.fillStyle(0x000000, 0.55);
        ov.fillRect(0, 0, GW, GH);

        // Card
        const cw = 320, ch = 316;
        const cx = GW / 2, cy = GH / 2;
        const card = this.add.graphics().setDepth(51);
        card.fillStyle(0x8B6914);
        card.fillRoundedRect(cx - cw / 2 + 4, cy - ch / 2 + 4, cw, ch, 20);
        card.fillStyle(0xFFF8E1);
        card.fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, 20);

        this.add.text(cx, cy - 80, '🎉', { fontSize: '62px' }).setOrigin(0.5).setDepth(52);
        this.add.text(cx, cy - 10, 'Level Complete!', {
            fontSize: '28px', fontStyle: 'bold', color: '#2E7D32',
            stroke: '#A5D6A7', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(52);
        this.add.text(cx, cy + 34, '⭐ ⭐ ⭐', { fontSize: '36px' }).setOrigin(0.5).setDepth(52);

        // Play Again button
        // Botón "Play Again" — reiniciar el mismo nivel
        const btnG = this.add.graphics().setDepth(52);
        btnG.fillStyle(0x43A047);
        btnG.fillRoundedRect(cx - 90, cy + 80, 180, 46, 23);
        btnG.fillStyle(0x66BB6A);
        btnG.fillRoundedRect(cx - 86, cy + 84, 172, 17, 11);

        const btnTxt = this.add.text(cx, cy + 103, 'Play Again', {
            fontSize: '20px', fontStyle: 'bold', color: '#FFFFFF',
            stroke: '#1B5E20', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(53);

        btnG.setInteractive(
            new Phaser.Geom.Rectangle(cx - 90, cy + 80, 180, 46),
            Phaser.Geom.Rectangle.Contains
        );
        btnG.on('pointerdown', () => this.scene.restart({ levelId: this.currentLevel }));
        btnG.on('pointerover',  () => btnG.setAlpha(0.88));
        btnG.on('pointerout',   () => btnG.setAlpha(1));

        // Botón "Menú" — volver a selección de nivel
        const menuG = this.add.graphics().setDepth(52);
        menuG.fillStyle(0x1565C0);
        menuG.fillRoundedRect(cx - 90, cy + 134, 180, 46, 23);
        menuG.fillStyle(0x1E88E5);
        menuG.fillRoundedRect(cx - 86, cy + 138, 172, 17, 11);

        const menuTxt = this.add.text(cx, cy + 157, 'Menú', {
            fontSize: '20px', fontStyle: 'bold', color: '#FFFFFF',
            stroke: '#0D47A1', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(53);

        menuG.setInteractive(
            new Phaser.Geom.Rectangle(cx - 90, cy + 134, 180, 46),
            Phaser.Geom.Rectangle.Contains
        );
        menuG.on('pointerdown', () => this.scene.start('Menu'));
        menuG.on('pointerover',  () => menuG.setAlpha(0.88));
        menuG.on('pointerout',   () => menuG.setAlpha(1));
    }
}
