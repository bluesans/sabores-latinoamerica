import { API } from './api.js';
import { toast } from './ui/toast.js';
import { esc, headHTML, panelHTML, favoritesHTML, ingredientModalHTML, iframeHTML } from './util/dom.js';
import { unmountAdmin, isAdminDirty } from './admin.js';

const panel = document.getElementById('panel');
    const panelBody = document.getElementById('panelBody');
    const backdrop = document.getElementById('backdrop');
    const ingModal = document.getElementById('ingModal');
    const ingBody = document.getElementById('ingBody');
    const svg = document.getElementById('mapSvg');
    const mq = matchMedia('(max-width:720px)');
    let activeG = null, currentFavs = new Set();

    async function openPanel(c, g, focusRid) {
        unmountAdmin();
        if (activeG) activeG.classList.remove('active');
        activeG = g;
        g.classList.add('active');
        svg.classList.add('has-active');
        panelBody.innerHTML = headHTML(c.emoji || '🌎', c.name, 'Cargando recetas…');
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        panel.scrollTop = 0;
        if (mq.matches) backdrop.classList.add('show');
        try {
            const [data, favs] = await Promise.all([API.getRecetas(c.id), API.getFavoritos()]);
            currentFavs = new Set(favs.favorites.map(f => Number(f.id)));
            renderPanel(data.country, data.recipes, focusRid);
        } catch (err) {
            panelBody.innerHTML = headHTML(c.emoji || '🌎', c.name, err.message);
        }
        document.getElementById('panelClose').focus({ preventScroll: true });
    }

    function renderPanel(country, recipes, focusRid) {
        panelBody.innerHTML = panelHTML(country, recipes, currentFavs);
        if (focusRid) setTimeout(() => {
            const card = panelBody.querySelector(`[data-rid="${focusRid}"]`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('flash');
                setTimeout(() => card.classList.remove('flash'), 1400);
            }
        }, 80);
    }

    function cardHTML(r, i) {
        const [lbl, cls] = DIFF[r.difficulty] || ['—', 'lv2'];
        const fav = currentFavs.has(Number(r.id));
        const vid = r.youtube_id
            ? `<div class="vid"><div class="poster" role="button" tabindex="0" data-yt="${r.youtube_id}" aria-label="Reproducir video de ${r.name}"><span class="play">▶</span><span class="poster-txt">Ver preparación paso a paso</span></div></div>`
            : `<div class="vid-none">🎥 El video de esta receta llega pronto</div>`;
        return `
            <article class="rcard" style="--i:${i}" data-rid="${r.id}">
                <div class="rcard-top">
                    <h4>${r.name}</h4>
                    <span style="display:flex;gap:.4rem;align-items:center">
                        <button class="fav-btn ${fav ? 'on' : ''}" data-fav="${r.id}" type="button" title="Favorita" aria-pressed="${fav}">♥</button>
                        <span class="diff ${cls}">${lbl}</span>
                    </span>
                </div>
                <p class="rdesc">${r.description || ''}</p>
                <div class="rmeta">
                    <span>⏱ ${fmtTime(r.time_minutes)}</span>
                    <span>${r.youtube_id ? '🎬 con video' : '🎬 video en camino'}</span>
                </div>
                <div class="chips">
                    ${(r.ingredients || []).map(x => `<button class="chip" data-ing-id="${x.id}" type="button" title="Ver recetas con ${x.name}">${x.name}</button>`).join('')}
                </div>
                ${vid}
            </article>
        `;
    }

    panelBody.addEventListener('click', e => {
        const poster = e.target.closest('.poster');
        if (poster) return playVid(poster);
        const chip = e.target.closest('.chip[data-ing-id]');
        if (chip) return openIngredientModal(chip.dataset.ingId);
        const fav = e.target.closest('.fav-btn');
        if (fav) return toggleFav(fav);
        const row = e.target.closest('.ing-row');
        if (row) return rowJump(row);
    });

    panelBody.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const p = e.target.closest('.poster');
            if (p) playVid(p);
        }
    });

    async function toggleFav(btn) {
        const id = Number(btn.dataset.fav);
        const on = !btn.classList.contains('on');
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', on);
        on ? currentFavs.add(id) : currentFavs.delete(id);
        try {
            await API.toggleFav(id, on);
            document.dispatchEvent(new CustomEvent('fav:changed'));
        } catch (err) {
            btn.classList.toggle('on', !on);
            toast(err.message);
        }
    }

    function playVid(poster) {
        const v = poster.closest('.vid');
        v.innerHTML = iframeHTML(poster.dataset.yt);
    }

    function closePanel() {
        if (isAdminDirty()) { location.reload(); return; }
        unmountAdmin();
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
        backdrop.classList.remove('show');
        svg.classList.remove('has-active');
        if (activeG) { activeG.classList.remove('active'); activeG = null; }
    }

    document.getElementById('panelClose').addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);

    async function openFavorites() {
        unmountAdmin();
        if (activeG) activeG.classList.remove('active');
        activeG = null;
        svg.classList.remove('has-active');
        panelBody.innerHTML = headHTML('⭐', 'Mis favoritos', 'Cargando…');
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        panel.scrollTop = 0;
        if (mq.matches) backdrop.classList.add('show');
        try {
            const d = await API.getFavoritos();
            panelBody.innerHTML = favoritesHTML(d.favorites);
        } catch (err) { panelBody.innerHTML = `<p class="p-tag">${esc(err.message)}</p>`; }
    }

    async function openIngredientModal(id) {
        ingModal.hidden = false;
        ingBody.innerHTML = '<p class="ing-sub">Buscando recetas…</p>';
        try {
            const d = await API.getIngrediente(id);
            ingBody.innerHTML = ingredientModalHTML(d);
        } catch (err) { ingBody.innerHTML = `<p class="ing-sub">${esc(err.message)}</p>`; }
    }

    function closeIngredientModal() { ingModal.hidden = true; }

    document.getElementById('ingClose').addEventListener('click', closeIngredientModal);
    ingModal.addEventListener('click', e => { if (e.target === ingModal) closeIngredientModal(); });
    ingBody.addEventListener('click', e => { const row = e.target.closest('.ing-row'); if (row) rowJump(row); });

    /* Va por evento porque panel no puede importar map.js (sería un ciclo). */
    function rowJump(row) {
        closeIngredientModal();
        document.dispatchEvent(new CustomEvent('nav:country', {
            detail: {
                cid: Number(row.dataset.cid),
                rid: row.dataset.rid ? Number(row.dataset.rid) : undefined
            }
        }));
    }

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (!ingModal.hidden) return closeIngredientModal();
        if (panel.classList.contains('open')) closePanel();
    });

export { openPanel, closePanel, closeIngredientModal, openIngredientModal, openFavorites };