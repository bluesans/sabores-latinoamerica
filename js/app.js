import { API } from './api.js';
import { toast } from './ui/toast.js';
import { buildMap } from './map.js';
import { openFavorites, openIngredientModal } from './panel.js';
import { initAuth } from './auth.js';
import { openAdmin } from './admin.js';
import { searchResultsHTML, topChipsHTML } from './util/dom.js';

const $ = s => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const authScreen = document.getElementById('authScreen');
const appScreen  = document.getElementById('appScreen');

function countUp(el, target) {
    if (reduceMotion) { el.textContent = target; return; }
    const t0 = performance.now(), dur = 1300;
    const step = n => {
        const p = Math.min(1, (n - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

(() => {
    const cols = ['#f2b134', '#e4572e', '#31c98e', '#e8709a', '#3aa7c9'];
    $('#pennants').innerHTML = Array.from({ length: 16 }, (_, i) => `<span style="--i:${i};background:${cols[i % cols.length]}"></span>`).join('');
    const dishes = '🇲🇽 Tacos al pastor · 🇵🇪 Ceviche · 🇦🇷 Asado criollo · 🇨🇴 Bandeja paisa · 🇻🇪 Arepa · 🇧🇷 Feijoada · 🇨🇱 Pastel de choclo · 🇪🇨 Ceviche de camarón · 🇧🇴 Salteña · 🇨🇺 Ropa vieja · 🇺🇾 Chivito · 🇩🇴 Mangú · ';
    $('#marquee').innerHTML = `<span>${dishes}</span><span>${dishes}</span>`;
})();

function renderTopIngredients(tops) {
    const old = document.getElementById('ingStrip');
    if (old) old.remove();
    if (!tops || !tops.length) return;
    const strip = document.createElement('div');
    strip.id = 'ingStrip';
    strip.className = 'ing-strip';
    strip.innerHTML = topChipsHTML(tops);
    strip.addEventListener('click', e => {
        const b = e.target.closest('[data-top-ing]');
        if (b) openIngredientModal(b.dataset.topIng);
    });
    document.getElementById('statsBar').after(strip);
}

/* ---------- Header: buscador, favoritos, admin ---------- */
function makeHeaderControls() {
    if (document.getElementById('searchInp')) return;
    document.querySelector('.user-zone').insertAdjacentHTML('afterbegin', `
        <div class="search-box">
            <input id="searchInp" placeholder="🔎 Plato, país o ingrediente…" autocomplete="off" aria-label="Buscar">
            <div id="searchRes" class="search-res" hidden></div>
        </div>
        <button id="favBtn" class="btn-ghost" type="button" title="Mis favoritos">⭐ <span id="favCount">0</span></button>
        <button id="adminBtn" class="btn-ghost" type="button" hidden>🛠️ Admin</button>
    `);
    document.getElementById('favBtn').addEventListener('click', () => openFavorites());
    document.getElementById('adminBtn').addEventListener('click', () => openAdmin());
    const inp = $('#searchInp'), res = $('#searchRes');
    let deb;
    inp.addEventListener('input', () => {
        clearTimeout(deb);
        deb = setTimeout(async () => {
            const q = inp.value.trim();
            if (q.length < 2) { res.hidden = true; return; }
            res.innerHTML = '<div class="s-empty">Buscando…</div>';
            res.hidden = false;
            try {
                const d = await API.buscar(q);
                res.innerHTML = searchResultsHTML(d);
                res.hidden = false;
            } catch (e) {
                /* El buscador se oculta en silencio al fallar, a propósito:
                   es una superficie transitoria (el usuario ya siguió
                   tecleando o cerró el dropdown); un cartel de error acá
                   sería ruido. Los datos críticos sí avisan (panel, stats). */
                res.hidden = true;
            }
        }, 250);
    });
    res.addEventListener('click', e => {
        const b = e.target.closest('.s-res');
        if (!b) return;
        res.hidden = true;
        inp.value = '';
        if (b.dataset.k === 'i') return openIngredientModal(b.dataset.id);
        document.dispatchEvent(new CustomEvent('nav:country', {
            detail: {
                cid: Number(b.dataset.k === 'c' ? b.dataset.id : b.dataset.cid),
                rid: b.dataset.k === 'r' ? Number(b.dataset.id) : undefined
            }
        }));
    });
    inp.addEventListener('keydown', e => {
        if (e.key === 'Escape') { res.hidden = true; return; }
        if (e.key === 'Enter') { const first = res.querySelector('.s-res'); if (first) first.click(); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.search-box')) res.hidden = true; });
}

async function reloadFavCount() {
    const el = document.getElementById('favCount');
    if (!el) return;
    try {
        const d = await API.getFavoritos();
        el.textContent = d.favorites.length;
        const btn = document.getElementById('favBtn');
        if (btn) btn.title = 'Mis favoritos';
    } catch (e) {
        /* Sin toast a propósito: el contador es secundario y se reintenta
           solo con el próximo evento fav:changed. Se avisa por consola y
           en el tooltip del botón, que queda marcado como degradado. */
        console.warn('favCount:', e.message);
        const btn = document.getElementById('favBtn');
        if (btn) btn.title = 'No se pudieron cargar los favoritos';
    }
}
document.addEventListener('fav:changed', reloadFavCount);

/* ---------- Carga inicial del app: mapa y stats son independientes ---------- */
function removeLoadRetry() {
    const chip = document.getElementById('loadRetry');
    if (chip) chip.remove();
}

function insertLoadRetry(label) {
    removeLoadRetry();
    const chip = document.createElement('div');
    chip.id = 'loadRetry';
    chip.className = 'load-retry';
    const span = document.createElement('span');
    span.textContent = `⚠️ No se pudo cargar ${label}.`;
    const btn = document.createElement('button');
    btn.className = 'btn-retry';
    btn.type = 'button';
    btn.textContent = '↻ Reintentar';
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        await enterAppData();
    });
    chip.append(span, btn);
    document.getElementById('statsBar').after(chip);
}

async function loadMapData() {
    const pd = await API.getPaises();
    buildMap(pd.countries);
}

async function loadStats() {
    const sd = await API.getStats();
    const s = sd.stats;
    $('#headCount').textContent = `${s.paises_con_recetas} países · ${s.total_recetas} recetas`;
    countUp($('#stCountries'), Number(s.paises_con_recetas));
    countUp($('#stRecipes'), Number(s.total_recetas));
    countUp($('#stIngs'), Number(s.ingredientes_distintos));
    countUp($('#stVideos'), Number(s.recetas_con_video));
    renderTopIngredients(sd.top_ingredients);
}

/* Intenta mapa y estadísticas por separado: si una falla, la otra igual
   se muestra. Devuelve true sólo si ambas llegaron. */
async function enterAppData() {
    const [mapR, statsR] = await Promise.allSettled([loadMapData(), loadStats()]);
    if (mapR.status === 'fulfilled' && statsR.status === 'fulfilled') {
        removeLoadRetry();
        return true;
    }
    const failed = [];
    if (mapR.status === 'rejected') { console.error('map:', mapR.reason); failed.push('el mapa'); }
    if (statsR.status === 'rejected') { console.error('stats:', statsR.reason); failed.push('las estadísticas'); }
    toast(`No se pudo cargar ${failed.join(' ni ')}.`);
    insertLoadRetry(failed.join(' ni '));
    return false;
}

async function enterApp(name, isNew, role) {
    authScreen.classList.remove('on');
    appScreen.classList.add('on');
    $('#userName').textContent = name;
    const av = $('#avatar');
    av.textContent = name ? name[0].toUpperCase() : '🌽';
    av.style.background = ['#f2b134', '#31c98e', '#e8709a', '#e4572e'][name.length % 4];
    makeHeaderControls();
    document.getElementById('adminBtn').hidden = (role || 'user') !== 'admin';
    reloadFavCount();
    await enterAppData();
    toast(isNew ? `¡Cuenta creada! Bienvenido, ${name} 🌶️` : `Hola de nuevo, ${name} 👋`);
    scrollTo({ top: 0 });
}

initAuth(enterApp);

(async () => {
    // Sin access en memoria igual se intenta: puede haber cookie sdl_refresh
    // de una sesión previa y checkSession la restaura en silencio.
    // ALLOWLIST (captura vacía intencional): es un sondeo opcional de sesión;
    // si falla lo correcto es quedarse en el login, no mostrar un error.
    try { const r = await API.checkSession(); await enterApp(r.username, false, r.role); } catch (e) { /* sondeo silencioso */ }
})();
