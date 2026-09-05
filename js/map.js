/* ============ Mapa HD sin dependencias externas ============ */
import { FILLS, MAP_SHAPES } from './data.js';
import { openPanel, setOpener } from './panel.js';
import { toast } from './ui/toast.js';
import { tipHTML } from './util/dom.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const svg = document.getElementById('mapSvg');
    const world = document.getElementById('world');
    const shell = document.getElementById('mapShell');
    const tip = document.getElementById('tip');
    const NS = 'http://www.w3.org/2000/svg';
    const VB_W = 1000, VB_H = 1110;
    const CACHE_KEY = 'sdl_topo_50m_v1';
    const view = { k: 1, x: 0, y: 0 };
    let built = false, dragging = false;
    let drag = null, pinchPrev = null, downCountry = null;
    const pointers = new Map();
    const labelEls = [];
    let countriesByIso = {};

    const GEO_SOURCES = [
        'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json',
        'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
    ];

    function decodeTopo(topo) {
        const tr = topo.transform, sx = tr.scale[0], sy = tr.scale[1], tx = tr.translate[0], ty = tr.translate[1];
        const arcs = topo.arcs.map(arc => {
            let x = 0, y = 0;
            return arc.map(p => { x += p[0]; y += p[1]; return [x * sx + tx, y * sy + ty]; });
        });
        const ring = idxs => {
            let pts = [];
            idxs.forEach((idx, i) => {
                let a = idx >= 0 ? arcs[idx] : arcs[~idx].slice().reverse();
                if (i > 0) a = a.slice(1);
                pts = pts.concat(a);
            });
            return pts;
        };
        return topo.objects.countries.geometries.map(g => ({
            id: parseInt(g.id, 10),
            polys: g.type === 'Polygon' ? [g.arcs.map(ring)]
                : g.type === 'MultiPolygon' ? g.arcs.map(p => p.map(ring))
                    : []
        }));
    }

    function merc(lon, lat) {
        const c = Math.max(-85, Math.min(85, lat));
        return [lon * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + c * Math.PI / 360))];
    }

    function ringArea2(r) {
        let a = 0;
        for (let i = 0; i < r.length; i++) {
            const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
            a += x1 * y2 - x2 * y1;
        }
        return Math.abs(a / 2);
    }

    function ringCentroid2(r) {
        let a = 0, cx = 0, cy = 0;
        for (let i = 0; i < r.length; i++) {
            const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
            const f = x1 * y2 - x2 * y1;
            a += f;
            cx += (x1 + x2) * f;
            cy += (y1 + y2) * f;
        }
        a /= 2;
        if (Math.abs(a) < 1e-9) return null;
        return [cx / (6 * a), cy / (6 * a)];
    }

    function pip2(p, r) {
        const [x, y] = p;
        let inside = false;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
            const [xi, yi] = r[i], [xj, yj] = r[j];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    }

    function labelPoint(r) {
        const c = ringCentroid2(r);
        if (c && pip2(c, r)) return c;
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        r.forEach(([x, y]) => {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        });
        const bc = [(minX + maxX) / 2, (minY + maxY) / 2];
        return pip2(bc, r) ? bc : (c || bc);
    }

    async function buildGeoLayers() {
        let feats = null;
        for (const url of GEO_SOURCES) {
            try {
                let json = null;
                const cached = (url === GEO_SOURCES[0]) ? localStorage.getItem(CACHE_KEY) : null;
                if (cached) json = JSON.parse(cached);
                else {
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    json = await res.json();
                    if (url === GEO_SOURCES[0]) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(json)); } catch (e) { /* cuota llena o storage bloqueado: se sigue sin caché */ } }
                }
                feats = decodeTopo(json);
                if (feats && feats.length) break;
            } catch (e) { /* siguiente fuente */ }
        }
        if (!feats) return null;
        const isos = new Set(MAP_SHAPES.map(s => s.iso));
        const latam = feats.filter(f => isos.has(f.id));
        if (!latam.length) return null;
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        latam.forEach(f => { f.polys.forEach(poly => { poly.forEach(ring => { ring.forEach(([lon, lat]) => {
            const [x, y] = merc(lon, lat);
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }); }); }); });
        const pad = 18;
        const s = Math.min((VB_W - 2 * pad) / (maxX - minX), (VB_H - 2 * pad) / (maxY - minY));
        const ox = (VB_W - (maxX - minX) * s) / 2, oy = (VB_H - (maxY - minY) * s) / 2;
        const prj = (lon, lat) => { const [x, y] = merc(lon, lat); return [(x - minX) * s + ox, (y - minY) * s + oy]; };
        const path2d = (r2, tol) => {
            let d = '', lx = 0, ly = 0, st = false;
            for (const [x, y] of r2) {
                if (!st) { d += 'M' + x.toFixed(1) + ',' + y.toFixed(1); st = true; }
                else if (Math.hypot(x - lx, y - ly) >= tol) d += 'L' + x.toFixed(1) + ',' + y.toFixed(1);
                else continue;
                lx = x; ly = y;
            }
            return d + 'Z';
        };
        const byIso = {}, labelPts = {};
        latam.forEach(f => {
            let d = '';
            /** @type {{ a: number, ring: Array<Array<number>> } | null} */
            let best = null;
            f.polys.forEach(poly => {
                const rings = poly.map(ring => ring.map(pt => prj(pt[0], pt[1])));
                rings.forEach(r2 => { d += path2d(r2, 0.35); });
                const a = ringArea2(rings[0]);
                if (!best || a > best.a) best = { a, ring: rings[0] };
            });
            byIso[f.id] = d;
            if (best) labelPts[f.id] = labelPoint(best.ring);
        });
        return {
            byIso, labelPts, eqY: prj(-70, 0)[1],
            labels: { pacifico: prj(-103, -14), atlantico: prj(-37, -30), caribe: prj(-70, 14) }
        };
    }

    function el(name, attrs) {
        const n = document.createElementNS(NS, name);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        return n;
    }

    function addLabel(text, pos, rot, small) {
        const t = el('text', { x: pos[0], y: pos[1], 'text-anchor': 'middle', class: 'ocean-lab' + (small ? ' small' : '') });
        if (rot) t.setAttribute('transform', `rotate(${rot} ${pos[0]} ${pos[1]})`);
        t.textContent = text;
        world.appendChild(t);
    }

    function addBase() {
        world.appendChild(el('rect', { x: -1600, y: -1600, width: 4200, height: 4300, fill: 'url(#waves)' }));
        const grid = el('g', { stroke: 'rgba(150,200,215,.05)' });
        for (let x = 100; x < 1000; x += 125) grid.appendChild(el('line', { x1: x, x2: x, y1: 0, y2: 1110 }));
        for (let y = 110; y < 1100; y += 125) grid.appendChild(el('line', { y1: y, y2: y, x1: 0, x2: 1000 }));
        world.appendChild(grid);
    }

    function addCountryGroup(info, d, fillColor) {
        const hasData = info.recipe_count > 0;
        const g = el('g', {
            class: 'country ' + (hasData ? 'has-data' : 'no-data'),
            tabindex: '0',
            role: 'button',
            'aria-label': `${info.name} — ${hasData ? `${info.recipe_count} recetas` : 'sin recetas'}`
        });
        g.appendChild(el('path', { d, fill: fillColor }));
        g.__info = info;
        /* Teclado: Enter/Space recorren el mismo camino que el clic
           (selectCountry), sin pasar por la lógica de arrastre del puntero. */
        g.addEventListener('keydown', e => {
            if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
            e.preventDefault();
            selectCountry(g);
        });
        g.addEventListener('pointerenter', e => { if (!dragging) showTip(info, e); });
        g.addEventListener('pointermove', moveTip);
        g.addEventListener('pointerleave', hideTip);
        world.appendChild(g);
        info._g = g;
        return g;
    }

    function addGeoBadge(hd) {
        const b = document.createElement('div');
        b.className = 'geo-badge';
        b.textContent = hd ? '🌐 Mapa HD' : '🗺️ Mapa básico';
        b.title = hd ? 'Geometría Natural Earth' : 'Sin conexión al CDN: geometría de respaldo';
        shell.appendChild(b);
    }

    function addCountryLabels(pts) {
        const gLab = el('g', { class: 'labels-g' });
        for (const iso in countriesByIso) {
            const info = countriesByIso[iso];
            if (!info._g) continue;
            let x, y;
            if (pts && pts[iso]) { x = pts[iso][0]; y = pts[iso][1]; }
            else { const b = info._g.getBBox(); x = b.x + b.width / 2; y = b.y + b.height / 2; }
            const t = el('text', { class: 'country-lab', 'text-anchor': 'middle' });
            t.textContent = info.name;
            gLab.appendChild(t);
            labelEls.push({ t, x, y });
        }
        world.appendChild(gLab);
        syncLabels();
    }

    function syncLabels() {
        svg.classList.toggle('zoomed', view.k >= 1.8);
        const inv = 1 / view.k;
        labelEls.forEach(o => { o.t.setAttribute('transform', `translate(${o.x},${o.y}) scale(${inv})`); });
    }

    async function buildMap(countries) {
        if (built) return;
        built = true;
        countriesByIso = {};
        countries.forEach(c => { countriesByIso[c.iso_code] = c; });
        addBase();
        /* Overlay mientras se resuelve la geometría (CDN o caché): convive
           con el badge HD/básico, que aparece recién al terminar. */
        const loading = document.createElement('div');
        loading.className = 'map-loading';
        loading.innerHTML = '<span class="map-loading-spin" aria-hidden="true"></span>Ubicando Latinoamérica…';
        shell.appendChild(loading);
        try {
            let geo = null;
            /* Sin geometría remota se cae al trazado básico embebido y el
               badge lo explica: el mapa nunca queda vacío por un CDN caído. */
            try { geo = await buildGeoLayers(); } catch (e) { geo = null; }
            let di = 0;
            if (geo) {
                world.appendChild(el('line', { x1: -400, x2: 1400, y1: geo.eqY, y2: geo.eqY, stroke: 'rgba(242,177,52,.14)', 'stroke-dasharray': '7 7' }));
                const eqt = el('text', { x: 60, y: geo.eqY - 8, class: 'eq-lab' });
                eqt.textContent = 'LÍNEA DEL ECUADOR';
                world.appendChild(eqt);
                addLabel('OCÉANO PACÍFICO', geo.labels.pacifico, -75);
                addLabel('OCÉANO ATLÁNTICO', geo.labels.atlantico, -70);
                addLabel('MAR CARIBE', geo.labels.caribe, 0, true);
                MAP_SHAPES.forEach(sh => {
                    const db = countriesByIso[sh.iso], d = geo.byIso[sh.iso];
                    if (!db || !d) return;
                    const info = { ...db };
                    countriesByIso[sh.iso] = info;
                    addCountryGroup(info, d, db.recipe_count > 0 ? FILLS[di % FILLS.length] : 'url(#hatch)');
                    if (db.recipe_count > 0) di++;
                });
            } else {
                world.appendChild(el('line', { x1: -400, x2: 1400, y1: 420, y2: 420, stroke: 'rgba(242,177,52,.14)', 'stroke-dasharray': '7 7' }));
                const eqt = el('text', { x: 20, y: 412, class: 'eq-lab' });
                eqt.textContent = 'LÍNEA DEL ECUADOR';
                world.appendChild(eqt);
                addLabel('OCÉANO PACÍFICO', [150, 700], -78);
                addLabel('MAR CARIBE', [468, 236], 0, true);
                addLabel('OCÉANO ATLÁNTICO', [880, 700], -72);
                MAP_SHAPES.forEach(sh => {
                    const db = countriesByIso[sh.iso];
                    const info = db ? { ...db } : { id: null, iso_code: sh.iso, name: sh.n, emoji: sh.f, tagline: '', recipe_count: 0 };
                    countriesByIso[sh.iso] = info;
                    addCountryGroup(info, sh.p.join(''), info.recipe_count > 0 ? FILLS[di % FILLS.length] : 'url(#hatch)');
                    if (info.recipe_count > 0) di++;
                });
            }
            addCountryLabels(geo && geo.labelPts);
            addGeoBadge(!!geo);
        } finally {
            loading.remove();
        }
    }

    function showTip(c, e) {
        tip.innerHTML = tipHTML(c);
        tip.classList.add('show');
        moveTip(e);
    }

    function moveTip(e) {
        if (!tip.classList.contains('show')) return;
        const r = shell.getBoundingClientRect();
        let x = e.clientX - r.left + 16, y = e.clientY - r.top + 18;
        if (x + tip.offsetWidth > r.width - 10) x = e.clientX - r.left - tip.offsetWidth - 14;
        if (y + tip.offsetHeight > r.height - 10) y = e.clientY - r.top - tip.offsetHeight - 14;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
    }

    function hideTip() { tip.classList.remove('show'); }

    function selectCountry(g) {
        const info = g && g.__info;
        if (!info) return;
        /* Opener para devolver el foco al cerrar el panel: si la entrada fue
           por teclado, activeElement ya es el propio grupo; por clic cae en
           body y usamos el grupo como ancla de retorno. */
        const ae = document.activeElement;
        setOpener(ae instanceof Element && ae !== document.body ? ae : g);
        if (info.recipe_count > 0) {
            document.getElementById('coach').classList.add('done');
            focusCountry(g);
            openPanel(info, g);
        } else {
            toast(`Pronto sumaremos recetas de ${info.name} 🌱`);
        }
    }

    (function addRandomBtn() {
        const head = document.querySelector('.map-head');
        if (!head) return;
        const b = document.createElement('button');
        b.className = 'btn-ghost rnd-btn';
        b.type = 'button';
        b.textContent = '🎲 País sorpresa';
        b.addEventListener('click', () => {
            const opts = Object.values(countriesByIso).filter(c => c.recipe_count > 0 && c._g);
            if (!opts.length) return;
            const c = opts[Math.floor(Math.random() * opts.length)];
            setOpener(b);
            document.getElementById('coach').classList.add('done');
            focusCountry(c._g);
            openPanel(c, c._g);
        });
        head.insertBefore(b, head.querySelector('.legend'));
    })();

    /* 'nav:country' lo emiten panel.js (rowJump) y app.js (buscador). */
    document.addEventListener('nav:country', e => {
        const d = /** @type {CustomEvent} */ (e).detail;
        const c = getCountryById(d.cid);
        if (!c || !c._g) return;
        const ae = document.activeElement;
        setOpener(ae instanceof Element && ae !== document.body ? ae : null);
        document.getElementById('coach').classList.add('done');
        focusCountry(c._g);
        if (d.rid) openPanel(c, c._g, d.rid);
        else openPanel(c, c._g);
    });

    function metrics() {
        const r = svg.getBoundingClientRect();
        const s = Math.min(r.width / 1000, r.height / 1110);
        return { r, s, ox: (r.width - 1000 * s) / 2, oy: (r.height - 1110 * s) / 2 };
    }

    function apply() {
        world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
        syncLabels();
    }

    function zoomAt(sx, sy, f) {
        const m = metrics();
        const nk = clamp(view.k * f, .65, 9);
        const wx = ((sx - m.ox) / m.s - view.x) / view.k;
        const wy = ((sy - m.oy) / m.s - view.y) / view.k;
        view.x = (sx - m.ox) / m.s - wx * nk;
        view.y = (sy - m.oy) / m.s - wy * nk;
        view.k = nk;
        apply();
    }

    svg.addEventListener('wheel', e => {
        e.preventDefault();
        hideTip();
        const r = svg.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0014));
    }, { passive: false });

    svg.addEventListener('dblclick', e => {
        const r = svg.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, 1.7);
    });

    svg.addEventListener('pointerdown', e => {
        svg.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) {
            drag = { sx: e.clientX, sy: e.clientY, moved: 0 };
            dragging = false;
            pinchPrev = null;
            downCountry = e.target instanceof Element ? e.target.closest('.country') : null;
        } else if (pointers.size === 2) {
            drag = null;
            downCountry = null;
            const [a, b] = [...pointers.values()];
            pinchPrev = Math.hypot(a.x - b.x, a.y - b.y);
        }
    });

    svg.addEventListener('pointermove', e => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2 && pinchPrev) {
            const [a, b] = [...pointers.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d > 0) {
                const r = svg.getBoundingClientRect();
                zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinchPrev);
            }
            pinchPrev = d;
        } else if (drag && pointers.size === 1) {
            const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
            drag.moved += Math.abs(dx) + Math.abs(dy);
            if (drag.moved > 4 && !dragging) {
                dragging = true;
                svg.classList.add('dragging');
                hideTip();
            }
            if (dragging) {
                const m = metrics();
                view.x += dx / m.s;
                view.y += dy / m.s;
                apply();
            }
            drag.sx = e.clientX;
            drag.sy = e.clientY;
        }
    });

    ['pointerup', 'pointercancel'].forEach(ev => { svg.addEventListener(ev, e => {
        pointers.delete(/** @type {PointerEvent} */ (e).pointerId);
        if (pointers.size < 2) pinchPrev = null;
        if (ev === 'pointerup' && drag && drag.moved <= 5 && downCountry) selectCountry(downCountry);
        downCountry = null;
        if (pointers.size === 0) { drag = null; dragging = false; svg.classList.remove('dragging'); }
    }); });

    document.getElementById('zin').addEventListener('click', () => {
        const r = svg.getBoundingClientRect();
        zoomAt(r.width / 2, r.height / 2, 1.35);
    });
    document.getElementById('zout').addEventListener('click', () => {
        const r = svg.getBoundingClientRect();
        zoomAt(r.width / 2, r.height / 2, 1 / 1.35);
    });
    document.getElementById('zreset').addEventListener('click', () => animateView({ k: 1, x: 0, y: 0 }));

    let animId;
    function animateView(target, ms = 450) {
        cancelAnimationFrame(animId);
        if (reduceMotion) { Object.assign(view, target); apply(); return; }
        const from = { ...view }, t0 = performance.now();
        const step = n => {
            let p = clamp((n - t0) / ms, 0, 1);
            p = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
            view.k = from.k + (target.k - from.k) * p;
            view.x = from.x + (target.x - from.x) * p;
            view.y = from.y + (target.y - from.y) * p;
            apply();
            if (p < 1) animId = requestAnimationFrame(step);
        };
        animId = requestAnimationFrame(step);
    }

    function focusCountry(g) {
        const b = g.getBBox(), m = metrics();
        const fit = (Math.min(m.r.width, m.r.height) * 0.42) / (Math.max(b.width, b.height) * m.s);
        const k = clamp(Math.max(fit, view.k), 1, 4);
        const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        animateView({
            k,
            x: (m.r.width * 0.44 - m.ox) / m.s - cx * k,
            y: (m.r.height * 0.5 - m.oy) / m.s - cy * k
        });
    }

    function getCountryById(id) {
        const n = Number(id);
        for (const iso in countriesByIso) {
            if (Number(countriesByIso[iso].id) === n) return countriesByIso[iso];
        }
        return null;
    }

export { buildMap, focusCountry, getCountryById };