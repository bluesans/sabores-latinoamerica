import { API } from './api.js';
import { toast } from './ui/toast.js';
import { buildMap } from './map.js';
import { openFavorites, openIngredientModal } from './panel.js';
import { initAuth } from './auth.js';
import { openAdmin } from './admin.js';

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
    strip.innerHTML = '<span class="ing-strip-title">🧺 Los más usados — tocá para explorar:</span>' +
        tops.map(t => `<button class="chip top-chip" data-top-ing="${t.id}" type="button">${t.name}<em>${t.uses}</em></button>`).join('');
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
            try {
                const d = await API.buscar(q);
                const empty = !d.countries.length && !d.recipes.length && !d.ingredients.length;
                res.innerHTML = empty ? '<div class="s-empty">Sin resultados 🤷</div>' :
                    d.countries.map(c => `<button class="s-res" data-k="c" data-id="${c.id}"><span>${c.emoji}</span><b>${c.name}</b><small>país</small></button>`).join('') +
                    d.recipes.map(r => `<button class="s-res" data-k="r" data-id="${r.id}" data-cid="${r.country_id}"><span>${r.emoji}</span><b>${r.name}</b><small>${r.country_name}</small></button>`).join('') +
                    d.ingredients.map(i => `<button class="s-res" data-k="i" data-id="${i.id}"><span>🧺</span><b>${i.name}</b><small>${i.uses} usos</small></button>`).join('');
                res.hidden = false;
            } catch (e) { res.hidden = true; }
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
    try { const d = await API.getFavoritos(); el.textContent = d.favorites.length; } catch (e) {}
}
document.addEventListener('fav:changed', reloadFavCount);

async function enterApp(name, isNew, role) {
    authScreen.classList.remove('on');
    appScreen.classList.add('on');
    $('#userName').textContent = name;
    const av = $('#avatar');
    av.textContent = name[0].toUpperCase();
    av.style.background = ['#f2b134', '#31c98e', '#e8709a', '#e4572e'][name.length % 4];
    makeHeaderControls();
    document.getElementById('adminBtn').hidden = (role || 'user') !== 'admin';
    reloadFavCount();
    try {
        const [pd, sd] = await Promise.all([API.getPaises(), API.getStats()]);
        buildMap(pd.countries);
        const s = sd.stats;
        $('#headCount').textContent = `${s.paises_con_recetas} países · ${s.total_recetas} recetas`;
        countUp($('#stCountries'), Number(s.paises_con_recetas));
        countUp($('#stRecipes'), Number(s.total_recetas));
        countUp($('#stIngs'), Number(s.ingredientes_distintos));
        countUp($('#stVideos'), Number(s.recetas_con_video));
        renderTopIngredients(sd.top_ingredients);
    } catch (err) { toast(err.message); console.error(err); return; }
    toast(isNew ? `¡Cuenta creada! Bienvenido, ${name} 🌶️` : `Hola de nuevo, ${name} 👋`);
    scrollTo({ top: 0 });
}

initAuth(enterApp);

(async () => {
    if (!API.access && !API.refresh) return;
    try { const r = await API.checkSession(); await enterApp(r.username, false, r.role); } catch (e) {}
})();
