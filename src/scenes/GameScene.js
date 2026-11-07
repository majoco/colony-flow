import Phaser from 'phaser';
import * as LevelData from '../data/LevelData.js';
import { CUBE_COLORS, lightenColor, darkenColor } from '../data/LevelData.js';

// Niveles disponibles: todas las exportaciones LEVEL_N de LevelData.js, ordenadas por N
export function getLevels() {
    return Object.keys(LevelData)
        .map(k => k.match(/^LEVEL_(\d+)$/))
        .filter(Boolean)
        .map(m => ({ id: +m[1], data: LevelData[m[0]] }))
        .sort((a, b) => a.id - b.id);
}
export function getLevel(id) {
    return LevelData[`LEVEL_${id}`] ?? getLevels()[0]?.data ?? null;
}

// ── Layout constants ───────────────────────────────────────────────────────────
const GW = 480;   // game width
let   GH = 908;   // game height — se actualiza en create() con la altura real (this.scale.height)

// Zona reservada para publicidad, anclada al borde inferior REAL de la pantalla
const AD_H  = 60;   // alto del banner (320×50 + margen)
const BAR_H = 56;   // alto de la barra de power-ups (sobre el banner)

// Constantes dinámicas — se reinicializan en create() según el nivel seleccionado
let CELL    = 20;   // px per board cell
let BCOLS   = 20;   // board columns
let BROWS   = 14;   // board rows
let BOARD_W = BCOLS * CELL;
let BOARD_H = BROWS * CELL;
let BOARD_X = (GW - BOARD_W) / 2;
const BOARD_Y = 155;  // posición Y del tablero (marco a y=139, como la referencia)

// Cajas — medidas tomadas del juego de referencia (484×1080 → 480 de ancho)
const BOX_VISIBLE_ROWS = 3;   // filas visibles por columna; el resto espera oculto y sube
let BOX_ROWS = 3;     // filas de cajas que ocupan layout (= min(filas reales, visibles))
let BOX_H    = 70;    // separación vertical entre cajas (caja 62 + 8 de hueco)
let BOX_COLS = 4;
let BOX_W    = 75;    // separación horizontal entre cajas
let BOX_X0   = (GW - BOX_COLS * BOX_W) / 2;

// Agujero y slots — se recalculan en create() según BOARD_H
const SLOT_OFF = 125;  // borde superior de los slots bajo la base del tablero
const FRAME_BOTTOM_OFF = 16;  // borde inferior del marco del tablero bajo la base
const HOLE_OFF = (FRAME_BOTTOM_OFF + SLOT_OFF) / 2;   // agujero a mitad de camino entre marco y slots
const BOX_OFF  = 32;   // hueco entre slots y primera fila de cajas
let HOLE_Y = BOARD_Y + BOARD_H + HOLE_OFF;

const N_SLOTS  = 5;
const SLOT_W   = 72;
const SLOT_H   = 56;
let SLOT_Y   = BOARD_Y + BOARD_H + SLOT_OFF;
const SLOT_X0  = (GW - N_SLOTS * SLOT_W) / 2;
let BOX_Y0   = SLOT_Y + SLOT_H + BOX_OFF;

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

// Verifica que la diagonal entre dos celdas de grid no cruce ningún cubo relleno.
// Usa muestreo Bresenham sobre el eje más largo para detectar colisiones.
function diagonalClear(board, r1, c1, r2, c2) {
    const dr    = r2 - r1;
    const dc    = c2 - c1;
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    if (steps === 0) return true;
    const sr = dr / steps;
    const sc = dc / steps;
    const rows = board.length;
    const cols = rows > 0 ? board[0].length : 0;
    for (let i = 1; i < steps; i++) {
        const r = Math.round(r1 + sr * i);
        const c = Math.round(c1 + sc * i);
        if (r >= 0 && r < rows && c >= 0 && c < cols && board[r][c] !== 0) return false;
    }
    return true;
}

