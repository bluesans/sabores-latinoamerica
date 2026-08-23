/* Utilidades puras de escape y construcción de HTML.
   Ninguna función de este módulo toca `document`: solo devuelven strings,
   así se pueden testear con `node --test` sin DOM.

   Regla del proyecto: TODO dato que venga de la API (o de un input) pasa por
   esc() antes de entrar a una plantilla HTML; los IDs numéricos se interpolan
   crudos sólo después de pasarlos por Number(); los IDs de YouTube pasan por
   safeUrl(). Los sinks de innerHTML consumen estos builders, nunca arman
   marcado con interpolaciones sueltas. */

import { DIFF } from '../data.js';

/* Escapa los cinco caracteres peligrosos en contexto HTML (texto y valor de
   atributo entre comillas). & va primero para no doble-escapar. */
export function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* Valida un ID de video de YouTube: quita todo espacio en blanco y sólo
   acepta exactamente 11 caracteres de [A-Za-z0-9_-]. Cualquier otra cosa
   (URLs javascript:, payloads con comillas, IDs cortos/largos) → ''. */
export function safeUrl(id) {
    const s = String(id ?? '').replace(/\s+/g, '');
    return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : '';
}

/* "45 min" → "45 min", "90" → "1 h 30 min", "60" → "1 h". Texto plano seguro. */
export function fmtTime(min) {
    min = Number(min) || 0;
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), r = min % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
}

/* Cabecera estándar del panel (usada por carga, error y favoritos). */
export function headHTML(flag, title, tag) {
    return `<div class="p-head"><div class="p-flag">${esc(flag)}</div><h3>${esc(title)}</h3><p class="p-tag">${esc(tag)}</p></div>`;
}

/* Iframe de YouTube embebido. Con ID inválido devuelve '' (no se renderiza
   iframe alguno: el sink queda vacío en lugar de abrirse a URLs arbitrarias). */
export function iframeHTML(ytId) {
    const id = safeUrl(ytId);
    if (!id) return '';
    return `<iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0" title="Video de la receta" loading="lazy" allowfullscreen allow="accelerometer; encrypted-media; picture-in-picture"></iframe>`;
}

/* Tarjeta de receta del panel de país. favsSet es el Set de ids favoritos
   del usuario actual. Todos los campos de BD pasan por esc()/Number(). */
export function cardHTML(r, i, favsSet) {
    const [lbl, cls] = DIFF[r.difficulty] || ['—', 'lv2'];
    const id = Number(r.id);
    const fav = favsSet.has(id);
    const vid = r.youtube_id
        ? `<div class="vid"><div class="poster" role="button" tabindex="0" data-yt="${esc(r.youtube_id)}" aria-label="Reproducir video de ${esc(r.name)}"><span class="play">▶</span><span class="poster-txt">Ver preparación paso a paso</span></div></div>`
        : `<div class="vid-none">🎥 El video de esta receta llega pronto</div>`;
    return `
            <article class="rcard" style="--i:${Number(i)}" data-rid="${id}">
                <div class="rcard-top">
                    <h4>${esc(r.name)}</h4>
                    <span style="display:flex;gap:.4rem;align-items:center">
                        <button class="fav-btn ${fav ? 'on' : ''}" data-fav="${id}" type="button" title="Favorita" aria-pressed="${fav}">♥</button>
                        <span class="diff ${cls}">${esc(lbl)}</span>
                    </span>
                </div>
                <p class="rdesc">${esc(r.description || '')}</p>
                <div class="rmeta">
                    <span>⏱ ${fmtTime(r.time_minutes)}</span>
                    <span>${r.youtube_id ? '🎬 con video' : '🎬 video en camino'}</span>
                </div>
                <div class="chips">
                    ${(r.ingredients || []).map(x => `<button class="chip" data-ing-id="${Number(x.id)}" type="button" title="Ver recetas con ${esc(x.name)}">${esc(x.name)}</button>`).join('')}
                </div>
                ${vid}
            </article>
        `;
}

