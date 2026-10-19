// scan_harry.mjs v3 — K-means en todo el grid, identifica fondo por esquinas
import jimpModule from 'jimp';
const Jimp = jimpModule.default || jimpModule['module.exports'] || jimpModule;

const IMG  = 'src/assets/harry.jpg';
const GRID = 32;
const K    = 14;   // colores totales (fondo + figura)

const img  = await Jimp.read(IMG);
const W    = img.getWidth(), H = img.getHeight();
const cellW = W/GRID, cellH = H/GRID;
const insetX = Math.max(1,Math.floor(cellW*0.12));
const insetY = Math.max(1,Math.floor(cellH*0.12));
const dist2 = (a,b)=>{ const dr=a[0]-b[0],dg=a[1]-b[1],db=a[2]-b[2]; return dr*dr+dg*dg+db*db; };

// Muestrear colores promedio de cada celda
const rawColors = [];
for (let row=0;row<GRID;row++){
    rawColors.push([]);
    for (let col=0;col<GRID;col++){
        const x0=Math.round(col*cellW)+insetX, y0=Math.round(row*cellH)+insetY;
        const x1=Math.round((col+1)*cellW)-insetX, y1=Math.round((row+1)*cellH)-insetY;
        let rS=0,gS=0,bS=0,n=0;
        for(let py=y0;py<=y1;py++) for(let px=x0;px<=x1;px++){
            const rgba=img.getPixelColor(px,py);
            const r=(rgba>>>24)&0xFF,g=(rgba>>>16)&0xFF,b=(rgba>>>8)&0xFF;
            rS+=r;gS+=g;bS+=b;n++;
        }
        rawColors[row].push(n>0?[Math.round(rS/n),Math.round(gS/n),Math.round(bS/n)]:[120,80,45]);
    }
}
const flat = rawColors.flat();

// K-means sobre los 1024 colores
let centroids = [];
for(let i=0;i<K;i++) centroids.push([...flat[Math.floor(i*flat.length/K)]]);
for(let it=0;it<30;it++){
    const s=Array.from({length:K},()=>[0,0,0]),c=new Array(K).fill(0);
    for(const px of flat){
        let b=0,bd=Infinity;
        for(let k=0;k<K;k++){const d=dist2(px,centroids[k]);if(d<bd){bd=d;b=k;}}
        s[b][0]+=px[0];s[b][1]+=px[1];s[b][2]+=px[2];c[b]++;
    }
    for(let k=0;k<K;k++) if(c[k]>0) centroids[k]=[Math.round(s[k][0]/c[k]),Math.round(s[k][1]/c[k]),Math.round(s[k][2]/c[k])];
}
const toHex=([r,g,b])=>((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');

// Asignar cada celda al centroide más cercano
const assigned = rawColors.map(row=>row.map(rgb=>{
    let b=0,bd=Infinity;
    for(let k=0;k<K;k++){const d=dist2(rgb,centroids[k]);if(d<bd){bd=d;b=k;}}
    return b;
}));

// Detectar centroides de fondo: contar cuántas celdas de BORDE les pertenecen
const borderVotes = new Array(K).fill(0);
const BR = 3; // filas/cols de borde a considerar
for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++){
    if(r<BR||r>=GRID-BR||c<BR||c>=GRID-BR) borderVotes[assigned[r][c]]++;
}
const borderTotal = BR*2*(GRID-BR*2)*2 + (BR*2)*(BR*2);
// Marcar como fondo los centroides que tienen ≥ 25% de votos de borde
const isBgCentroid = borderVotes.map(v=>v/borderTotal >= 0.04);
console.log('Centroides identificados como fondo (madera):');
for(let k=0;k<K;k++) console.log(`  c${k}: #${toHex(centroids[k])}  borde=${borderVotes[k]}  esFondo=${isBgCentroid[k]}`);

// Construir paleta SOLO de celdas figura
const figCentroids = centroids.filter((_,k)=>!isBgCentroid[k]);
const palette=[];
for(const c of figCentroids){
    let dup=false;
    for(const p of palette){if(dist2(c,p.rgb)<400){dup=true;break;}}
    if(!dup)palette.push({id:palette.length+1,rgb:c});
}

// Mapear cada celda: 0 si centroide es fondo, ID de paleta si es figura
const nearest=(rgb)=>{let b=0,bd=Infinity;for(const p of palette){const d=dist2(rgb,p.rgb);if(d<bd){bd=d;b=p.id;}}return b;};
const grid=assigned.map((row,ri)=>row.map((k,ci)=>{
    if(isBgCentroid[k]) return 0;
    return nearest(rawColors[ri][ci]);
}));

const counts={};
for(const row of grid) for(const id of row) if(id>0)counts[id]=(counts[id]||0)+1;
const total=Object.values(counts).reduce((a,b)=>a+b,0);

// ── Salida ────────────────────────────────────────────────────────────────────
console.log(`\nPaleta figura (${palette.length} colores), total celdas: ${total}`);
for(const p of palette) console.log(`  id=${p.id}  #${toHex(p.rgb)}  count=${counts[p.id]||0}`);

console.log('\n// PALETTE:');
for(const p of palette) console.log(`        ${p.id}: 0x${toHex(p.rgb)},  // count=${counts[p.id]||0}`);

console.log('\n// GRID 32×32:');
for(let r=0;r<GRID;r++) console.log('        ['+grid[r].join(',')+'],  // row '+r);

console.log('\n// BOXES sorted by count desc:');
const sorted=[...palette].sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0));
for(const p of sorted) console.log(`        [${p.id}, ${counts[p.id]||0}],  // #${toHex(p.rgb)}`);
console.log(`// Total: ${total}`);
