(function () {
    'use strict';
    const panel = document.getElementById('panel');
    const panelBody = document.getElementById('panelBody');
    const backdrop = document.getElementById('backdrop');
    const ingModal = document.getElementById('ingModal');
    const ingBody = document.getElementById('ingBody');
    const svg = document.getElementById('mapSvg');
    const mq = matchMedia('(max-width:720px)');
    let activeG = null, currentFavs = new Set();

    function fmtTime(min) {
        min = Number(min) || 0;
        if (min < 90) return `${min} min`;
        const h = Math.floor(min / 60), r = min % 60;
        return r ? `${h} h ${r} min` : `${h} h`;
    }

    async function openPanel(c, g, focusRid) {
        if (window.__unmountAdmin) window.__unmountAdmin();
        if (activeG) activeG.classList.remove('active');
        activeG = g;
        g.classList.add('active');
        svg.classList.add('has-active');
        panelBody.innerHTML = `<div class="p-head"><div class="p-flag">${c.emoji || '🌎'}</div><h3>${c.name}</h3><p class="p-tag">Cargando recetas…</p></div>`;
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        panel.scrollTop = 0;
        if (mq.matches) backdrop.classList.add('show');
        if (window.focusCountry) window.focusCountry(g);
        try {
            const [data, favs] = await Promise.all([API.getRecetas(c.id), API.getFavoritos()]);
            currentFavs = new Set(favs.favorites.map(f => Number(f.id)));
            renderPanel(data.country, data.recipes, focusRid);
        } catch (err) {
            panelBody.innerHTML = `<div class="p-head"><div class="p-flag">${c.emoji || '🌎'}</div><h3>${c.name}</h3><p class="p-tag">${err.message}</p></div>`;
        }
        document.getElementById('panelClose').focus({ preventScroll: true });
    }

    function renderPanel(country, recipes, focusRid) {
        const vids = recipes.filter(r => r.youtube_id).length;
        panelBody.innerHTML = `
            <div class="p-head">
                <div class="p-flag">${country.emoji || '🌎'}</div>
                <h3>${country.name}</h3>
                <p class="p-tag">${country.tagline || ''}</p>
                <div class="p-chips">
                    <span class="p-chip">🍲 ${recipes.length} recetas</span>
                    <span class="p-chip">🎬 ${vids} con video</span>
                </div>
            </div>
            ${recipes.map((r, i) => cardHTML(r, i)).join('')}
        `;
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
            if (window.reloadFavCount) window.reloadFavCount();
        } catch (err) {
            btn.classList.toggle('on', !on);
            toast(err.message);
        }
    }

    function playVid(poster) {
        const v = poster.closest('.vid');
        v.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${poster.dataset.yt}?rel=0" title="Video de la receta" loading="lazy" allowfullscreen allow="accelerometer; encrypted-media; picture-in-picture"></iframe>`;
    }

    function closePanel() {
        if (window.__adminDirty) { location.reload(); return; }
        if (window.__unmountAdmin) window.__unmountAdmin();
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
        backdrop.classList.remove('show');
        svg.classList.remove('has-active');
        if (activeG) { activeG.classList.remove('active'); activeG = null; }
    }

    document.getElementById('panelClose').addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);

    async function openFavorites() {
        if (window.__unmountAdmin) window.__unmountAdmin();
        if (activeG) activeG.classList.remove('active');
        activeG = null;
        svg.classList.remove('has-active');
        panelBody.innerHTML = `<div class="p-head"><div class="p-flag">⭐</div><h3>Mis favoritos</h3><p class="p-tag">Cargando…</p></div>`;
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        panel.scrollTop = 0;
        if (mq.matches) backdrop.classList.add('show');
        try {
            const d = await API.getFavoritos();
            panelBody.innerHTML = `
                <div class="p-head">
                    <div class="p-flag">⭐</div>
                    <h3>Mis favoritos</h3>
                    <p class="p-tag">${d.favorites.length ? `${d.favorites.length} receta${d.favorites.length === 1 ? '' : 's'} guardada${d.favorites.length === 1 ? '' : 's'}` : 'Todavía no guardaste ninguna receta: tocá el ♥ en una tarjeta.'}</p>
                </div>
                ${d.favorites.map(r => `
                    <button class="ing-row" data-cid="${r.country_id}" data-rid="${r.id}" type="button">
                        <span class="flag">${r.emoji || '🌎'}</span>
                        <span>
                            <b>${r.name}</b>
                            <small>${r.country_name} · ${(DIFF[r.difficulty] || ['—'])[0]}</small>
                        </span>
                    </button>
                `).join('')}
            `;
        } catch (err) { panelBody.innerHTML = `<p class="p-tag">${err.message}</p>`; }
    }

    async function openIngredientModal(id) {
        ingModal.hidden = false;
        ingBody.innerHTML = '<p class="ing-sub">Buscando recetas…</p>';
        try {
            const d = await API.getIngrediente(id);
            ingBody.innerHTML = `
                <h4 class="ing-title">🧺 ${d.ingredient.name}</h4>
                <p class="ing-sub">Presente en ${d.recipes.length} receta${d.recipes.length === 1 ? '' : 's'}. Tocá una para ir al país.</p>
                ${d.recipes.map(r => `
                    <button class="ing-row" data-cid="${r.country_id}" data-rid="${r.recipe_id}" type="button">
                        <span class="flag">${r.emoji || '🌎'}</span>
                        <span>
                            <b>${r.recipe_name}</b>
                            <small>${r.country_name} · ${(DIFF[r.difficulty] || ['—'])[0]}</small>
                        </span>
                    </button>
                `).join('')}
            `;
        } catch (err) { ingBody.innerHTML = `<p class="ing-sub">${err.message}</p>`; }
    }

    function closeIngredientModal() { ingModal.hidden = true; }

    document.getElementById('ingClose').addEventListener('click', closeIngredientModal);
    ingModal.addEventListener('click', e => { if (e.target === ingModal) closeIngredientModal(); });
    ingBody.addEventListener('click', e => { const row = e.target.closest('.ing-row'); if (row) rowJump(row); });

    function rowJump(row) {
        const c = window.getCountryById ? window.getCountryById(row.dataset.cid) : null;
        if (!c || !c._g) return;
        closeIngredientModal();
        document.getElementById('coach').classList.add('done');
        openPanel(c, c._g, row.dataset.rid ? Number(row.dataset.rid) : undefined);
    }

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (!ingModal.hidden) return closeIngredientModal();
        if (panel.classList.contains('open')) closePanel();
    });

    window.openPanel = openPanel;
    window.closePanel = closePanel;
    window.closeIngredientModal = closeIngredientModal;
    window.openIngredientModal = openIngredientModal;
    window.openFavorites = openFavorites;
})();