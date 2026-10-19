// gen_50x50.mjs — genera malta_emp_playa en 50×50 celdas
import jimpModule from 'jimp';
const Jimp = jimpModule.default || jimpModule['module.exports'] || jimpModule;

const GRID    = 50;
const K       = 20;   // colores de paleta para más detalle
const IMG_IN  = 'src/assets/malta_emp_playa.png';
const IMG_OUT = 'src/assets/malta_emp_playa_50x50.png';

// ── Leer imagen fuente ────────────────────────────────────────────────────────
const img = await Jimp.read(IMG_IN);
const W   = img.getWidth();
const H   = img.getHeight();
console.log(`Fuente: ${W}×${H}  →  grid ${GRID}×${GRID}`);

const cellW  = W / GRID;
const cellH  = H / GRID;
const insetX = Math.max(2, Math.floor(cellW * 0.18));
const insetY = Math.max(2, Math.floor(cellH * 0.18));

// ── Promediar color de cada celda ─────────────────────────────────────────────
const rawColors = [];
for (let row = 0; row < GRID; row++) {
    rawColors.push([]);
    for (let col = 0; col < GRID; col++) {
        const x0 = Math.round(col * cellW) + insetX;
        const y0 = Math.round(row * cellH) + insetY;
        const x1 = Math.round((col + 1) * cellW) - insetX;
        const y1 = Math.round((row + 1) * cellH) - insetY;

        let rS=0, gS=0, bS=0, n=0;
        for (let py = y0; py <= y1; py++) {
            for (let px = x0; px <= x1; px++) {
                const rgba = img.getPixelColor(px, py);
                const r=(rgba>>>24)&0xFF, g=(rgba>>>16)&0xFF,
                      b=(rgba>>>8)&0xFF,  a=rgba&0xFF;
                if (a < 128) continue;
                rS+=r; gS+=g; bS+=b; n++;
            }
        }
        rawColors[row].push(n > 0
            ? [Math.round(rS/n), Math.round(gS/n), Math.round(bS/n)]
            : [180, 180, 180]);
    }
}

// ── K-means ───────────────────────────────────────────────────────────────────
const flat  = rawColors.flat();
const dist2 = (a,b)=>{ const dr=a[0]-b[0],dg=a[1]-b[1],db=a[2]-b[2]; return dr*dr+dg*dg+db*db; };

let centroids = [];
for (let i=0; i<K; i++) centroids.push([...flat[Math.floor(i*flat.length/K)]]);

for (let iter=0; iter<20; iter++) {
    const sums = Array.from({length:K},()=>[0,0,0]);
    const cnts = new Array(K).fill(0);
    for (const px of flat) {
        let best=0, bestD=Infinity;
        for (let k=0; k<K; k++) { const d=dist2(px,centroids[k]); if(d<bestD){bestD=d;best=k;} }
        sums[best][0]+=px[0]; sums[best][1]+=px[1]; sums[best][2]+=px[2]; cnts[best]++;
    }
    for (let k=0; k<K; k++) {
        if (cnts[k]>0) centroids[k]=[Math.round(sums[k][0]/cnts[k]),Math.round(sums[k][1]/cnts[k]),Math.round(sums[k][2]/cnts[k])];
    }
}

// Eliminar duplicados muy cercanos
const palette = [];
for (const c of centroids) {
    let dup=false;
    for (const p of palette) { if(dist2(c,p)<900){dup=true;break;} }
    if (!dup) palette.push(c);
}
console.log(`Paleta: ${palette.length} colores`);

const nearest = (rgb) => {
    let best=0, bestD=Infinity;
    for (let i=0; i<palette.length; i++) { const d=dist2(rgb,palette[i]); if(d<bestD){bestD=d;best=i;} }
    return best;
};

// ── Asignar paleta al grid ────────────────────────────────────────────────────
const grid = rawColors.map(row => row.map(c => nearest(c)));

// ── Generar imagen 50×50 px (1px por celda) ───────────────────────────────────
const writeGrid = async (cellPx, path) => {
    const outW = GRID * cellPx;
    const outH = GRID * cellPx;
    const out  = new Jimp(outW, outH, 0xFFFFFFFF);
    for (let r=0; r<GRID; r++) {
        for (let c=0; c<GRID; c++) {
            const [R,G,B] = palette[grid[r][c]];
            const color   = ((R<<24)|(G<<16)|(B<<8)|0xFF)>>>0;
            for (let dy=0; dy<cellPx; dy++)
                for (let dx=0; dx<cellPx; dx++)
                    out.setPixelColor(color, c*cellPx+dx, r*cellPx+dy);
        }
    }
    await out.writeAsync(path);
    console.log(`Guardado: ${path}  (${outW}×${outH} px)`);
};

await writeGrid(1,  IMG_OUT);                                      // 50×50 px
await writeGrid(10, 'src/assets/malta_emp_playa_50x50_big.png');  // 500×500 px
console.log(`Total celdas: ${GRID*GRID}`);
