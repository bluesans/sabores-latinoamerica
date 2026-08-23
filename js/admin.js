import { toast } from './ui/toast.js';
import { API } from './api.js';

/* Vue llega como script clásico global (js/vendor/vue.global.prod.js);
   el módulo sólo necesita desestructurar las APIs reactivas. */
const { ref, reactive } = Vue;

const AdminApp = {
        setup() {
            const tab = ref('recipes');
            const loading = ref(true);
            const error = ref('');
            const editing = ref(null);
            const data = reactive({ recipes: [], countries: [], ingredients: [] });

            function markDirty() { adminDirty = true; }

            async function load() {
                loading.value = true;
                error.value = '';
                try {
                    const d = await API.adminList();
                    data.recipes = d.recipes;
                    data.countries = d.countries;
                    data.ingredients = d.ingredients;
                } catch (err) { error.value = err.message; }
                loading.value = false;
            }

            function changeTab(t) { tab.value = t; editing.value = null; }

            function newRecipe() {
                editing.value = {
                    id: 0,
                    country_id: data.countries[0]?.id || 0,
                    name: '',
                    description: '',
                    difficulty: 'easy',
                    time_minutes: 30,
                    youtube_id: '',
                    ingredientsText: ''
                };
            }

            function editRecipe(r) {
                editing.value = {
                    id: r.id,
                    country_id: Number(r.country_id),
                    name: r.name,
                    description: r.description || '',
                    difficulty: r.difficulty || 'easy',
                    time_minutes: r.time_minutes || 0,
                    youtube_id: r.youtube_id || '',
                    ingredientsText: (r.ingredients || []).join(', ')
                };
            }

            async function submitRecipe() {
                const e = editing.value;
                const payload = {
                    id: e.id,
                    country_id: Number(e.country_id),
                    name: e.name,
                    description: e.description,
                    difficulty: e.difficulty,
                    time_minutes: Number(e.time_minutes),
                    youtube_id: e.youtube_id,
                    ingredients: e.ingredientsText.split(',').map(s => s.trim()).filter(Boolean)
                };
                try {
                    await API.adminSave(payload);
                    markDirty();
                    await load();
                    editing.value = null;
                    toast('Receta guardada ✅');
                } catch (err) { toast(err.message); }
            }

            async function deleteRecipe(id) {
                if (!confirm('¿Eliminar esta receta?')) return;
                try {
                    await API.adminDeleteRecipe(id);
                    markDirty();
                    await load();
                    toast('Receta eliminada');
                } catch (err) { toast(err.message); }
            }

            async function saveCountry(c) {
                try {
                    await API.adminCountrySave({ id: c.id, emoji: c.emoji, tagline: c.tagline });
                    markDirty();
                    toast('País actualizado ✅');
                } catch (err) { toast(err.message); }
            }

            async function renameIngredient(i) {
                try {
                    await API.adminIngRename(i.id, i.name);
                    markDirty();
                    await load();
                    toast('Ingrediente renombrado ✅');
                } catch (err) { toast(err.message); }
            }

            async function deleteIngredient(id) {
                if (!confirm('¿Eliminar ingrediente? Se quitará de las recetas que lo usen.')) return;
                try {
                    await API.adminIngDelete(id);
                    markDirty();
                    await load();
                } catch (err) { toast(err.message); }
            }

            load();

            return {
                tab, loading, error, editing, data, changeTab, newRecipe, editRecipe, submitRecipe,
                deleteRecipe, saveCountry, renameIngredient, deleteIngredient
            };
        },
        template: `
            <div class="p-head">
                <div class="p-flag">🛠️</div>
                <h3>Administración</h3>
                <p class="p-tag">ABM de recetas, países e ingredientes.</p>
            </div>
            <p v-if="loading" class="p-tag">Cargando administración…</p>
            <p v-else-if="error" class="p-tag">{{ error }}</p>
            <template v-else>
                <div class="adm-tabs">
                    <button type="button" :class="{on: tab==='recipes'}" @click="changeTab('recipes')">Recetas</button>
                    <button type="button" :class="{on: tab==='countries'}" @click="changeTab('countries')">Países</button>
                    <button type="button" :class="{on: tab==='ingredients'}" @click="changeTab('ingredients')">Ingredientes</button>
                </div>
                <form v-if="tab==='recipes' && editing" class="adm-form" @submit.prevent="submitRecipe">
                    <label>País
                        <select v-model.number="editing.country_id">
                            <option v-for="c in data.countries" :key="c.id" :value="c.id">{{ c.name }}</option>
                        </select>
                    </label>
                    <label>Nombre<input v-model="editing.name" required></label>
                    <label>Descripción<textarea v-model="editing.description" rows="3"></textarea></label>
                    <div class="adm-line">
                        <label>Dificultad
                            <select v-model="editing.difficulty">
                                <option value="easy">Fácil</option>
                                <option value="medium">Intermedia</option>
                                <option value="hard">Difícil</option>
                            </select>
                        </label>
                        <label>Minutos<input v-model.number="editing.time_minutes" type="number" min="1"></label>
                    </div>
                    <label>YouTube ID<input v-model="editing.youtube_id" placeholder="p. ej. MWo42SO1aOM"></label>
                    <label>Ingredientes (separados por coma)
                        <input v-model="editing.ingredientsText" list="ingList">
                    </label>
                    <datalist id="ingList">
                        <option v-for="i in data.ingredients" :key="i.id" :value="i.name"></option>
                    </datalist>
                    <div class="adm-line">
                        <button class="btn-primary" type="submit">Guardar</button>
                        <button class="btn-ghost" type="button" @click="editing=null">Cancelar</button>
                    </div>
                </form>
                <div v-else-if="tab==='recipes'">
                    <button class="btn-primary adm-new" type="button" @click="newRecipe">＋ Nueva receta</button>
                    <div class="adm-row" v-for="r in data.recipes" :key="r.id">
                        <span class="adm-name">{{ r.country_name }} · <b>{{ r.name }}</b></span>
                        <span>
                            <button class="adm-ico" title="Editar" @click="editRecipe(r)">✏️</button>
                            <button class="adm-ico" title="Eliminar" @click="deleteRecipe(r.id)">🗑️</button>
                        </span>
                    </div>
                </div>
                <div v-else-if="tab==='countries'">
                    <div class="adm-row adm-crow" v-for="c in data.countries" :key="c.id">
                        <b>{{ c.name }}</b>
                        <input v-model="c.emoji" maxlength="8" style="width:3.2rem">
                        <input v-model="c.tagline" placeholder="Frase del panel">
                        <button class="adm-ico" @click="saveCountry(c)">💾</button>
                    </div>
                </div>
                <div v-else>
                    <div class="adm-row adm-crow" v-for="i in data.ingredients" :key="i.id">
                        <input v-model="i.name">
                        <small class="adm-uses">{{ i.uses }} uso{{ i.uses == 1 ? '' : 's' }}</small>
                        <button class="adm-ico" @click="renameIngredient(i)">💾</button>
                        <button class="adm-ico" @click="deleteIngredient(i.id)">🗑️</button>
                    </div>
                </div>
            </template>
        `
    };

let appInstance = null;
let adminDirty = false;

/* closePanel recarga la página si hubo cambios sin guardar en la vista. */
export function isAdminDirty() { return adminDirty; }

export function unmountAdmin() {
    if (appInstance) { appInstance.unmount(); appInstance = null; }
}

export function openAdmin() {
    const { createApp } = Vue; // Vue llega del script clásico vendido (global).
    const panel = document.getElementById('panel');
    const panelBody = document.getElementById('panelBody');
    unmountAdmin();
    panelBody.innerHTML = '<div id="admRoot"></div>';
    appInstance = createApp(AdminApp);
    appInstance.mount('#admRoot');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    panel.scrollTop = 0;
}