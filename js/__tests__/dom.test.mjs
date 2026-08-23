import test from 'node:test';
import assert from 'node:assert/strict';

import {
    esc, safeUrl, fmtTime, headHTML,
    cardHTML, panelHTML, tipHTML, searchResultsHTML,
    topChipsHTML, favoritesHTML, ingredientModalHTML, iframeHTML
} from '../util/dom.js';

/* ---------- esc ---------- */

test('esc neutraliza un payload de XSS clásico', () => {
    assert.equal(esc('<img src=x onerror=a>'), '&lt;img src=x onerror=a&gt;');
});

test('esc escapa comillas dobles y simples', () => {
    assert.equal(esc('"'), '&quot;');
    assert.equal(esc("'"), '&#39;');
});

test('esc escapa & sin doble-escape (& va primero)', () => {
    assert.equal(esc('A & B'), 'A &amp; B');
    assert.equal(esc('&lt;'), '&amp;lt;');
});

test('esc con null y undefined devuelve string vacío', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
});

test('esc coacciona números y otros tipos a string', () => {
    assert.equal(esc(5), '5');
    assert.equal(esc(0), '0');
    assert.equal(esc(true), 'true');
});

test('esc deja el texto inocuo intacto', () => {
    assert.equal(esc('Mole Poblano'), 'Mole Poblano');
});

/* ---------- safeUrl ---------- */

