#!/usr/bin/env node
// diff.mjs: replay de la matriz de fixtures doradas contra otra base URL
// (el server Node en paridad) con comparación deep-equal y diff legible.
// Todo 7 de .omo/plans/modernizar-sitio.md; es el gate zero-diff del todo 22.
//
// Reutiliza runMatrix() de ./capture.mjs — la MISMA secuencia de requests que
// generó php/*.json — y compara cada fixture recapturada contra la dorada ya
// normalizada: cualquier diferencia (status, headers del whitelist o body) es
// un hallazgo. Objetos: sin importar el orden de claves; arrays: orden-sensitive.
//
// Uso:
//   node tests/fixtures/diff.mjs [--base-url URL] [--fixtures-dir DIR]
//                                [--inject-mismatch CASO] [--verbose] [--diff]
//
// Defaults: --base-url cae a FIXTURES_BASE_URL y si no al server Node de
// desarrollo (http://127.0.0.1:3001/sabores-latinoamerica/api); --fixtures-dir
// cae a backend/tests/fixtures/php. --diff es un alias no-op aceptado por
// compatibilidad con `npm run test:fixtures -- --diff`.
// --inject-mismatch CASO muta UNA fixture esperada en memoria
// (response.status=9999 + body.__mismatch_inyectado) para probar que el
// comparador detecta la diferencia y sale con exit 1.
//
// Exit code: 0 = sin diferencias; 1 = diferencias, casos sin capturar, error
// de secuencia o API inalcanzable.

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMatrix } from './capture.mjs';

const FIXTURES_DIR = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_NODE_BASE_URL = 'http://127.0.0.1:3001/sabores-latinoamerica/api';
const MAX_DIFS_POR_CASO = 15;
const MAX_VALOR = 140;

function loadExpectedFixtures(dir) {
    const byCase = new Map();
    for (const file of readdirSync(dir).sort()) {
        if (!file.endsWith('.json')) continue;
        const fixture = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
        const caseName = file.slice(0, -'.json'.length);
        if (fixture.case !== caseName) {
            throw new Error(`Fixture inconsistente ${file}: el campo case ("${fixture.case}") no coincide con el nombre del archivo.`);
        }
        byCase.set(caseName, fixture);
    }
    return byCase;
}

