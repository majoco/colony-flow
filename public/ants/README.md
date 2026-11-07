# Sprite sheet de la hormiga (opcional)

Coloca aquí el archivo **`ant_sheet.png`** para usar la hormiga animada con imagen.

Requisitos del PNG:
- Cuadrícula de **4 columnas × 3 filas = 12 frames** del mismo tamaño (ajustable en
  `src/config/antStyle.js` → `ANT_SHEET.cols / rows / frameCount`).
- La hormiga mirando **hacia arriba (norte)** y centrada en cada frame.
- Fondo transparente, sin sombra fuera de la silueta (el juego añade su propia sombra).
- El ciclo debe cerrar: el frame 12 enlaza con el 1.

Activación: en `src/config/antStyle.js` cambia `ANT_STYLE` a `'sprite'`.
Si el archivo no existe, el juego usa automáticamente la hormiga procedural (`'toon'`).

Para volver a la hormiga anterior: `ANT_STYLE = 'classic'`.
