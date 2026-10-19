// scan_image.mjs — lee malta_emp_playa.png y genera datos de nivel 32×32
import jimpModule from 'jimp';
const Jimp = jimpModule.default || jimpModule['module.exports'] || jimpModule;

const GRID = 32;
const IMG  = 'src/assets/malta_emp_playa.png';
const K    = 14;   // colores en paleta

const img = await Jimp.read(IMG);
const W = img.getWidth();
const H = img.getHeight();
console.log(`Imagen: ${W}×${H}`);

const cellW = W / GRID;
const cellH = H / GRID;
console.log(`Celda: ${cellW.toFixed(2)}×${cellH.toFixed(2)} px`);

// Margen interior del 20% para evitar líneas de cuadrícula blancas
const insetX = Math.max(2, Math.floor(cellW * 0.20));
const insetY = Math.max(2, Math.floor(cellH * 0.20));

// Promediar el área interior de cada celda
const rawColors = [];
for (let row = 0; row < GRID; row++) {
    rawColors.push([]);
    for (let col = 0; col < GRID; col++) {
        const x0 = Math.round(col * cellW) + insetX;
        const y0 = Math.round(row * cellH) + insetY;
        const x1 = Math.round((col + 1) * cellW) - insetX;
        const y1 = Math.round((row + 1) * cellH) - insetY;

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let py = y0; py <= y1; py++) {
            for (let px = x0; px <= x1; px++) {
                const rgba = img.getPixelColor(px, py);
                const r = (rgba >>> 24) & 0xFF;
                const g = (rgba >>> 16) & 0xFF;
                const b = (rgba >>>  8) & 0xFF;
                const a = (rgba       ) & 0xFF;
                if (a < 128) continue;
                rSum += r; gSum += g; bSum += b; count++;
            }
        }
        rawColors[row].push(count > 0
            ? [Math.round(rSum/count), Math.round(gSum/count), Math.round(bSum/count)]
            : [180, 180, 180]);
    }
}

// ── K-means (10 iteraciones) ─────────────────────────────────────────────────
const flat  = rawColors.flat();
const total = flat.length;

// Inicializar centroides con muestras uniformes
let centroids = [];
for (let i = 0; i < K; i++) {
    centroids.push([...flat[Math.floor(i * total / K)]]);
}

const dist2 = (a, b) => {
    const dr=a[0]-b[0], dg=a[1]-b[1], db=a[2]-b[2];
    return dr*dr + dg*dg + db*db;
};

for (let iter = 0; iter < 15; iter++) {
    const sums   = Array.from({ length: K }, () => [0,0,0]);
    const cnts   = new Array(K).fill(0);
    for (const px of flat) {
        let best=0, bestD=Infinity;
        for (let k=0; k<K; k++) { const d=dist2(px,centroids[k]); if(d<bestD){bestD=d;best=k;} }
        sums[best][0]+=px[0]; sums[best][1]+=px[1]; sums[best][2]+=px[2]; cnts[best]++;
    }
    for (let k=0; k<K; k++) {
        if (cnts[k]>0) centroids[k]=[Math.round(sums[k][0]/cnts[k]), Math.round(sums[k][1]/cnts[k]), Math.round(sums[k][2]/cnts[k])];
    }
}

// Asignar IDs únicos (eliminar duplicados muy cercanos)
const palette = [];
for (let k=0; k<K; k++) {
    let dup=false;
    for (const p of palette) { if(dist2(centroids[k],p.rgb)<900){dup=true;break;} }
    if (!dup) palette.push({ id: palette.length+1, rgb: centroids[k] });
}

const toHex = ([r,g,b]) => ((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');

console.log(`\nPaleta: ${palette.length} colores`);
for (const p of palette) console.log(`  id=${p.id}  #${toHex(p.rgb)}  rgb(${p.rgb.join(',')})`);

// Mapear cada celda al color de paleta más cercano
const nearest = (rgb) => {
    let best=0, bestD=Infinity;
    for (const p of palette) { const d=dist2(rgb,p.rgb); if(d<bestD){bestD=d;best=p.id;} }
    return best;
};
const grid = rawColors.map(row => row.map(nearest));

// Conteo
const counts = {};
for (const row of grid) for (const id of row) counts[id]=(counts[id]||0)+1;

console.log('\nConteo por color (id → hex → count):');
let grandTotal=0;
for (const p of palette) {
    const c=counts[p.id]||0; grandTotal+=c;
    console.log(`  id=${p.id}  #${toHex(p.rgb)}  count=${c}`);
}
console.log(`  Total: ${grandTotal}  (expected: ${GRID*GRID}=${GRID*GRID})`);

// Grid
console.log('\n// GRID 32×32:');
for (let r=0; r<GRID; r++) {
    console.log('        ['+grid[r].join(',')+'],  // row '+r);
}

console.log('\n// PALETTE for CUBE_COLORS:');
for (const p of palette) console.log(`    ${p.id}: 0x${toHex(p.rgb)},  // rgb(${p.rgb.join(',')})`);