function typeName(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fmt(value) {
    if (value === undefined) return 'undefined';
    const json = JSON.stringify(value);
    if (json === undefined) return String(value);
    return json.length > MAX_VALOR ? `${json.slice(0, MAX_VALOR)}…` : json;
}

// Deep-equal con diff legible: reporta una línea por hoja divergente.
function diffInto(expected, actual, path, out) {
    if (out.length >= MAX_DIFS_POR_CASO) return;
    if (Object.is(expected, actual)) return;
    if (Array.isArray(expected) || Array.isArray(actual)) {
        if (!Array.isArray(expected) || !Array.isArray(actual)) {
            out.push(`${path}: esperaba ${typeName(expected)} ${fmt(expected)} y recibí ${typeName(actual)} ${fmt(actual)}`);
            return;
        }
        if (expected.length !== actual.length) {
            out.push(`${path}: distinta cantidad de elementos (esperaba ${expected.length}, recibí ${actual.length})`);
        }
        for (let i = 0; i < Math.max(expected.length, actual.length) && out.length < MAX_DIFS_POR_CASO; i++) {
            diffInto(expected[i], actual[i], `${path}[${i}]`, out);
        }
        return;
    }
    if (isPlainObject(expected) || isPlainObject(actual)) {
        if (!isPlainObject(expected) || !isPlainObject(actual)) {
            out.push(`${path}: esperaba ${typeName(expected)} ${fmt(expected)} y recibí ${typeName(actual)} ${fmt(actual)}`);
            return;
        }
        const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
        for (const key of keys) {
            if (out.length >= MAX_DIFS_POR_CASO) return;
            const child = path === '' ? key : `${path}.${key}`;
            if (!(key in expected)) {
                out.push(`${child}: clave inesperada en lo recibido (${fmt(actual[key])})`);
                continue;
            }
            if (!(key in actual)) {
                out.push(`${child}: falta en lo recibido (esperaba ${fmt(expected[key])})`);
                continue;
            }
            diffInto(expected[key], actual[key], child, out);
        }
        return;
    }
    out.push(`${path}: esperaba ${fmt(expected)} y recibí ${fmt(actual)}`);
}

function compareFixture(expected, actual) {
    const diffs = [];
    diffInto(expected, actual, '', diffs);
    if (diffs.length >= MAX_DIFS_POR_CASO) diffs.push(`… (se muestran hasta ${MAX_DIFS_POR_CASO} diferencias por caso)`);
    return diffs;
}

async function main() {
    const argv = process.argv.slice(2);
    let baseUrl = process.env.FIXTURES_BASE_URL ?? DEFAULT_NODE_BASE_URL;
    let fixturesDir = resolve(FIXTURES_DIR, 'php');
    let injectMismatch = null;
    let verbose = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--base-url') baseUrl = argv[++i];
        else if (arg === '--fixtures-dir') fixturesDir = resolve(String(argv[++i]));
        else if (arg === '--inject-mismatch') injectMismatch = argv[++i];
        else if (arg === '--verbose') verbose = true;
        else if (arg === '--diff')
            continue; // alias no-op para `npm run test:fixtures -- --diff` (todo 22)
        else if (arg === '--help' || arg === '-h') {
            console.log('Uso: node tests/fixtures/diff.mjs [--base-url URL] [--fixtures-dir DIR] [--inject-mismatch CASO] [--verbose] [--diff]');
            return;
        } else throw new Error(`Argumento desconocido: ${arg}`);
    }
    const log = verbose ? message => console.log(message) : () => {};

    const expected = loadExpectedFixtures(fixturesDir);
    if (expected.size === 0) throw new Error(`No hay fixtures esperadas (*.json) en ${fixturesDir}.`);
    if (injectMismatch !== null) {
        const target = expected.get(injectMismatch);
        if (target === undefined) throw new Error(`--inject-mismatch: no existe "${injectMismatch}" en ${fixturesDir}.`);
        target.response.status = 9999;
        target.response.body.__mismatch_inyectado = 'autotest diff.mjs';
        console.log(`→ Autotest: mutada la fixture esperada "${injectMismatch}" (status 9999 + __mismatch_inyectado).`);
    }

    console.log(`→ Replay de ${expected.size} casos contra ${baseUrl}`);
    const { cases, anomalies, error } = await runMatrix({ baseUrl, log, strict: false });

    const failures = [];
    const actualByCase = new Map(cases.map(item => [item.name, item.fixture]));
    for (const [name, wanted] of expected) {
        const got = actualByCase.get(name);
        actualByCase.delete(name);
        if (got === undefined) {
            failures.push({ name, lines: ['sin capturar contra esta base URL (¿la secuencia se cortó antes?)'] });
            continue;
        }
        const diffs = compareFixture(wanted, got);
        if (diffs.length > 0) failures.push({ name, lines: diffs });
    }
    for (const name of actualByCase.keys()) {
        failures.push({ name, lines: ['caso capturado sin fixture dorada en disco (¿fixture sin regenerar?)'] });
    }

    const warnings = anomalies.filter(message => !message.startsWith('Limpieza final verificada'));
    for (const warning of warnings) console.error(`⚠ ${warning}`);
    if (error !== null) console.error(`✘ La secuencia se cortó: ${error.message}`);

    if (failures.length === 0 && error === null) {
        console.log(`✔ ${expected.size}/${expected.size} fixtures idénticas contra ${baseUrl}`);
        return;
    }
    for (const failure of failures) {
        console.error(`\n· ${failure.name}`);
        for (const line of failure.lines) console.error(`    ${line}`);
    }
    console.error(`\n✘ Replay contra ${baseUrl} falló: ${failures.length} caso(s) problemático(s) de ${expected.size} fixture(s) esperadas.`);
    process.exitCode = 1;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    main().catch(error => {
        console.error(`✘ ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
