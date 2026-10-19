// scan_50x50.mjs — genera datos de nivel 50×50 con K=16 colores
import jimpModule from 'jimp';
const Jimp = jimpModule.default || jimpModule['module.exports'] || jimpModule;

const GRID = 50;
const K    = 16;
const IMG  = 'src/assets/malta_emp_playa.png';

const img  = await Jimp.read(IMG);
const W    = img.getWidth();
const H    = img.getHeight();
const cellW  = W / GRID;
const cellH  = H / GRID;
const insetX = Math.max(2, Math.floor(cellW * 0.18));
const insetY = Math.max(2, Math.floor(cellH * 0.18));

// Promediar color interior de cada celda
const rawColors = [];
for (let row = 0; row < GRID; row++) {
    rawColors.push([]);
    for (let col = 0; col < GRID; col++) {
        const x0 = Math.round(col * cellW) + insetX;
        const y0 = Math.round(row * cellH) + insetY;
        const x1 = Math.round((col+1)*cellW) - insetX;
        const y1 = Math.round((row+1)*cellH) - insetY;
        let rS=0,gS=0,bS=0,n=0;
        for (let py=y0;py<=y1;py++) for (let px=x0;px<=x1;px++) {
            const rgba=img.getPixelColor(px,py);
            const r=(rgba>>>24)&0xFF,g=(rgba>>>16)&0xFF,b=(rgba>>>8)&0xFF,a=rgba&0xFF;
            if(a<128)continue; rS+=r;gS+=g;bS+=b;n++;
        }
        rawColors[row].push(n>0?[Math.round(rS/n),Math.round(gS/n),Math.round(bS/n)]:[180,180,180]);
    }
}

// K-means
const flat  = rawColors.flat();
const dist2 = (a,b)=>{ const dr=a[0]-b[0],dg=a[1]-b[1],db=a[2]-b[2]; return dr*dr+dg*dg+db*db; };
let centroids = [];
for (let i=0;i<K;i++) centroids.push([...flat[Math.floor(i*flat.length/K)]]);
for (let it=0;it<20;it++) {
    const s=Array.from({length:K},()=>[0,0,0]),c=new Array(K).fill(0);
    for (const px of flat) {
        let b=0,bd=Infinity;
        for(let k=0;k<K;k++){const d=dist2(px,centroids[k]);if(d<bd){bd=d;b=k;}}
        s[b][0]+=px[0];s[b][1]+=px[1];s[b][2]+=px[2];c[b]++;
    }
    for(let k=0;k<K;k++) if(c[k]>0) centroids[k]=[Math.round(s[k][0]/c[k]),Math.round(s[k][1]/c[k]),Math.round(s[k][2]/c[k])];
}

// Paleta (eliminar duplicados cercanos)
const palette=[];
for(const c of centroids){
    let dup=false;
    for(const p of palette){if(dist2(c,p.rgb)<900){dup=true;break;}}
    if(!dup)palette.push({id:palette.length+1,rgb:c});
}

const toHex=([r,g,b])=>((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
const nearest=(rgb)=>{let b=0,bd=Infinity;for(const p of palette){const d=dist2(rgb,p.rgb);if(d<bd){bd=d;b=p.id;}}return b;};
const grid=rawColors.map(row=>row.map(c=>nearest(c)));

const counts={};
for(const row of grid) for(const id of row) counts[id]=(counts[id]||0)+1;

// ── Salida ────────────────────────────────────────────────────────────────────
console.log(`Paleta: ${palette.length} colores`);
for(const p of palette) console.log(`  id=${p.id}  #${toHex(p.rgb)}  count=${counts[p.id]||0}`);
const total=Object.values(counts).reduce((a,b)=>a+b,0);
console.log(`Total: ${total}  (expected ${GRID*GRID}=${GRID*GRID})`);

console.log('\n// PALETTE colors:');
for(const p of palette) console.log(`        ${p.id}: 0x${toHex(p.rgb)},  // count=${counts[p.id]||0}`);

console.log('\n// GRID 50x50:');
for(let r=0;r<GRID;r++) console.log('        ['+grid[r].join(',')+'],  // row '+r);

console.log('\n// BOXES (1 caja por color, orden por count desc):');
const sorted=[...palette].sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0));
for(const p of sorted) console.log(`        [${p.id}, ${counts[p.id]||0}],  // #${toHex(p.rgb)}`);
