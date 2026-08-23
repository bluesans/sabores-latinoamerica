import { API } from './api.js';
import { toast } from './ui/toast.js';
import { headHTML, panelHTML, favoritesHTML, ingredientModalHTML, iframeHTML, loadingHTML, errorHTML } from './util/dom.js';
import { unmountAdmin, isAdminDirty } from './admin.js';

const panel = document.getElementById('panel');
    const panelBody = document.getElementById('panelBody');
    const backdrop = document.getElementById('backdrop');
    const ingModal = document.getElementById('ingModal');
    const ingBody = document.getElementById('ingBody');
    const svg = document.getElementById('mapSvg');
    const mq = matchMedia('(max-width:720px)');
    let activeG = null, currentFavs = new Set();

    /* Elemento que abrió el panel: closePanel le devuelve el foco. Los puntos
       de entrada (mapa, nav:country, botón sorpresa, buscador) lo fijan con
       setOpener antes de abrir; openFavorites captura él mismo. */
    let openerEl = null;

    function setOpener(el) { openerEl = el instanceof Element ? el : null; }

    function restoreFocus() {
        const t = openerEl;
        openerEl = null;
        if (t && t.isConnected) { t.focus({ preventScroll: true }); return; }
        const shellEl = document.getElementById('mapShell');
        if (shellEl) shellEl.focus({ preventScroll: true });
    }

    /* Reintentos: cada superficie que falla guarda acá la llamada que debe
       repetirse, indexada por el token que viaja en data-retry. Un único
       handler delegado por contenedor la resuelve, sin listeners por botón. */
    const retryActions = new Map();
    let retrySeq = 0;

    function showRetryable(surface, err, fn) {
        const id = 'retry-' + (++retrySeq);
        retryActions.set(id, fn);
        surface.innerHTML = errorHTML(err.message, id);
    }

    function runRetry(btn) {
        const id = btn.dataset.retry;
        const fn = retryActions.get(id);
        if (!fn) return;
        btn.disabled = true;
        Promise.resolve(fn()).finally(() => retryActions.delete(id));
    }

    async function loadPanel(c, g, focusRid) {
        try {
            const [data, favs] = await Promise.all([API.getRecetas(c.id), API.getFavoritos()]);
            currentFavs = new Set(favs.favorites.map(f => Number(f.id)));
            renderPanel(data.country, data.recipes, focusRid);
        } catch (err) {
            console.warn('panel:', err.message);
            showRetryable(panelBody, err, () => loadPanel(c, g, focusRid));
        }
    }

    async function openPanel(c, g, focusRid) {
        unmountAdmin();
        if (activeG) activeG.classList.remove('active');
        activeG = g;
        g.classList.add('active');
        svg.classList.add('has-active');
        panelBody.innerHTML = headHTML(c.emoji || '🌎', c.name, 'Cargando recetas…') + loadingHTML('Traemos las recetas del país…', 3);
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        panel.scrollTop = 0;
        if (mq.matches) backdrop.classList.add('show');
        await loadPanel(c, g, focusRid);
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

    panelBody.addEventListener('click', e => {
        const retry = e.target.closest('[data-retry]');
        if (retry) return runRetry(retry);
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
        restoreFocus();
    }

    document.getElementById('panelClose').addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);

    async function loadFavorites() {
        try {
            const d = await API.getFavoritos();
            panelBody.innerHTML = favoritesHTML(d.favorites);
        } catch (err) {
            console.warn('favorites:', err.message);
            showRetryable(panelBody, err, loadFavorites);
        }
    }

    async function openFavorites() {
        unmountAdmin();
        setOpener(document.activeElement);
        if (activeG) activeG.classList.remove('active');
        activeG = null;
        svg.classList.remove('has-active');
        panelBody.innerHTML = loadingHTML('Buscando tus favoritos…', 4);
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        panel.scrollTop = 0;
        if (mq.matches) backdrop.classList.add('show');
        await loadFavorites();
    }

    /* Token de secuencia para el modal de ingrediente: si llega una segunda
       apertura mientras la primera sigue en vuelo, la respuesta tardía de la
       primera queda obsoleta (seq !== ingSeq) y se descarta en vez de
       pisar contenido más nuevo. Mismo patrón de carrera que fetchWithTimeout
       resuelve con AbortController en api.js. */
    let ingSeq = 0;

    /* Foco previo al modal: Escape/cierre lo restaura. El trap de Tab cicla
       dentro de .modal-card para que el teclado no escape al fondo tapado. */
    let modalOpener = null;

    function modalFocusables() {
        return [...ingModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
            .filter(el => !el.disabled && el.offsetParent !== null);
    }

    ingModal.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const f = modalFocusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (!ingModal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    async function loadIngredient(id) {
        const seq = ++ingSeq;
        try {
            const d = await API.getIngrediente(id);
            if (seq !== ingSeq) return;
            ingBody.innerHTML = ingredientModalHTML(d);
        } catch (err) {
            if (seq !== ingSeq) return;
            console.warn('ingrediente:', err.message);
            showRetryable(ingBody, err, () => loadIngredient(id));
        }
    }

    async function openIngredientModal(id) {
        if (ingModal.hidden) {
            modalOpener = document.activeElement instanceof Element ? document.activeElement : null;
            ingModal.hidden = false;
            document.getElementById('ingClose').focus({ preventScroll: true });
        }
        ingBody.innerHTML = '<p class="ing-sub">Buscando recetas…</p>';
        await loadIngredient(id);
    }

    function closeIngredientModal() {
        if (ingModal.hidden) return;
        ingModal.hidden = true;
        const t = modalOpener;
        modalOpener = null;
        if (t && t.isConnected) t.focus({ preventScroll: true });
    }

    document.getElementById('ingClose').addEventListener('click', closeIngredientModal);
    ingModal.addEventListener('click', e => { if (e.target === ingModal) closeIngredientModal(); });
    ingBody.addEventListener('click', e => {
        const retry = e.target.closest('[data-retry]');
        if (retry) return runRetry(retry);
        const row = e.target.closest('.ing-row');
        if (row) rowJump(row);
    });

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

export { openPanel, closePanel, closeIngredientModal, openIngredientModal, openFavorites, setOpener };