/* Cuerpo completo del panel de país: cabecera + chips + tarjetas. */
export function panelHTML(country, recipes, favsSet) {
    const vids = recipes.filter(r => r.youtube_id).length;
    return `
            ${headHTML(country.emoji || '🌎', country.name, country.tagline || '')}
            <div class="p-chips">
                <span class="p-chip">🍲 ${Number(recipes.length)} recetas</span>
                <span class="p-chip">🎬 ${Number(vids)} con video</span>
            </div>
            ${recipes.map((r, i) => cardHTML(r, i, favsSet)).join('')}
        `;
}

/* Tooltip del mapa al pasar el puntero por un país. */
export function tipHTML(c) {
    return `<span class="tip-flag">${esc(c.emoji || '🌎')}</span><div><b>${esc(c.name)}</b><small>${c.recipe_count > 0 ? `${Number(c.recipe_count)} recetas disponibles` : 'Sin recetas por ahora'}</small></div>`;
}

/* Resultados del buscador del header (países + recetas + ingredientes).
   Incluye el caso "sin resultados" para que el sink sea una sola asignación. */
export function searchResultsHTML(d) {
    const empty = !d.countries.length && !d.recipes.length && !d.ingredients.length;
    if (empty) return '<div class="s-empty">Sin resultados 🤷</div>';
    return d.countries.map(c => `<button class="s-res" data-k="c" data-id="${Number(c.id)}"><span>${esc(c.emoji)}</span><b>${esc(c.name)}</b><small>país</small></button>`).join('') +
        d.recipes.map(r => `<button class="s-res" data-k="r" data-id="${Number(r.id)}" data-cid="${Number(r.country_id)}"><span>${esc(r.emoji)}</span><b>${esc(r.name)}</b><small>${esc(r.country_name)}</small></button>`).join('') +
        d.ingredients.map(i => `<button class="s-res" data-k="i" data-id="${Number(i.id)}"><span>🧺</span><b>${esc(i.name)}</b><small>${Number(i.uses)} usos</small></button>`).join('');
}

/* Fila de chips "ingredientes más usados" bajo la barra de estadísticas. */
export function topChipsHTML(tops) {
    return '<span class="ing-strip-title">🧺 Los más usados — tocá para explorar:</span>' +
        tops.map(t => `<button class="chip top-chip" data-top-ing="${Number(t.id)}" type="button">${esc(t.name)}<em>${Number(t.uses)}</em></button>`).join('');
}

/* Cuerpo completo de "Mis favoritos": cabecera con conteo + filas navegables. */
export function favoritesHTML(list) {
    return `
                ${headHTML('⭐', 'Mis favoritos', list.length ? `${list.length} receta${list.length === 1 ? '' : 's'} guardada${list.length === 1 ? '' : 's'}` : 'Todavía no guardaste ninguna receta: tocá el ♥ en una tarjeta.')}
                ${list.map(r => `
                    <button class="ing-row" data-cid="${Number(r.country_id)}" data-rid="${Number(r.id)}" type="button">
                        <span class="flag">${esc(r.emoji || '🌎')}</span>
                        <span>
                            <b>${esc(r.name)}</b>
                            <small>${esc(r.country_name)} · ${esc((DIFF[r.difficulty] || ['—'])[0])}</small>
                        </span>
                    </button>
                `).join('')}
            `;
}

/* Cuerpo del modal de ingrediente: nombre + recetas que lo usan. */
export function ingredientModalHTML(d) {
    return `
                <h4 class="ing-title">🧺 ${esc(d.ingredient.name)}</h4>
                <p class="ing-sub">Presente en ${Number(d.recipes.length)} receta${d.recipes.length === 1 ? '' : 's'}. Tocá una para ir al país.</p>
                ${d.recipes.map(r => `
                    <button class="ing-row" data-cid="${Number(r.country_id)}" data-rid="${Number(r.recipe_id)}" type="button">
                        <span class="flag">${esc(r.emoji || '🌎')}</span>
                        <span>
                            <b>${esc(r.recipe_name)}</b>
                            <small>${esc(r.country_name)} · ${esc((DIFF[r.difficulty] || ['—'])[0])}</small>
                        </span>
                    </button>
                `).join('')}
            `;
}
