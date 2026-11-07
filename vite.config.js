import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const LEVEL_FILE = path.resolve(process.cwd(), 'src/data/LevelData.js');

// Ids de los niveles presentes en LevelData.js (export const LEVEL_N = {...})
function listLevelIds(src) {
    return [...src.matchAll(/export\s+const\s+LEVEL_(\d+)\s*=/g)]
        .map(m => +m[1])
        .sort((a, b) => a - b);
}

// Bloque completo de un nivel: comentarios de cabecera opcionales + `export const LEVEL_N = {` … `\n};`
function levelBlockRegex(id) {
    return new RegExp(
        `(?:^[ \\t]*//[^\\n]*\\n)*^export\\s+const\\s+LEVEL_${id}\\s*=\\s*\\{[\\s\\S]*?\\n\\};[ \\t]*\\n?`,
        'm'
    );
}

// Plugin SOLO para desarrollo: permite al editor (level-editor.html) guardar un nivel
// directamente en src/data/LevelData.js.
//   GET  /__editor/levels            → { ids: [1,2,…] }
//   POST /__editor/save-level        → body { id: N, code: "export const LEVEL_N = {…};" }
function levelEditorPlugin() {
    return {
        name: 'colony-flow-level-editor',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                // Permitir que el editor abierto como archivo local (file://) lea y guarde
                // los niveles en este servidor de desarrollo (solo afecta a dev).
                const isEditorApi = req.url?.startsWith('/__editor/');
                const isLevelsFile = req.url?.split('?')[0] === '/src/data/LevelData.js';
                if (isEditorApi || isLevelsFile) {
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
                }
                if (!isEditorApi) return next();
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                try {
                    if (req.method === 'GET' && req.url.startsWith('/__editor/levels')) {
                        const src = fs.existsSync(LEVEL_FILE) ? fs.readFileSync(LEVEL_FILE, 'utf8') : '';
                        res.end(JSON.stringify({ ids: listLevelIds(src) }));
                        return;
                    }
                    if (req.method === 'POST' && req.url.startsWith('/__editor/save-level')) {
                        let body = '';
                        for await (const chunk of req) body += chunk;
                        const { id, code } = JSON.parse(body || '{}');
                        const n = parseInt(id, 10);
                        if (!(n >= 1 && n <= 100) || typeof code !== 'string' || !code.includes(`LEVEL_${n}`)) {
                            res.statusCode = 400;
                            res.end(JSON.stringify({ ok: false, error: 'Parámetros inválidos' }));
                            return;
                        }
                        let src = fs.existsSync(LEVEL_FILE) ? fs.readFileSync(LEVEL_FILE, 'utf8') : '';
                        const block = code.trimEnd() + '\n';
                        const re = levelBlockRegex(n);
                        let action;
                        if (re.test(src)) {
                            src = src.replace(re, block);
                            action = 'actualizado';
                        } else {
                            src = src.trimEnd() + '\n\n' + block;
                            action = 'creado';
                        }
                        fs.writeFileSync(LEVEL_FILE, src, 'utf8');
                        res.end(JSON.stringify({ ok: true, action, ids: listLevelIds(src) }));
                        return;
                    }
                    res.statusCode = 404;
                    res.end(JSON.stringify({ ok: false, error: 'No encontrado' }));
                } catch (e) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
                }
            });
        },
    };
}

export default defineConfig({
    plugins: [levelEditorPlugin()],
});