// Convierte pares de segmentos ortogonales en "L" (horizontal+vertical o viceversa)
// en un único segmento diagonal directo, SOLO si la diagonal no cruza ningún cubo.
// Se aplica tras mergeCollinear para que las hormigas tomen atajos diagonales seguros.
function mergeOrthToDiag(pts, board) {
    if (pts.length < 3) return [...pts];
    const out = [pts[0]];
    let i = 1;
    while (i < pts.length) {
        if (i + 1 < pts.length) {
            const a = out[out.length - 1];
            const b = pts[i];
            const c = pts[i + 1];
            // horizontal→vertical (hv) o vertical→horizontal (vh)
            const hv = (a.y === b.y && b.x !== a.x && b.x === c.x && b.y !== c.y);
            const vh = (a.x === b.x && b.y !== a.y && b.y === c.y && b.x !== c.x);
            if (hv || vh) {
                // Convertir píxeles a celdas de grid para verificar colisión
                const r1 = Math.floor((a.y - BOARD_Y) / CELL);
                const c1 = Math.floor((a.x - BOARD_X) / CELL);
                const r2 = Math.floor((c.y - BOARD_Y) / CELL);
                const c2 = Math.floor((c.x - BOARD_X) / CELL);
                // Solo diagonal si el camino está despejado de cubos
                if (diagonalClear(board, r1, c1, r2, c2)) {
                    out.push(c);
                    i += 2;
                    continue;
                }
            }
        }
        out.push(pts[i]);
        i++;
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
        const lvl   = getLevel(lvlId);
        this.levelData   = lvl;
        this.currentLevel = lvlId;   // guardado para Play Again

        // Altura real de la pantalla (definida en main.js según el viewport del dispositivo)
        GH = this.scale.height;

        // Reinicializar constantes de layout dinámicas según el nivel seleccionado
        CELL    = lvl.cell    ?? 20;
        BCOLS   = lvl.cols    ?? 20;
        BROWS   = lvl.rows    ?? 14;
        BOARD_W = BCOLS * CELL;
        BOARD_H = BROWS * CELL;
        BOARD_X = (GW - BOARD_W) / 2;
        // Agujero y slots a distancias fijas bajo el tablero (como la referencia)
        const holeOff = lvl.holeOffset ?? HOLE_OFF;
        let   slotOff = lvl.slotOffset ?? SLOT_OFF;
        HOLE_Y  = BOARD_Y + BOARD_H + holeOff;
        SLOT_Y  = BOARD_Y + BOARD_H + slotOff;
        BOX_Y0  = SLOT_Y + SLOT_H + BOX_OFF;
        BOX_COLS = lvl.boxCols ?? 4;
        BOX_W    = lvl.boxW    ?? 75;
        BOX_H    = lvl.boxH    ?? 70;
        BOX_X0   = (GW - BOX_COLS * BOX_W) / 2;
        BOX_SIZE = lvl.boxSize ?? 62;
        // Filas reales de cajas (según posiciones explícitas o nº de cajas) y filas visibles
        const maxRowDef = Math.max(-1, ...(lvl.boxes ?? []).map(b => b[3] ?? -1));
        this.totalBoxRows = maxRowDef >= 0
            ? maxRowDef + 1
            : Math.ceil((lvl.boxes?.length ?? 16) / BOX_COLS);
        BOX_ROWS = Math.min(this.totalBoxRows, BOX_VISIBLE_ROWS);
        activeCubeColors = lvl.colors ?? CUBE_COLORS;

        // ── Ajuste vertical de seguridad: las filas visibles deben terminar antes
        // de la barra de power-ups y del banner (anclados al fondo real).
        // Con GH ≥ 1067 y tablero 30×12 no se activa; protege tableros más altos.
        const contentBottom = GH - AD_H - BAR_H;
        const boxesBottom   = () => BOX_Y0 + BOX_ROWS * BOX_H;
        const relayout = () => {
            BOARD_W = BCOLS * CELL;
            BOARD_H = BROWS * CELL;
            BOARD_X = (GW - BOARD_W) / 2;
            HOLE_Y  = BOARD_Y + BOARD_H + holeOff;
            SLOT_Y  = BOARD_Y + BOARD_H + slotOff;
            BOX_Y0  = SLOT_Y + SLOT_H + BOX_OFF;
        };
        if (boxesBottom() > contentBottom) {
            // 1) Acercar los slots al tablero (mín. 96 px)
            slotOff = Math.max(96, slotOff - (boxesBottom() - contentBottom));
            relayout();
        }
        while (boxesBottom() > contentBottom && CELL > 10) {
            // 2) Reducir ligeramente el tamaño de celda del tablero (mín. 10 px)
            CELL -= 1;
            relayout();
        }

        // Mutable board (copy of level grid)
        this.board = lvl.grid.map(row => [...row]);

        // Slot state
        this.slots       = new Array(N_SLOTS).fill(null);  // null | boxObj
        this.antMoving   = new Array(N_SLOTS).fill(false); // ant in-flight?
        this.reserved    = new Set();                       // 'r,c' keys con hormiga en vuelo
        this.antsInFlight = 0;                              // hormigas vivas (slot → agujero)

        // Box objects array
        // Formato de caja: [colorId, count] o [colorId, count, col, row] (posición explícita
        // definida en el editor). Sin col/row se colocan en orden fila-a-fila.
        this.boxes = lvl.boxes.map((b, i) => ({
            id       : i,
            colorId  : b[0],
            count    : b[1],
            col      : b[2] ?? (i % BOX_COLS),
            row      : b[3] ?? Math.floor(i / BOX_COLS),
            hasPos   : b[2] !== undefined && b[3] !== undefined,
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
            // Respetar el orden/posiciones diseñados en el editor
            this.boxes.forEach((b, i) => {
                b.id = i;
                if (!b.hasPos) {
                    b.col = i % BOX_COLS;
                    b.row = Math.floor(i / BOX_COLS);
                }
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
        this.msPerPx   = 6.0;                // ms por pixel (≈167 px/s)
        this.antSpeed  = CELL * this.msPerPx; // ms por celda = mismo px/s que el perimetro
        this.speedBoost = false;

        // Cached slot Graphics objects
        this.slotGfx = [];

        // Colas por columna: array de 4 arrays, ordenados por row (primero = top = seleccionable)
        this.colQueues = Array.from({ length: BOX_COLS }, (_, ci) =>
            this.boxes.filter(b => b.col === ci).sort((a, b) => a.row - b.row)
        );

        this.buildScene();

        // Ant dispatch loop — 200 ms por tick (todos los niveles)
        // El tick corre a 50 ms; cada slot decide con su propio reloj si ya pasaron
        // DISPATCH_MS (200 ms) desde su última hormiga → cadencia estable aunque un
        // frame se retrase.
        this.DISPATCH_MS   = 200;
        this.slotLastShot  = new Array(N_SLOTS).fill(-Infinity);
        this.time.addEvent({
            delay     : 50,
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
        const HY = 20;   // desplazamiento vertical del HUD (título a y≈51, como la referencia)

        // Barra semitransparente que se mezcla con el fondo
        const bar = this.add.graphics();
        bar.fillStyle(0xF5D5A0, 0.55);
        bar.fillRect(0, 0, GW, 60 + HY);

        // Botón Pausa (izquierda) — blanco redondeado con barras
        const pauseG = this.add.graphics();
        pauseG.fillStyle(0xFFFFFF, 0.95);
        pauseG.fillRoundedRect(10, 9 + HY, 50, 44, 12);
        pauseG.lineStyle(2, 0xCCBB99, 0.8);
        pauseG.strokeRoundedRect(10, 9 + HY, 50, 44, 12);
        pauseG.fillStyle(0x5D4037);
        pauseG.fillRect(22, 19 + HY, 10, 24);
        pauseG.fillRect(38, 19 + HY, 10, 24);
        pauseG.setInteractive(
            new Phaser.Geom.Rectangle(10, 9 + HY, 50, 44),
            Phaser.Geom.Rectangle.Contains
        );
        pauseG.on('pointerdown', () => this.scene.start('Menu'));

        // Nombre del nivel — centrado, texto grande oscuro
        this.add.text(GW / 2, 31 + HY, this.levelData?.name ?? 'Level 1', {
            fontSize: '24px', fontStyle: 'bold', color: '#5D4037',
            stroke: '#F5D5A0', strokeThickness: 3,
        }).setOrigin(0.5);

        // Botón 2× velocidad (derecha) — interactivo, cambia a verde cuando activo
        this.speedBtnBg = this.add.graphics();
        const drawSpeedBtn = () => {
            this.speedBtnBg.clear();
            if (this.speedBoost) {
                this.speedBtnBg.fillStyle(0x43A047, 0.95);
                this.speedBtnBg.fillRoundedRect(GW - 74, 9 + HY, 64, 44, 12);
                this.speedBtnBg.lineStyle(2, 0x2E7D32, 0.9);
            } else {
                this.speedBtnBg.fillStyle(0xFFFFFF, 0.95);
                this.speedBtnBg.fillRoundedRect(GW - 74, 9 + HY, 64, 44, 12);
                this.speedBtnBg.lineStyle(2, 0xCCBB99, 0.8);
            }
            this.speedBtnBg.strokeRoundedRect(GW - 74, 9 + HY, 64, 44, 12);
        };
        drawSpeedBtn();

        this.speedBtnTxt = this.add.text(GW - 42, 31 + HY, '▶▶ 2×', {
            fontSize: '14px', fontStyle: 'bold', color: '#5D4037',
        }).setOrigin(0.5);

        // Zona táctil del botón
        const speedHit = this.add.zone(GW - 74, 9 + HY, 64, 44).setOrigin(0, 0);
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

        // ── Medidor de FPS real (diagnóstico) — tecla F para mostrar/ocultar ──
        this.fpsTxt = this.add.text(6, GH - 18, '', {
            fontFamily: 'monospace', fontSize: '11px', color: '#000000',
            backgroundColor: '#FFFFFFAA', padding: { x: 4, y: 2 },
        }).setDepth(100).setVisible(false);
        this.input.keyboard?.on('keydown-F', () => this.fpsTxt.setVisible(!this.fpsTxt.visible));
        this.time.addEvent({
            delay: 250, loop: true,
            callback: () => {
                if (!this.fpsTxt.visible) return;
                const fps = this.game.loop.actualFps;
                const dt  = this.game.loop.delta;
                const pxF = (1 / this.msPerPx) * dt;   // px que avanza una hormiga por frame
                this.fpsTxt.setText(
                    `FPS ${fps.toFixed(0)}  |  ${dt.toFixed(1)} ms/frame  |  ` +
                    `${(1000 / this.msPerPx).toFixed(0)} px/s  |  ${pxF.toFixed(2)} px/frame`
                );
            },
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

        // Interior: mismo color crema del tablero (sin fondo blanco)
        fr.fillStyle(0xF2E8CC);
        fr.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);

        // Capa de sombras (creada ANTES de boardGfx → queda detrás de los cubos)
        this.shadowGfx = this.add.graphics();

        // Board cubes (single Graphics redrawn on change)
        this.boardGfx = this.add.graphics();
        this.redrawBoard();

        // Agujero de hormigas — usa la constante HOLE_Y
        const hole = this.add.graphics().setDepth(1);   // por encima del fondo: tapa a la hormiga al caer
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

    // Draw every cube that still exists + sombras en celdas vacías adyacentes
    redrawBoard() {
        const g  = this.boardGfx;
        const sg = this.shadowGfx;
        g.clear();
        sg.clear();
        for (let r = 0; r < BROWS; r++) {
            for (let c = 0; c < BCOLS; c++) {
                const cid = this.board[r][c];
                if (cid === 0) continue;
                this.drawCube(g, BOARD_X + c * CELL, BOARD_Y + r * CELL, cid);
                // Sombra de 4px: aparece al inicio de la celda vacía directamente debajo
                // boardGfx (dibujado después) tapa la sombra en celdas con cubo.
                if (r + 1 < BROWS && this.board[r + 1][c] === 0) {
                    sg.fillStyle(0x000000, 0.25);
                    sg.fillRect(
                        BOARD_X + c * CELL + 1,
                        BOARD_Y + (r + 1) * CELL,
                        CELL - 2, 4
                    );
                }
            }
        }
    }

    drawCube(g, x, y, colorId) {
        const base = activeCubeColors[colorId];
        if (!base) return;

        const fw    = CELL;
        const fh    = CELL;
        const DEPTH = 3;                      // profundidad inferior visible
        const rad   = CELL >= 10 ? 3 : 2;    // radio bordes redondeados
        const e     = CELL >= 10 ? 2 : 1;    // grosor de caras 3D laterales

        // ── Cara de profundidad 3px (dibujada PRIMERO → queda detrás de la cara frontal) ──
        // La capa de la fila siguiente la cubre al renderizar top→bottom.
        // Solo visible en la última fila o cuando la celda de abajo está vacía.
        g.fillStyle(darkenColor(base, 68), 1);
        g.fillRoundedRect(x, y + fh - 1, fw, DEPTH + 1,
            { tl: 0, tr: 0, bl: rad, br: rad });

        // ── Cara frontal redondeada (color base) ─────────────────────────────
        g.fillStyle(base, 1);
        g.fillRoundedRect(x, y, fw, fh, rad);

        if (CELL >= 8) {
            // Luz desde TOP-RIGHT: top y right brillantes, left y bottom en sombra.
            // Los fillRect están desplazados del borde para evitar las esquinas redondeadas.

            // Cara superior (brillante — luz desde arriba)
            g.fillStyle(lightenColor(base, 58), 1);
            g.fillRect(x + e, y + 1, fw - e * 2, e);

            // Cara derecha (brillante — luz desde la derecha)
            g.fillStyle(lightenColor(base, 28), 1);
            g.fillRect(x + fw - e, y + e, e - 1, fh - e * 2);

            // Cara izquierda (sombra)
            g.fillStyle(darkenColor(base, 38), 1);
            g.fillRect(x + 1, y + e, e - 1, fh - e * 2);

            // Cara inferior (sombra profunda)
            g.fillStyle(darkenColor(base, 62), 1);
            g.fillRect(x + e, y + fh - e, fw - e * 2, e - 1);

            // Brillo especular: punta en esquina top-right que se difumina
            // hacia la izquierda y hacia abajo
            g.fillStyle(0xffffff, 0.82);
            g.fillRect(x + fw - e - 1, y + 1, 1, 1);       // pixel principal
            g.fillStyle(0xffffff, 0.42);
            g.fillRect(x + fw - e - 2, y + 1, 1, 1);       // fade hacia izquierda
            g.fillStyle(0xffffff, 0.42);
            g.fillRect(x + fw - e - 1, y + 2, 1, 1);       // fade hacia abajo

            // Borde exterior redondeado
            g.lineStyle(1, 0x000000, 0.45);
            g.strokeRoundedRect(x + 0.5, y + 0.5, fw - 1, fh - 1, rad);

        } else {
            // Celdas pequeñas (< 8 px): versión de 1 px
            g.fillStyle(lightenColor(base, 48), 1);
            g.fillRect(x + 1, y, fw - 2, 1);           // top
            g.fillRect(x + fw - 1, y + 1, 1, fh - 2);  // right

            g.fillStyle(darkenColor(base, 52), 1);
            g.fillRect(x, y + 1, 1, fh - 2);           // left
            g.fillRect(x + 1, y + fh - 1, fw - 2, 1);  // bottom

            g.lineStyle(0.5, 0x000000, 0.28);
            g.strokeRoundedRect(x, y, fw, fh, 1);
        }
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
        // Slot: cuadro blanco de 62 px (tamaño de caja) con ~10 px entre slots, como la referencia
        const vw = SLOT_W - 10;
        const vh = SLOT_H;
        const vx = sx + (SLOT_W - vw) / 2;
        const vy = SLOT_Y;
        g.clear();
        // Sombra ligera
        g.fillStyle(0x000000, 0.08);
        g.fillRoundedRect(vx + 2, vy + 3, vw, vh, 9);
        // Fondo blanco
        g.fillStyle(0xFFFFFF, 0.95);
        g.fillRoundedRect(vx, vy, vw, vh, 9);
        // Borde gris claro
        g.lineStyle(2, 0xD8D8D8, 1.0);
        g.strokeRoundedRect(vx, vy, vw, vh, 9);
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
        // Fondo solo del área de las columnas centradas y de las filas visibles
        gbg.fillRoundedRect(BOX_X0 + 2, BOX_Y0 - 5, BOX_COLS * BOX_W - 4, BOX_ROWS * BOX_H + 10, 12);

        this.boxes.forEach(box => this.spawnBoxGO(box));
    }

    spawnBoxGO(box) {
        // Posición según el orden en la cola de su columna (compacta posibles huecos).
        // Las cajas más allá de la última fila visible esperan ocultas justo debajo
        // de la última fila (como en la referencia) y suben al promover la columna.
        const qi     = Math.max(0, this.colQueues[box.col]?.indexOf(box) ?? box.row);
        const visRow = Math.min(qi, BOX_VISIBLE_ROWS);
        const cx = BOX_X0 + box.col * BOX_W + BOX_W / 2;
        const cy = BOX_Y0 + visRow * BOX_H + BOX_H / 2;
        box.origX = cx;
        box.origY = cy;

        const cont = this.add.container(cx, cy);
        box.container = cont;
        if (qi >= BOX_VISIBLE_ROWS) cont.setVisible(false);

        const color  = activeCubeColors[box.colorId];
        const lightC = lightenColor(color, 40);
        const darkC  = darkenColor(color, 48);
        // Tamaño de la caja escala con BOX_SIZE (dinámico por nivel)
        const side   = BOX_SIZE;
        const w      = side;
        const hTotal = side;
        const depthH = 10;                                     // franja 3D inferior fija 10 px
        const r      = Math.max(4, Math.round(side * 0.18));  // radio de esquinas
        box.w = w;
        box.h = hTotal;

        // ── Sombra de la caja (índice 0 del contenedor → detrás de todo) ──────────
        const boxShadow = this.add.graphics();
        boxShadow.fillStyle(0x000000, 0.20);
        boxShadow.fillRoundedRect(-w / 2 + 3, -hTotal / 2 + 4, w, hTotal, r);
        cont.add(boxShadow);

        // ── Contorno blanco "activo" — se añade después de la sombra ─────────────
        const pad = 4;
        const borderGfx = this.add.graphics();
        borderGfx.lineStyle(3, 0xFFFFFF, 1);
        borderGfx.strokeRoundedRect(-w / 2 - pad, -hTotal / 2 - pad, w + pad * 2, hTotal + pad * 2, r + pad);
        cont.add(borderGfx);
        box.activeBorderGfx = borderGfx;

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
        borderGfx.setVisible(isFirst);   // contorno blanco solo en cajas activas
        if (isFirst) {
            this.attachDragEvents(box);
        } else {
            cont.setAlpha(0.6);   // atenuar las cajas no seleccionables
        }
    }

    // Destellos de magia (1.3 s) sobre la caja recién habilitada:
    // partículas pequeñas que aparecen en posiciones aleatorias alrededor de la caja,
    // derivan con movimiento aleatorio, titilan y se desvanecen.
    _showBoxSparkles(box) {
        const cont   = box.container;
        const TOTAL  = 1300;                 // duración total del efecto
        const halfW  = box.w / 2 + 6;
        const halfH  = box.h / 2 + 6;
        const n      = 14;                   // nº de destellos
        const sparkObjs = [];
        const colors = [0xFFF3A0, 0xFFE033, 0xFFFFFF, 0xFFD966];

        for (let i = 0; i < n; i++) {
            // Posición inicial aleatoria sobre el contorno/área de la caja
            const sx = Phaser.Math.Between(-halfW, halfW);
            const sy = Phaser.Math.Between(-halfH, halfH);
            const size = Phaser.Math.FloatBetween(1.6, 3.2);
            const color = colors[i % colors.length];

            const g = this.add.graphics();
            // Destello: cruz fina + núcleo (estilo chispa de magia)
            g.fillStyle(color, 1);
            g.fillRect(-0.6, -size * 1.6, 1.2, size * 3.2);   // trazo vertical
            g.fillRect(-size * 1.6, -0.6, size * 3.2, 1.2);   // trazo horizontal
            g.fillStyle(0xFFFFFF, 1);
            g.fillCircle(0, 0, size * 0.75);                  // núcleo
            g.x     = sx;
            g.y     = sy;
            g.alpha = 0;
            g.setScale(0.2);
            cont.add(g);
            sparkObjs.push(g);

            // Cada destello vive un tramo aleatorio dentro de los 1.3 s
            const delay = Phaser.Math.Between(0, 500);
            const life  = Math.min(TOTAL - delay, Phaser.Math.Between(550, 800));

            // Deriva aleatoria (movimiento flotante hacia arriba con desvío lateral)
            const driftX = Phaser.Math.Between(-14, 14);
            const driftY = Phaser.Math.Between(-22, -6);
            const rot    = Phaser.Math.FloatBetween(-1.2, 1.2);

            // Aparecer + deriva + rotación suave
            this.tweens.add({
                targets: g,
                x: sx + driftX, y: sy + driftY, rotation: rot,
                duration: life, delay, ease: 'Sine.easeOut',
            });
            // Pop de entrada y desvanecimiento al final (yoyo sobre alpha/scale)
            this.tweens.add({
                targets: g, alpha: 1, scaleX: 1, scaleY: 1,
                duration: life * 0.3, delay, ease: 'Back.easeOut',
                onComplete: () => {
                    if (!g.active) return;
                    // Titileo mientras vive
                    this.tweens.add({
                        targets: g, alpha: 0.35,
                        duration: 110, yoyo: true, repeat: Math.floor((life * 0.4) / 220),
                        ease: 'Sine.easeInOut',
                    });
                    // Desvanecer
                    this.tweens.add({
                        targets: g, alpha: 0, scaleX: 0.1, scaleY: 0.1,
                        duration: life * 0.3, delay: life * 0.4, ease: 'Quad.easeIn',
                    });
                },
            });
        }

        // Limpieza al terminar el efecto
        this.time.delayedCall(TOTAL + 60, () => {
            sparkObjs.forEach(g => {
                if (!g?.active) return;
                this.tweens.killTweensOf(g);
                cont.remove(g, true);
            });
        });
    }

    // Habilita interactividad y eventos de drag/tap en un box
    attachDragEvents(box) {
        const cont = box.container;
        const w    = box.w;
        const h    = box.h;

        cont.setAlpha(1);
        // Mostrar contorno blanco que indica que esta caja está activa
        if (box.activeBorderGfx) box.activeBorderGfx.setVisible(true);
        cont.setInteractive(
            new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
            Phaser.Geom.Rectangle.Contains
        );
        this.input.setDraggable(cont);

        // Flag para distinguir tap (sin movimiento) de drag
        let dragMoved  = false;
        let dragStartX = 0;
        let dragStartY = 0;
        const TAP_THRESHOLD = 15;   // px — umbral para no confundir tap con arrastre en móvil

        cont.on('dragstart', (ptr) => {
            dragMoved  = false;
            dragStartX = ptr.x;
            dragStartY = ptr.y;
            cont.setDepth(25);
            this.tweens.add({ targets: cont, scaleX: 1.08, scaleY: 1.08, duration: 80 });
        });

        cont.on('drag', (ptr, dragX, dragY) => {
            const dist = Math.hypot(ptr.x - dragStartX, ptr.y - dragStartY);
            if (dist > TAP_THRESHOLD) dragMoved = true;
            if (dragMoved) {
                cont.x = dragX;
                cont.y = dragY;
            }
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

        // Animar las restantes hacia arriba (cada una ocupa la posición anterior).
        // Solo las primeras BOX_VISIBLE_ROWS son visibles; la que entra en la última
        // fila visible aparece desde abajo con fundido.
        queue.forEach((nextBox, i) => {
            const cont   = nextBox.container;
            const visRow = Math.min(i, BOX_VISIBLE_ROWS);
            const newCy  = BOX_Y0 + visRow * BOX_H + BOX_H / 2;
            nextBox.origY = newCy;
            if (i >= BOX_VISIBLE_ROWS) { cont.y = newCy; return; }   // sigue oculta, en espera

            if (!cont.visible) {
                // Entra en la última fila visible: aparece desde abajo
                cont.setVisible(true);
                const targetAlpha = cont.alpha;   // 0.6 (no seleccionable) o 1
                cont.alpha = 0;
                this.tweens.add({ targets: cont, alpha: targetAlpha, duration: 240, delay: i * 50 });
            }
            this.tweens.add({
                targets: cont,
                y: newCy,
                duration: 240,
                ease: 'Back.easeOut',
                delay: i * 50,   // cascada leve
            });

            // La nueva primera de la columna se vuelve seleccionable
            if (i === 0) {
                this.attachDragEvents(nextBox);
                // Estrellitas de magia para indicar que esta caja quedó habilitada
                this.time.delayedCall(280, () => {
                    if (nextBox.container?.active) this._showBoxSparkles(nextBox);
                });
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
        box.ready   = false;   // las hormigas esperan a que termine la animación de salto

        // Deshabilitar drag de la caja ahora en slot
        box.container.disableInteractive();
        this.input.setDraggable(box.container, false);
        // Ocultar contorno blanco — la caja en el slot ya no es seleccionable
        if (box.activeBorderGfx) box.activeBorderGfx.setVisible(false);

        const tx = SLOT_X0 + si * SLOT_W + SLOT_W / 2;
        const ty = SLOT_Y + SLOT_H / 2;

        // Animación de salto: arco parabólico con stretch al subir y squish al aterrizar
        const sx   = box.container.x;
        const sy   = box.container.y;
        const midX = (sx + tx) / 2;
        const midY = Math.min(sy, ty) - 45;   // ápex del arco 45px sobre la posición más alta

        // Fase 1: estirarse verticalmente y subir al ápex
        this.tweens.add({
            targets: box.container,
            x: midX, y: midY,
            scaleX: 0.90, scaleY: 1.14,
            duration: 180, ease: 'Quad.easeOut',
            onComplete: () => {
                // Fase 2: caer al slot con squish horizontal
                this.tweens.add({
                    targets: box.container,
                    x: tx, y: ty,
                    scaleX: 1.12, scaleY: 0.88,
                    duration: 170, ease: 'Quad.easeIn',
                    onComplete: () => {
                        // Fase 3: rebote de recuperación al tamaño normal
                        this.tweens.add({
                            targets: box.container,
                            scaleX: 1, scaleY: 1,
                            duration: 150, ease: 'Back.easeOut',
                            onComplete: () => {
                                // Animación terminada → las hormigas ya pueden salir de inmediato
                                box.ready = true;
                                if (this.slotLastShot) this.slotLastShot[si] = -Infinity;
                            },
                        });
                    },
                });
            },
        });

        this.drawFilledSlot(si, box);

        // Recalcular velocidad: si todos los slots están llenos → auto 2x
        this.updateSpeed();

        // Promover la siguiente caja de la misma columna
        this.promoteColumn(box.col);
    }

    // ── Bottom powerup bar ─────────────────────────────────────────────────────
    makeBottomBar() {
        // La barra se ancla justo encima del banner de publicidad (fondo real de pantalla)
        const adY  = GH - AD_H;
        const barY = adY - BAR_H;

        // Línea separadora
        const sep = this.add.graphics();
        sep.lineStyle(2, 0xC8A060, 0.5);
        sep.lineBetween(10, barY, GW - 10, barY);

        // 4 botones de power-up centrados (r=24 → diámetro 48, 4 botones con espacio)
        const icons = ['🍀', '✂️', '🔃', '🌸'];
        const totalW  = (icons.length - 1) * 98;
        const startX  = (GW - totalW) / 2;
        const by = barY + BAR_H / 2;

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
        // Zona reservada de AD_H px anclada al borde inferior REAL de la pantalla
        // (adY = GH - AD_H). Aquí se montará el banner 320×50 más adelante.
        const adBg = this.add.graphics();
        adBg.fillStyle(0x1A1A2E, 0.92);
        adBg.fillRect(0, adY, GW, AD_H);
        // Placeholder del ad (estilo banner 320×50) centrado en la zona
        const adW = 320, adH = 50;
        const adBanner = this.add.graphics();
        adBanner.fillStyle(0x2D2D4E, 1);
        adBanner.fillRoundedRect((GW - adW) / 2, adY + (AD_H - adH) / 2, adW, adH, 6);
        adBanner.lineStyle(1, 0x555577, 0.7);
        adBanner.strokeRoundedRect((GW - adW) / 2, adY + (AD_H - adH) / 2, adW, adH, 6);
        this.add.text(GW / 2, adY + AD_H / 2, 'PUBLICIDAD  ·  320 × 50', {
            fontSize: '11px', letterSpacing: 2, color: '#6666AA',
        }).setOrigin(0.5);
    }

    // ── Pathfinding (BFS) ──────────────────────────────────────────────────────
    // Returns array of {r, c} or null.
    // r/c can be out-of-bounds (virtual entry point from outside).
    // Prioridad: cubo más abajo (fila mayor), luego más a la izquierda (col menor).
    // Si se indica slotIdx, la ENTRADA al tablero se elige minimizando el recorrido
    // total en píxeles desde la caja (perímetro + celdas), no solo el nº de celdas.
    findPath(targetColor, slotIdx = null) {
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

        if (slotIdx === null) return this.buildPath(parent, found[0]);

        // Entrada óptima: BFS desde el cubo hacia los bordes, costo = celdas + perímetro
        // real desde la caja hasta ese punto de entrada.
        const [cr, cc] = found[0].split(',').map(Number);
        const slotCx   = SLOT_X0 + slotIdx * SLOT_W + SLOT_W / 2;
        const slotTopY = SLOT_Y + SLOT_H / 2 - BOX_SIZE / 2;   // donde nace la hormiga
        const toCube = this._bestPathToEdge(cr, cc, (er, ec, edge) => {
            const e = cellPx(er, ec);
            return this._polyLen(slotCx, slotTopY, this.perimeterToEntry(slotCx, slotTopY, e.x, e.y, edge));
        });
        // toCube = [cubo … salida]; el formato esperado es [entrada … cubo]
        return toCube ? toCube.reverse() : this.buildPath(parent, found[0]);
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

    // Longitud en px de una polilínea que parte de (x0,y0) y pasa por pts [{x,y}]
    _polyLen(x0, y0, pts) {
        let len = 0, px = x0, py = y0;
        for (const p of pts) { len += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y; }
        return len;
    }

    // BFS desde la celda (r0,c0) a través de celdas VACÍAS hasta cualquier borde.
    // Devuelve el camino [start … celdaVirtualDeSalida] que minimiza
    //   pasos × CELL + extraCost(exitR, exitC, edge)   (todo en píxeles)
    // o null si ninguna salida es alcanzable. La celda de inicio puede no estar vacía.
    _bestPathToEdge(r0, c0, extraCost) {
        const board  = this.board;
        const parent = new Map();
        const startKey = `${r0},${c0}`;
        parent.set(startKey, undefined);
        const queue = [[r0, c0, 0]];
        const dirs  = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        let best = null;

        while (queue.length) {
            const [r, c, steps] = queue.shift();
            const fromKey = `${r},${c}`;
            for (const [dr, dc] of dirs) {
                const nr = r + dr, nc = c + dc;
                const key = `${nr},${nc}`;
                if (parent.has(key)) continue;
                if (nr < 0 || nr >= BROWS || nc < 0 || nc >= BCOLS) {
                    // Salida virtual: evaluar costo total
                    const edge = this.getEntryEdge(nr, nc);
                    const cost = (steps + 1) * CELL + extraCost(nr, nc, edge);
                    if (!best || cost < best.cost) {
                        parent.set(key, fromKey);
                        best = { cost, key };
                    }
                    continue;
                }
                if (board[nr][nc] !== 0) continue;   // cubo → bloquea
                parent.set(key, fromKey);
                queue.push([nr, nc, steps + 1]);
            }
        }
        return best ? this.buildPath(parent, best.key) : null;
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

        if (edge === 'bottom') {
            // Sale por el borde inferior → se desvía directamente al agujero (diagonal),
            // sin caminar hasta la esquina.
            return [{ x: hx, y: hy }];

        } else if (edge === 'right') {
            // Bajar por el borde derecho hasta la esquina inferior → diagonal al agujero
            return [
                { x: rX, y: bY },   // esquina inferior-derecha (fuera del tablero)
                { x: hx, y: hy },   // diagonal directa al agujero
            ];

        } else if (edge === 'left') {
            // Bajar por el borde izquierdo hasta la esquina inferior → diagonal al agujero
            return [
                { x: lX, y: bY },   // esquina inferior-izquierda (fuera del tablero)
                { x: hx, y: hy },   // diagonal directa al agujero
            ];

        } else {
            // Borde superior: bajar por el lado más cercano hasta la esquina inferior,
            // luego diagonal directa al agujero (sin caminar por el borde inferior).
            const leftCost  = Math.abs(ex - lX) + Math.abs(hx - lX);
            const rightCost = Math.abs(ex - rX) + Math.abs(hx - rX);
            const sideX = leftCost <= rightCost ? lX : rX;
            return [
                { x: sideX, y: tY },   // esquina superior del lado elegido
                { x: sideX, y: bY },   // bajar por el borde lateral hasta la esquina inferior
                { x: hx,    y: hy },   // diagonal directa al agujero
            ];
        }
    }

    // Mueve la hormiga a lo largo de una polilínea de waypoints {x,y} con velocidad
    // CONSTANTE (msPx = ms por píxel) en todo el recorrido.
    // Usa un único tween sobre la distancia recorrida e interpola posición/orientación
    // en onUpdate → sin pausas entre tramos ni duraciones mínimas que alteren la velocidad.
    animateWaypoints(ant, waypoints, msPx, onComplete) {
        // Polilínea desde la posición actual, descartando puntos repetidos
        const pts = [{ x: ant.x, y: ant.y }];
        for (const wp of waypoints) {
            const last = pts[pts.length - 1];
            if (Math.hypot(wp.x - last.x, wp.y - last.y) >= 0.5) pts.push({ x: wp.x, y: wp.y });
        }
        if (pts.length < 2) { onComplete(); return; }

        // Longitudes acumuladas de cada tramo
        const cum = [0];
        for (let i = 1; i < pts.length; i++) {
            cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
        }
        const total = cum[cum.length - 1];

        // Orientar hacia el primer tramo
        ant.rotation = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) + Math.PI / 2;

        const state = { d: 0 };
        let seg = 1;
        this.tweens.add({
            targets : state,
            d       : total,
            duration: Math.max(1, Math.round(total * msPx)),
            ease    : 'Linear',
            onUpdate: () => {
                if (!ant.active) return;
                const d = state.d;
                while (seg < pts.length - 1 && d > cum[seg]) seg++;
                const a = pts[seg - 1], b = pts[seg];
                const segLen = (cum[seg] - cum[seg - 1]) || 1;
                const t = Phaser.Math.Clamp((d - cum[seg - 1]) / segLen, 0, 1);
                ant.x = a.x + (b.x - a.x) * t;
                ant.y = a.y + (b.y - a.y) * t;
                ant.rotation = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
                // Ciclo de marcha acumulado a lo largo de todo el recorrido
                this._animateWalk(ant, (ant.walkDist ?? 0) + d);
            },
            onComplete: () => {
                if (!ant.active) return;
                const last = pts[pts.length - 1];
                ant.x = last.x;
                ant.y = last.y;
                ant.walkDist = (ant.walkDist ?? 0) + total;   // continuidad de fase entre fases
                this._resetWalk(ant);
                onComplete();
            },
        });
    }

    // ── Ant dispatch loop ──────────────────────────────────────────────────────
    tickSlots() {
        const now = this.time.now;
        for (let i = 0; i < N_SLOTS; i++) {
            // Cada slot despacha solo si ya pasaron DISPATCH_MS desde su última hormiga
            if (now - this.slotLastShot[i] < this.DISPATCH_MS) continue;
            if (this._dispatchSlot(i)) this.slotLastShot[i] = now;
        }
        this.checkLose();
    }

    // Despacha exactamente 1 hormiga desde el slot i si es posible.
    // Devuelve true si salió una hormiga (para reiniciar su temporizador de DISPATCH_MS).
    // Las hormigas de la misma caja nunca salen juntas: salen de a una.
    _dispatchSlot(i) {
        const box = this.slots[i];
        // box.ready se activa al terminar la animación de salto al slot
        if (!box || !box.ready || box.count <= 0) return false;

        const path = this.findPath(box.colorId, i);
        if (!path || path.length < 2) {
            console.log(`[slot ${i}] color=${box.colorId} count=${box.count} → sin camino accesible`);
            return false;
        }

        const last = path[path.length - 1];
        const key  = `${last.r},${last.c}`;

        // Decrementar contador al DESPACHAR la hormiga (no al llegar al cubo)
        box.count = Math.max(0, box.count - 1);
        if (box.countTxt) box.countTxt.setText(String(box.count));   // sin animación

        console.log(`[slot ${i}] color=${box.colorId} count=${box.count} → hormiga hacia (${last.r},${last.c}) path.len=${path.length}`);
        this.reserved.add(key);
        this.launchAnt(i, box, path);

        // Si era la última hormiga de esta caja, liberar el slot de inmediato
        if (box.count === 0 && this.slots[i] === box) {
            console.log(`[slot ${i}] último despacho → liberar slot`);
            this.freeSlot(i);
        }
        return true;
    }

    // ── Ant launch & animation ─────────────────────────────────────────────────
    launchAnt(slotIdx, box, path) {
        const pixels       = path.map(({ r, c }) => cellPx(r, c));
        // La hormiga se detiene UNA celda antes del cubo (no encima): se recorre el
        // camino sin la última celda, que es la del cubo objetivo.
        const walkPixels   = pixels.length > 1 ? pixels.slice(0, -1) : pixels;
        const virtualEntry = path[0];                           // celda virtual {r,c}
        const entry        = pixels[0];                         // pixel del punto de entrada
        const edge         = this.getEntryEdge(virtualEntry.r, virtualEntry.c);

        const slotCx   = SLOT_X0 + slotIdx * SLOT_W + SLOT_W / 2;
        const slotCy   = SLOT_Y + SLOT_H / 2;
        const holeX    = GW / 2;
        const holeY    = HOLE_Y;  // usar la constante definida en el módulo

        // La hormiga nace en el borde SUPERIOR (norte) de la caja, no en su centro.
        // box.h contiene la altura visual de la caja (BOX_SIZE).
        const antStartY = slotCy - (box.h ?? BOX_SIZE) / 2;

        const MS_PER_PX = this.msPerPx;   // ms/px capturado al despachar — igual en todo el camino

        // Hormiga aparece asomándose por la parte superior de su caja
        const ant = this.makeAntSprite(slotCx, antStartY, box.colorId);
        this.antsInFlight++;

        // ── FASE 3+4: salida ÓPTIMA del tablero + perímetro → agujero ─────────
        // En vez de deshacer el camino de entrada, se recalcula desde la celda donde
        // está la hormiga la salida (por celdas vacías) que minimiza el recorrido total
        // hasta el agujero: celdas × CELL + perímetro desde esa salida.
        const doBfsReturn = () => {
            const standCell = path.length >= 2 ? path[path.length - 2] : path[0];
            const inside    = standCell.r >= 0 && standCell.r < BROWS &&
                              standCell.c >= 0 && standCell.c < BCOLS;
            let retPixels = [];
            let retEntry  = entry;
            let retEdge   = edge;
            if (inside) {
                const exitPath = this._bestPathToEdge(standCell.r, standCell.c, (er, ec, eg) => {
                    const e = cellPx(er, ec);
                    return this._polyLen(e.x, e.y, this.perimeterToHole(e.x, e.y, holeX, holeY, eg));
                });
                if (exitPath && exitPath.length >= 2) {
                    const exitCell = exitPath[exitPath.length - 1];
                    retPixels = exitPath.map(({ r, c }) => cellPx(r, c));
                    retEntry  = cellPx(exitCell.r, exitCell.c);
                    retEdge   = this.getEntryEdge(exitCell.r, exitCell.c);
                } else {
                    retPixels = [...walkPixels].reverse();   // respaldo: deshacer la entrada
                }
            }
            // Diagonales: fusionar tramos ortogonales en L → hipotenusa directa
            const returnPath = mergeOrthToDiag(mergeCollinear(retPixels), this.board);
            this.animateWaypoints(ant, returnPath, MS_PER_PX, () => {
                // Salió del tablero → Fase 4: caminar por perimetro al agujero
                const toHoleWps = this.perimeterToHole(retEntry.x, retEntry.y, holeX, holeY, retEdge);
                console.log(`[ant slot ${slotIdx}] regreso al agujero, waypoints=${toHoleWps.length}`);

                // La hormiga camina hasta JUMP_DIST px antes del centro del agujero,
                // desde donde saltará dentro. Se acorta el último tramo en esa distancia.
                const JUMP_DIST = 70;   // despega bien antes del agujero, con impulso
                const lastWp = toHoleWps[toHoleWps.length - 1];
                const prevPt = toHoleWps.length >= 2
                    ? toHoleWps[toHoleWps.length - 2]
                    : { x: retEntry.x, y: retEntry.y };
                const ddx  = lastWp.x - prevPt.x;
                const ddy  = lastWp.y - prevPt.y;
                const dlen = Math.hypot(ddx, ddy) || 1;
                toHoleWps[toHoleWps.length - 1] = {
                    x: lastWp.x - (ddx / dlen) * JUMP_DIST,
                    y: lastWp.y - (ddy / dlen) * JUMP_DIST,
                };

                this.animateWaypoints(ant, toHoleWps, MS_PER_PX, () => {
                    if (!ant.active) return;
                    console.log(`[ant slot ${slotIdx}] salta al agujero, count=${box.count}`);

                    // ── Salto con impulso: parábola continua a la MISMA velocidad horizontal
                    // (sin pausa). La altura sigue sin(π·t); al descender encoge hasta desaparecer.
                    const sx0 = ant.x, sy0 = ant.y;
                    const dx  = holeX - sx0, dy = holeY - sy0;
                    const horiz = Math.hypot(dx, dy) || 1;
                    const JUMP_H = 26;                                  // altura máxima del salto
                    ant.rotation = Math.atan2(dy, dx) + Math.PI / 2;    // mira hacia el agujero
                    this._resetWalk(ant);

                    const st = { t: 0 };
                    let belowHole = false;
                    this.tweens.add({
                        targets : st,
                        t       : 1,
                        duration: Math.round(horiz * MS_PER_PX),        // velocidad constante
                        ease    : 'Linear',
                        onUpdate: () => {
                            if (!ant.active) return;
                            const t = st.t;
                            const arc = Math.sin(Math.PI * t);          // 0 → 1 → 0
                            ant.x = sx0 + dx * t;
                            ant.y = sy0 + dy * t - arc * JUMP_H;
                            // Crece ligeramente al subir, encoge al caer dentro
                            const s = t < 0.5
                                ? 1 + 0.18 * arc
                                : Phaser.Math.Linear(1.18, 0.08, (t - 0.5) / 0.5);
                            ant.setScale(s);
                            // Al empezar a descender pasa por DEBAJO del agujero (depth 1)
                            if (!belowHole && t >= 0.5) { belowHole = true; ant.setDepth(0); }
                            if (t > 0.8) ant.alpha = Phaser.Math.Linear(1, 0, (t - 0.8) / 0.2);
                        },
                        onComplete: () => {
                            ant.destroy();
                            this.antsInFlight = Math.max(0, this.antsInFlight - 1);
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
        const toEntry  = this.perimeterToEntry(slotCx, antStartY, entry.x, entry.y, edge);
        const boardPath = mergeOrthToDiag(mergeCollinear(walkPixels), this.board);
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

        // La hormiga está una celda atrás del cubo → orientarla hacia él
        if (ant.active) {
            const fdx = cubePx.x - ant.x, fdy = cubePx.y - ant.y;
            if (fdx !== 0 || fdy !== 0) ant.rotation = Math.atan2(fdy, fdx) + Math.PI / 2;
        }

        this.removeCube(last.r, last.c);

        if (!cubeExistia) {
            // No hay cubo que recoger → regresar directamente
            this.time.delayedCall(80, doReturn);
            return;
        }

        // ── Animación: hormiga levanta el cubo en sus mandíbulas (diagonal) ──
        // cs ajustado para que el rombo (diagonal = cs·√2) iguale el tamaño visual de CELL
        const cs      = Math.ceil(CELL / Math.SQRT2);   // ≈ 9 px → rombo ~12.7 px ≈ CELL
        const color   = activeCubeColors[cubeColorId];
        const pickup  = this.add.graphics().setDepth(16);

        // Dibujar mini-cubo en el gráfico de pickup (escala 1:1 con el tablero)
        this._drawCarriedCube(pickup, cs, color);
        pickup.x        = cubePx.x;
        pickup.y        = cubePx.y;
        pickup.rotation = Math.PI / 4;   // 45° diagonal (en mandíbulas)
        pickup.setScale(1.0);

        // Tween: el cubo vuela desde el tablero hacia la hormiga
        this.tweens.add({
            targets : pickup,
            x       : ant.x,
            y       : ant.y - 8,
            duration: 190,
            ease    : 'Back.easeOut',
            onComplete: () => {
                // Destruir el gráfico temporal y crear uno dentro del container
                pickup.destroy();

                // Cubo adjunto al container de la hormiga — mismo tamaño que en el tablero
                const carried = this.add.graphics();
                this._drawCarriedCube(carried, cs, color);
                carried.x        = 0;
                carried.y        = -19;    // encima de la cabeza (hormiga ×1.25) → mandíbulas
                carried.rotation = Math.PI / 4;
                carried.setScale(1.0);    // misma escala que el cubo del tablero
                ant.add(carried);          // ant es Container → carried sigue todos sus movimientos

                doReturn();
            },
        });
    }

    // ── Helper: dibuja un mini-cubo isométrico en rombo sobre el graphics indicado ──
    // El cubo se dibuja en coordenadas locales y recibe rotation=PI/4 externamente.
    // Muestra 3 caras: superior (clara), derecha (brillante), inferior-izquierda (sombra).
    //
    //  Esquinas locales → vértices del rombo en pantalla (tras rotar 45°):
    //   (-half,-half) = vértice superior (pantalla)
    //   ( half,-half) = vértice derecho  (pantalla)
    //   ( half, half) = vértice inferior (pantalla)
    //   (-half, half) = vértice izquierdo(pantalla)
    _drawCarriedCube(g, size, color) {
        const s    = size;
        const half = s / 2;
        const r    = 2;

        // ── Cara de profundidad (offset oscuro, dibujada detrás) ────────────────
        g.fillStyle(darkenColor(color, 68), 1);
        g.fillRoundedRect(-half + 2, -half + 2, s, s, r);

        // ── Cara SUPERIOR del rombo (mitad superior en pantalla) ────────────────
        // Polígono local: (-half,-half), (half,-half), (0,0), (-half,half)
        g.fillStyle(lightenColor(color, 22), 1);
        g.fillPoints([
            { x: -half, y: -half },   // pantalla: vértice superior
            { x:  half, y: -half },   // pantalla: vértice derecho
            { x:  0,    y:  0    },   // centro
            { x: -half, y:  half },   // pantalla: vértice izquierdo
        ], true);

        // ── Cara DERECHA del rombo (triángulo inferior-derecho en pantalla) ─────
        // Triángulo local: (half,-half), (half,half), (0,0)
        g.fillStyle(lightenColor(color, 44), 1);
        g.fillTriangle(
             half, -half,   // pantalla: vértice derecho
             half,  half,   // pantalla: vértice inferior
             0,     0       // centro
        );

        // ── Cara INFERIOR-IZQUIERDA sombreada (triángulo inferior-izquierdo) ────
        // Triángulo local: (-half,half), (half,half), (0,0)
        g.fillStyle(darkenColor(color, 50), 1);
        g.fillTriangle(
            -half,  half,   // pantalla: vértice izquierdo
             half,  half,   // pantalla: vértice inferior
             0,     0       // centro
        );

        // ── Brillo especular: punta en vértice derecho del rombo ────────────────
        if (s >= 8) {
            g.fillStyle(0xffffff, 0.82);
            g.fillRect(half - 3, -half + 1, 2, 1);
            g.fillStyle(0xffffff, 0.42);
            g.fillRect(half - 4, -half + 1, 1, 1);
            g.fillStyle(0xffffff, 0.42);
            g.fillRect(half - 3, -half + 2, 1, 1);
        }

        // ── Borde exterior redondeado (proporciona las esquinas redondeadas) ────
        g.lineStyle(1.5, darkenColor(color, 38), 1);
        g.strokeRoundedRect(-half, -half, s, s, r);
    }

    // ── Ant sprite — hormiga generada con Graphics (color del colorId) ─────────
    // Devuelve un Container para que el cubo cargado viaje con la hormiga.
    // La cabeza apunta hacia arriba (-y) → atan2(dy,dx)+PI/2 orienta correctamente.
    makeAntSprite(x, y, colorId = null) {
        const cont = this.add.container(x, y).setDepth(15);

        // Cuerpo dentro de un sub-contenedor escalado (estilo caricatura, más grande).
        // El cubo que carga se añade al contenedor exterior → mantiene su tamaño real.
        const ANT_SCALE = 1.25;
        const body = this.add.container(0, 0).setScale(ANT_SCALE);
        cont.add(body);

        // Sombra suave degradada bajo la hormiga (profundidad respecto a cubos/cajas).
        // Luz desde arriba-derecha → la sombra cae hacia abajo-izquierda.
        // Sin gradiente radial en Graphics: se apilan elipses concéntricas de alpha creciente.
        const shadowGfx = this.add.graphics();
        const SX = -1.5, SY = 3.5;                      // desplazamiento de la sombra
        const layers = [[22, 11, 0.05], [18, 9, 0.07], [14, 7, 0.09], [10, 5, 0.12]];
        layers.forEach(([w, h, a]) => {
            shadowGfx.fillStyle(0x000000, a);
            shadowGfx.fillEllipse(SX, SY, w, h);
        });
        body.add(shadowGfx);
        cont.shadowGfx = shadowGfx;

        // Patas en dos capas (trípodes alternos) → se animan al caminar
        const legsA = this.add.graphics();
        this._drawAntLegs(legsA, colorId, 'A');
        body.add(legsA);
        const legsB = this.add.graphics();
        this._drawAntLegs(legsB, colorId, 'B');
        body.add(legsB);

        // Cuerpo articulado en 3 piezas con pivotes en las articulaciones:
        //  - abdomen (cola): pivote en la unión con el tórax (y=0) → se mece a los lados
        //  - tórax: centro del cuerpo
        //  - cabeza (+antenas): pivote en el cuello (y=-4.5) → gira a los lados
        const abdomenGfx = this.add.graphics();
        this._drawAntAbdomen(abdomenGfx, colorId);
        body.add(abdomenGfx);

        const thoraxGfx = this.add.graphics();
        this._drawAntThorax(thoraxGfx, colorId);
        body.add(thoraxGfx);

        const headGfx = this.add.graphics();
        headGfx.y = -4.5;                              // pivote del cuello
        this._drawAntHead(headGfx, colorId);
        body.add(headGfx);
        cont.body = body;

        // Referencias para la animación de marcha
        cont.legsA      = legsA;
        cont.legsB      = legsB;
        cont.bodyGfx    = thoraxGfx;
        cont.abdomenGfx = abdomenGfx;
        cont.headGfx    = headGfx;

        return cont;
    }

    // Color base de la hormiga según colorId (verde oliva por defecto)
    _antColor(colorId) {
        return (colorId !== null && colorId !== undefined && activeCubeColors[colorId])
            ? activeCubeColors[colorId]
            : 0x4a7a3a;
    }

    // Dibuja un trípode de patas: 'A' = delantera izq + trasera izq + media der,
    // 'B' = delantera der + trasera der + media izq. Las hormigas caminan alternando ambos.
    _drawAntLegs(g, colorId, set) {
        const shade   = darkenColor(this._antColor(colorId), 28);
        const outline = 0x1A1208;
        const legs = set === 'A'
            ? [[-2.5, -3, -7, -5], [-2.5, 3, -7, 7], [ 2.5, 0,  8, 0]]   // del-izq, tras-izq, med-der
            : [[ 2.5, -3,  7, -5], [ 2.5, 3,  7, 7], [-2.5, 0, -8, 0]];  // del-der, tras-der, med-izq
        // Contorno oscuro (trazo grueso debajo)
        g.lineStyle(2.2, outline, 1);
        legs.forEach(([x1, y1, x2, y2]) => g.lineBetween(x1, y1, x2, y2));
        // Pata en color (trazo fino encima)
        g.lineStyle(1, shade, 1);
        legs.forEach(([x1, y1, x2, y2]) => g.lineBetween(x1, y1, x2, y2));
    }

    // Ciclo de marcha en función de la distancia recorrida (px).
    // Se evalúa en CADA frame de render (onUpdate del tween) → la animación es continua.
    // STRIDE = px por ciclo completo. Con 56 px a ~167 px/s ≈ 3 ciclos/s ≈ 20 frames
    // por ciclo a 60 FPS: el contoneo se ve fluido y legible (a 7 ciclos/s parecía
    // una vibración). Las patas van al doble de frecuencia que el cuerpo.
    _animateWalk(ant, dist) {
        if (!ant.legsA || !ant.legsB || !ant.bodyGfx) return;
        // Marcha sencilla y natural: ~4 contoneos/s (≈15 frames por ciclo a 60 FPS)
        // y 2 zancadas de patas por contoneo (~8 pasos/s), amplitudes moderadas.
        const STRIDE = 40;
        const ph  = (dist / STRIDE) * Math.PI * 2;      // fase del contoneo (cuerpo)
        const s1  = Math.sin(ph);
        const phL = ph * 2;                              // patas: doble frecuencia
        const sL  = Math.sin(phL);
        const cL  = Math.cos(phL);
        const bob = -Math.abs(cL) * 0.5;                 // rebote con cada apoyo

        // Trípodes alternos en contrafase
        const sw = sL * 0.38;
        ant.legsA.rotation = sw;
        ant.legsB.rotation = -sw;

        // Tórax: balanceo lateral suave + rebote
        ant.bodyGfx.rotation = s1 * 0.05;
        ant.bodyGfx.y        = bob;

        // Cola: contoneo moderado con leve retardo respecto al tórax
        if (ant.abdomenGfx) {
            ant.abdomenGfx.rotation = -Math.sin(ph - 0.6) * 0.22;   // ±12.6°
            ant.abdomenGfx.y        = bob * 0.7;
        }
        // Cabeza: gira en contrafase con la cola + cabeceo leve
        if (ant.headGfx) {
            ant.headGfx.rotation = s1 * 0.14;                       // ±8°
            ant.headGfx.y        = -4.5 + bob + sL * 0.2;
        }
        // Sombra: se encoge un poco cuando el cuerpo "sube" en el rebote (sensación de altura)
        if (ant.shadowGfx) {
            const k = 1 + bob * 0.06;                                // 1.0 → 0.97
            ant.shadowGfx.setScale(k, k);
            ant.shadowGfx.alpha = 0.9 + bob * 0.2;
        }
    }

    _resetWalk(ant) {
        if (!ant.legsA || !ant.legsB || !ant.bodyGfx) return;
        ant.legsA.rotation = 0;
        ant.legsB.rotation = 0;
        ant.bodyGfx.rotation = 0;
        ant.bodyGfx.y = 0;
        if (ant.abdomenGfx) { ant.abdomenGfx.rotation = 0; ant.abdomenGfx.y = 0; }
        if (ant.headGfx)    { ant.headGfx.rotation = 0;    ant.headGfx.y = -4.5; }
        if (ant.shadowGfx)  { ant.shadowGfx.setScale(1); ant.shadowGfx.alpha = 1; }
    }

    // ── Piezas del cuerpo de la hormiga (color de su caja) ────────────────────
    // La hormiga mira al norte (-y): cabeza arriba, abdomen abajo.
    // Todas las partes son del mismo color (bodyColor) con ligeras variaciones
    // de tono para dar volumen. Altura total ≈ 26 px (antenas -17 → abdomen +9).
    // (Las patas se dibujan en capas separadas — ver _drawAntLegs — para animarlas)
    _antPalette(colorId) {
        const bodyColor = this._antColor(colorId);
        return {
            bodyColor,
            shade  : darkenColor(bodyColor, 28),   // sombra leve (mismo tono, más oscuro)
            bright : lightenColor(bodyColor, 22),  // brillo leve (mismo tono, más claro)
            outline: 0x1A1208,                     // contorno oscuro
            OW     : 1.2,                          // grosor del contorno
        };
    }

    // ABDOMEN (cola) — pivote en la unión con el tórax (0,0); el cuerpo cuelga hacia +y
    // Volumen 3D de una elipse: base en sombra, cara principal desplazada hacia la luz
    // (arriba-derecha) dejando ver un borde oscuro abajo-izquierda, más brillo y contorno.
    _shadedEllipse(g, cx, cy, w, h, pal, hiScale = 0.45) {
        const { bodyColor, outline, OW } = pal;
        const dark = darkenColor(bodyColor, 46);
        // Base oscura (queda visible como borde abajo-izquierda)
        g.fillStyle(dark, 1);
        g.fillEllipse(cx, cy, w, h);
        // Cara principal, ligeramente más pequeña y desplazada hacia la luz
        g.fillStyle(bodyColor, 1);
        g.fillEllipse(cx + w * 0.07, cy - h * 0.07, w * 0.88, h * 0.88);
        // Brillo arriba-derecha (degradado en 2 pasos)
        g.fillStyle(pal.bright, 0.55);
        g.fillEllipse(cx + w * 0.18, cy - h * 0.22, w * hiScale, h * hiScale);
        g.fillStyle(0xFFFFFF, 0.50);
        g.fillEllipse(cx + w * 0.24, cy - h * 0.30, w * hiScale * 0.4, h * hiScale * 0.4);
        // Contorno
        g.lineStyle(OW, outline, 1);
        g.strokeEllipse(cx, cy, w, h);
    }

    _drawAntAbdomen(g, colorId) {
        this._shadedEllipse(g, 0, 4, 8, 10, this._antPalette(colorId), 0.45);
    }

    // TÓRAX — centro del cuerpo
    _drawAntThorax(g, colorId) {
        this._shadedEllipse(g, 0, -2, 5, 4, this._antPalette(colorId), 0.40);
    }

    // CABEZA + ANTENAS — pivote en el cuello (el Graphics se coloca en y=-4.5),
    // por eso todas las coordenadas van desplazadas +4.5 respecto al cuerpo.
    _drawAntHead(g, colorId) {
        const { shade, outline, OW } = this._antPalette(colorId);
        const P = 4.5;   // compensación del pivote

        // Antenas (contorno grueso + trazo en color)
        g.lineStyle(2.4, outline, 1);
        g.lineBetween(-1, -11 + P, -4, -17 + P);
        g.lineBetween( 1, -11 + P,  4, -17 + P);
        g.lineStyle(1, shade, 1);
        g.lineBetween(-1, -11 + P, -4, -17 + P);
        g.lineBetween( 1, -11 + P,  4, -17 + P);
        // Puntas sensoriales con contorno
        g.fillStyle(outline, 1);
        g.fillCircle(-4, -17 + P, 1.3 + OW * 0.6);
        g.fillCircle( 4, -17 + P, 1.3 + OW * 0.6);
        g.fillStyle(shade, 1);
        g.fillCircle(-4, -17 + P, 1.3);
        g.fillCircle( 4, -17 + P, 1.3);

        // Cabeza con volumen (borde en sombra abajo-izquierda, brillo arriba-derecha)
        this._shadedEllipse(g, 0, -7 + P, 8, 8, this._antPalette(colorId), 0.42);
        // Ojos: esclerótica blanca + pupila oscura
        g.fillStyle(0xFFFFFF, 1);
        g.fillCircle(-1.6, -7.5 + P, 1.2);
        g.fillCircle( 1.6, -7.5 + P, 1.2);
        g.fillStyle(0x111111, 1);
        g.fillCircle(-1.4, -7.4 + P, 0.65);
        g.fillCircle( 1.8, -7.4 + P, 0.65);
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
        this.msPerPx   = isFast ? 3.0  : 6.0;
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
        // Ventana 1 s después de que la última hormiga entra al agujero
        this.time.delayedCall(1000, () => this.showWinScreen());
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
        // Hormigas regresando al agujero → esperar a que entre la última
        if (this.antsInFlight > 0) return;

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
        // Ventana 1 s después de que la última hormiga entra al agujero
        this.time.delayedCall(1000, () => this.showLoseScreen());
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
