#!/usr/bin/env node
/* Linter de sinks HTML: prohibe interpolar datos sin escape en innerHTML.
   Regla: dentro de una asignación a `.innerHTML`, toda expresión `${...}` de un
   template literal debe empezar por esc( / safeUrl( / iframeHTML(, o la línea
   lleva el marcador SAFE_MARKER (ver constante abajo; sólo para marcado 100%
   estático). Salida: violaciones file:line; exit 1 si hay alguna. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const JS_DIR = join(ROOT, 'js');
const EXCLUDE_DIRS = new Set(['vendor', 'node_modules']);

/* Excepciones puntuales: líneas con datos NO derivados de BD/API.
   Coincidencia por substring sobre la línea física que contiene el `${`. */
const ALLOWLIST = [
    { file: 'js/app.js', contains: "$('#pennants').innerHTML" },
    { file: 'js/app.js', contains: "$('#marquee').innerHTML" }
];

const SAFE_PREFIXES = ['esc(', 'safeUrl(', 'iframeHTML('];
const SAFE_MARKER = '/* safe: static */';

function listJsFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (EXCLUDE_DIRS.has(entry)) continue;
            out.push(...listJsFiles(full));
        } else if (entry.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

/* Devuelve los rangos [start,end) de cada `${...}` dentro del statement que
   empieza en el índice del `.innerHTML` dado. */
function interpolationsInStatement(src, sinkIdx) {
    const ranges = [];
    let i = sinkIdx + '.innerHTML'.length;
    const stack = []; // 'tpl' | { braceDepth }
    let depth = 0;
    let exprStart = -1;

    while (i < src.length) {
        const c = src[i];
        const top = stack[stack.length - 1];

        if (top === 'tpl') {
            if (c === '\\') { i += 2; continue; }
            if (c === '`') { stack.pop(); i++; continue; }
            if (c === '$' && src[i + 1] === '{') {
                stack.push({ braceDepth: depth });
                exprStart = i + 2;
                i += 2;
                continue;
            }
            i++;
            continue;
        }

        // contexto código (fuera de templates)
        if (c === "'" || c === '"') {
            const q = c;
            i++;
            while (i < src.length && src[i] !== q) {
                if (src[i] === '\\') i++;
                i++;
            }
            i++;
            continue;
        }
        if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') i++;
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            i = src.indexOf('*/', i + 2);
            i = i === -1 ? src.length : i + 2;
            continue;
        }
        if (c === '`') { stack.push('tpl'); i++; continue; }
        if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
        if (c === ')' || c === ']') { depth--; i++; continue; }
        if (c === '}') {
            if (top && typeof top === 'object' && depth === top.braceDepth) {
                ranges.push([exprStart, i]);
                stack.pop();
                i++;
                continue;
            }
            depth--;
            i++;
            continue;
        }
        if (c === ';' && stack.length === 0 && depth <= 0) break;
        i++;
    }
    return ranges;
}

function lineOf(src, offset) {
    let line = 1;
    for (let i = 0; i < offset && i < src.length; i++) {
        if (src[i] === '\n') line++;
    }
    return line;
}

function lineTextAt(src, offset) {
    const start = src.lastIndexOf('\n', offset) + 1;
    let end = src.indexOf('\n', offset);
    if (end === -1) end = src.length;
    return src.slice(start, end);
}

const violations = [];
const allowedHits = [];

for (const file of listJsFiles(JS_DIR)) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const src = readFileSync(file, 'utf8');
    let idx = src.indexOf('.innerHTML');
    while (idx !== -1) {
        for (const [s, e] of interpolationsInStatement(src, idx)) {
            const expr = src.slice(s, e).trim();
            const line = lineOf(src, s);
            const text = lineTextAt(src, s);
            const safePrefix = SAFE_PREFIXES.some(p => expr.startsWith(p));
            const marked = text.includes(SAFE_MARKER);
            const allowlisted = ALLOWLIST.some(a => a.file === rel && text.includes(a.contains));
            if (safePrefix || marked || allowlisted) {
                if (!safePrefix) allowedHits.push(`${rel}:${line} -> \${${expr}}`);
            } else {
                violations.push(`${rel}:${line} -> \${${expr}}`);
            }
        }
        idx = src.indexOf('.innerHTML', idx + 1);
    }
}

if (allowedHits.length) {
    console.log('allowlisted (no data interpolation):');
    for (const h of allowedHits) console.log('  ' + h);
}

if (violations.length) {
    console.error('UNSAFE template interpolation in .innerHTML:');
    for (const v of violations) console.error('  ' + v);
    console.error(`\n${violations.length} violation(s). Wrap with esc()/safeUrl()/iframeHTML() or move to js/util/dom.js builders.`);
    process.exit(1);
}
console.log('lint-templates: OK — no unsafe innerHTML interpolations.');
