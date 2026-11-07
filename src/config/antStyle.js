// ── Estilo visual de las hormigas ──────────────────────────────────────────────
// Cambia ANT_STYLE para alternar entre versiones sin tocar GameScene:
//   'classic' → hormiga procedural original (cuerpo del color de la caja, pequeña)
//   'toon'    → hormiga procedural estilo caricatura 3D (cabeza grande, abdomen
//               segmentado, ojos grandes, patas articuladas) — color de la caja
//   'sprite'  → sprite sheet animado (PNG en src/assets/ants/ant_sheet.png) teñido
//               con el color de la caja. Si el archivo no existe se usa 'toon'.
export const ANT_STYLE = 'toon';

// Configuración del sprite sheet (solo para ANT_STYLE = 'sprite').
// El PNG debe ser una cuadrícula de SHEET_COLS × SHEET_ROWS frames iguales, con la
// hormiga mirando al NORTE (hacia arriba) y centrada en cada frame.
export const ANT_SHEET = {
    key        : 'ant_sheet',
    cols       : 4,
    rows       : 3,
    frameCount : 12,
    // Tamaño en pantalla de la hormiga (alto en px); el frame se escala a esta altura
    displayH   : 34,
    // Zancadas de patas por vuelta completa del ciclo (12 frames = 1 ciclo de marcha)
    strideCycles: 2,
};