test('safeUrl acepta un ID válido de 11 caracteres', () => {
    assert.equal(safeUrl('MWo42SO1aOM'), 'MWo42SO1aOM');
    assert.equal(safeUrl('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(safeUrl('abc_def-ghi'), 'abc_def-ghi');
});

test('safeUrl recorta y elimina todo espacio en blanco', () => {
    assert.equal(safeUrl('  MWo42SO1aOM '), 'MWo42SO1aOM');
    assert.equal(safeUrl('MWo 42SO\n1aOM\t'), 'MWo42SO1aOM');
});

test('safeUrl rechaza esquemas javascript: y payloads', () => {
    assert.equal(safeUrl('javascript:alert(1)'), '');
    assert.equal(safeUrl('"><svg onload=1>'), '');
    assert.equal(safeUrl('<img src=x>'), '');
});

test('safeUrl rechaza longitudes incorrectas y caracteres raros', () => {
    assert.equal(safeUrl('corta'), '');
    assert.equal(safeUrl('MWo42SO1aOMX'), ''); // 12 chars
    assert.equal(safeUrl('MWo42SO1aO;'), ''); // carácter inválido
    assert.equal(safeUrl(null), '');
    assert.equal(safeUrl(undefined), '');
    assert.equal(safeUrl(''), '');
});

/* ---------- fmtTime ---------- */

test('fmtTime matriz de casos', () => {
    assert.equal(fmtTime(25), '25 min');
    assert.equal(fmtTime(90), '1 h 30 min');
    assert.equal(fmtTime(60), '1 h');
    assert.equal(fmtTime(0), '0 min'); // 0 es un valor real, no dato ausente
    assert.equal(fmtTime(120), '2 h');
    assert.equal(fmtTime(45), '45 min');
});

test('fmtTime dato ausente o no numérico → — (no "0 min")', () => {
    assert.equal(fmtTime(null), '—');
    assert.equal(fmtTime(undefined), '—');
    assert.equal(fmtTime(''), '—');
    assert.equal(fmtTime(NaN), '—');
});

/* ---------- headHTML ---------- */

test('headHTML escapa título y tagline', () => {
    const out = headHTML('🌎', '<b>México</b>', '"tag"');
    assert.ok(out.includes('&lt;b&gt;México&lt;/b&gt;'));
    assert.ok(out.includes('&quot;tag&quot;'));
    assert.ok(out.startsWith('<div class="p-head">'));
});

/* ---------- cardHTML ---------- */

const baseRecipe = {
    id: 7,
    name: 'Tacos al Pastor',
    description: 'Típico de la calle',
    difficulty: 'easy',
    time_minutes: 25,
    youtube_id: null,
    ingredients: [{ id: 3, name: 'Cebolla' }]
};

test('cardHTML estructura esperada para receta sin video ni favorito', () => {
    const out = cardHTML(baseRecipe, 0, new Set());
    assert.ok(out.includes('data-rid="7"'));
    assert.ok(out.includes('<h4>Tacos al Pastor</h4>'));
    assert.ok(out.includes('class="fav-btn "')); // sin favorito => sin clase on
    assert.ok(out.includes('aria-pressed="false"'));
    assert.ok(out.includes('diff lv1">Fácil'));
    assert.ok(out.includes('⏱ 25 min'));
    assert.ok(out.includes('data-ing-id="3"'));
    assert.ok(out.includes('vid-none'));
    assert.ok(!out.includes('<iframe'));
});

test('cardHTML escapa nombre <script> y marca favorito encendido', () => {
    const r = { ...baseRecipe, name: '<script>alert(1)</script>' };
    const out = cardHTML(r, 2, new Set([7]));
    assert.ok(out.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!out.includes('<script>alert(1)'));
    assert.ok(out.includes('fav-btn on'));
    assert.ok(out.includes('aria-pressed="true"'));
    assert.ok(out.includes('style="--i:2"'));
});

test('cardHTML usa fallback —/lv2 para dificultad desconocida', () => {
    const r = { ...baseRecipe, difficulty: 'extremo' };
    const out = cardHTML(r, 0, new Set());
    assert.ok(out.includes('diff lv2">—'));
});

test('cardHTML bloque de video incluye data-yt escapado y aria-label', () => {
    const r = { ...baseRecipe, youtube_id: 'MWo42SO1aOM' };
    const out = cardHTML(r, 0, new Set());
    assert.ok(out.includes('data-yt="MWo42SO1aOM"'));
    assert.ok(out.includes('aria-label="Reproducir video de Tacos al Pastor"'));
    assert.ok(out.includes('🎬 con video'));
});

test('cardHTML escapa ingredientes con caracteres peligrosos', () => {
    const r = { ...baseRecipe, ingredients: [{ id: 9, name: 'A"<i>&B' }] };
    const out = cardHTML(r, 0, new Set());
    assert.ok(out.includes('title="Ver recetas con A&quot;&lt;i&gt;&amp;B"'));
    assert.ok(out.includes('>A&quot;&lt;i&gt;&amp;B</button>'));
});

/* ---------- panelHTML ---------- */

test('panelHTML arma cabecera + chips + tarjetas', () => {
    const country = { emoji: '🇲🇽', name: 'México', tagline: 'Cocina mestiza' };
    const out = panelHTML(country, [baseRecipe], new Set());
    assert.ok(out.includes('<h3>México</h3>'));
    assert.ok(out.includes('🍲 1 recetas'));
    assert.ok(out.includes('🎬 0 con video'));
    assert.ok(out.includes('data-rid="7"'));
});

/* ---------- tipHTML ---------- */

test('tipHTML muestra recetas disponibles y escapa el nombre', () => {
    const out = tipHTML({ emoji: '🇲🇽', name: 'Mé<x>ico', recipe_count: 3 });
    assert.ok(out.includes('<b>Mé&lt;x&gt;ico</b>'));
    assert.ok(out.includes('3 recetas disponibles'));

    const off = tipHTML({ name: 'Belice', recipe_count: 0 });
    assert.ok(off.includes('Sin recetas por ahora'));
    assert.ok(off.includes('🌎')); // emoji por defecto
});

/* ---------- searchResultsHTML ---------- */

test('searchResultsHTML caso vacío', () => {
    assert.equal(
        searchResultsHTML({ countries: [], recipes: [], ingredients: [] }),
        '<div class="s-empty">Sin resultados 🤷</div>'
    );
});

test('searchResultsHTML arma las tres secciones con ids numéricos', () => {
    const d = {
        countries: [{ id: '8', emoji: '🇪🇨', name: 'Ecuador' }],
        recipes: [{ id: '2', emoji: '🍲', name: 'Mole', country_id: '1', country_name: 'México' }],
        ingredients: [{ id: '6', name: 'Cebolla', uses: '4' }]
    };
    const out = searchResultsHTML(d);
    assert.ok(out.includes('data-k="c" data-id="8"'));
    assert.ok(out.includes('data-k="r" data-id="2" data-cid="1"'));
    assert.ok(out.includes('data-k="i" data-id="6"'));
    assert.ok(out.includes('<small>4 usos</small>'));
    assert.ok(out.includes('<small>país</small>'));
});

test('searchResultsHTML escapa nombres venenosos', () => {
    const d = {
        countries: [],
        recipes: [],
        ingredients: [{ id: 6, name: '<img src=x onerror=1>', uses: 1 }]
    };
    const out = searchResultsHTML(d);
    assert.ok(out.includes('&lt;img src=x onerror=1&gt;'));
    assert.ok(!out.includes('<img src=x'));
});

/* ---------- topChipsHTML ---------- */

test('topChipsHTML arma chips con data-top-ing numérico', () => {
    const out = topChipsHTML([{ id: 6, name: 'Cebolla', uses: 4 }]);
    assert.ok(out.includes('data-top-ing="6"'));
    assert.ok(out.includes('>Cebolla<em>4</em></button>'));
    assert.ok(out.includes('ing-strip-title'));
});

/* ---------- favoritesHTML / ingredientModalHTML ---------- */

test('favoritesHTML lista filas, conteo singular y dificultad', () => {
    const one = favoritesHTML([{ id: 1, country_id: 1, name: 'Mole', country_name: 'México', emoji: '🇲🇽', difficulty: 'hard' }]);
    assert.ok(one.includes('1 receta guardada'));
    assert.ok(one.includes('Difícil'));

    const many = favoritesHTML([
        { id: 1, country_id: 1, name: 'Mole', country_name: 'México', emoji: '', difficulty: 'easy' },
        { id: 2, country_id: 2, name: 'Ceviche & más', country_name: 'Perú', emoji: '🇵🇪', difficulty: 'medium' }
    ]);
    assert.ok(many.includes('2 recetas guardadas'));
    assert.ok(many.includes('🌎')); // emoji faltante => default
    assert.ok(many.includes('Ceviche &amp; más'));
});

test('favoritesHTML mensaje para lista vacía', () => {
    const out = favoritesHTML([]);
    assert.ok(out.includes('Todavía no guardaste ninguna receta'));
});

test('ingredientModalHTML escapa nombre del ingrediente y filas', () => {
    const d = {
        ingredient: { name: '<b>Cebolla</b>' },
        recipes: [
            { recipe_id: 3, country_id: 1, recipe_name: 'Sopa <i>x</i>', country_name: 'México', emoji: '', difficulty: 'easy' }
        ]
    };
    const out = ingredientModalHTML(d);
    assert.ok(out.includes('🧺 &lt;b&gt;Cebolla&lt;/b&gt;'));
    assert.ok(out.includes('Presente en 1 receta.'));
    assert.ok(out.includes('&lt;i&gt;x&lt;/i&gt;'));
    assert.ok(out.includes('data-rid="3" data-cid="1"') || (out.includes('data-cid="1"') && out.includes('data-rid="3"')));
});

/* ---------- iframeHTML ---------- */

test('iframeHTML construye el embed sólo con IDs válidos', () => {
    const ok = iframeHTML('MWo42SO1aOM');
    assert.ok(ok.startsWith('<iframe'));
    assert.ok(ok.includes('src="https://www.youtube-nocookie.com/embed/MWo42SO1aOM?rel=0"'));
    assert.ok(ok.includes('allowfullscreen'));
});

test('iframeHTML devuelve "" con ID inválido (sin iframe)', () => {
    assert.equal(iframeHTML('javascript:alert(1)'), '');
    assert.equal(iframeHTML('"><svg onload=1>'), '');
    assert.equal(iframeHTML('corto'), '');
    assert.equal(iframeHTML(null), '');
    assert.equal(iframeHTML(undefined), '');
});
