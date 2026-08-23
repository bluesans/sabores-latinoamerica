import { API_URL } from './config.js';

const AUTH_URL_PATTERN = /\/auth\//;

/* Migración desde el esquema viejo (tokens en localStorage): esas claves
   ya no se usan — el access vive sólo en memoria y el refresh viaja como
   cookie HttpOnly (sdl_refresh). Se borran para que no queden restos
   legibles por JS de una sesión anterior. */
try {
    localStorage.removeItem('sdl_access');
    localStorage.removeItem('sdl_refresh');
} catch {
    /* Sin storage disponible (tests / navegadores restrictivos): nada que limpiar. */
}

export const API = {
    /* Access token en memoria: muere con la página. El silencioso
       /auth/refresh lo repone desde la cookie al volver a entrar. */
    access: null,
    _refreshPromise: null,

    setTokens(a) {
        this.access = a || null;
    },

    async _req(url, opts = {}, retried = false) {
        opts.headers = {
            Accept: 'application/json',
            ...(opts.headers || {})
        };

        if (opts.body) {
            opts.headers['Content-Type'] = 'application/json';
        }

        if (this.access) {
            opts.headers['Authorization'] = 'Bearer ' + this.access;
        }

        let res;

        try {
            res = await fetch(url, opts);
        } catch (e) {
            throw new Error('No se pudo conectar con la API. Revisá Apache y la base.');
        }

        if (res.status === 401 && !retried && !AUTH_URL_PATTERN.test(url)) {
            await this.refreshSession();

            opts.headers['Authorization'] = 'Bearer ' + this.access;

            return this._req(url, opts, true);
        }

        let data = {};

        try {
            data = await res.json();
        } catch (e) {
            // Respuesta sin body.
        }

        if (!res.ok || data.ok === false) {
            throw new Error(data.error || `Error ${res.status} del servidor.`);
        }

        return data;
    },

    async refreshSession() {
        if (!this._refreshPromise) {
            this._refreshPromise = this._doRefresh().finally(() => {
                this._refreshPromise = null;
            });
        }

        return this._refreshPromise;
    },

    async _doRefresh() {
        try {
            const res = await fetch(`${API_URL}/auth/refresh`, {
                method: 'POST',
                credentials: 'include'
            });

            const d = await res.json().catch(() => ({}));

            if (!res.ok || d.ok === false || !d.access) {
                throw new Error();
            }

            this.setTokens(d.access);
        } catch (e) {
            this.setTokens(null);
            throw new Error('La sesión expiró. Volvé a entrar.');
        }
    },

    auth(action, username, password) {
        const endpoint = action === 'register' ? 'register' : 'login';

        return this._req(`${API_URL}/auth/${endpoint}`, {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    async checkSession() {
        try {
            if (!this.access) {
                /* Restauración silenciosa: puede quedar la cookie sdl_refresh
                   de una sesión previa aunque el access en memoria se haya
                   perdido al recargar. Sin cookie => falla => login. */
                await this.refreshSession();
            }

            return await this._req(`${API_URL}/auth/check`);
        } catch (e) {
            if (!this.access) {
                throw e;
            }

            await this.refreshSession();

            return this._req(`${API_URL}/auth/check`);
        }
    },

    logout() {
        this.setTokens(null);

        /* El servidor limpia la cookie sdl_refresh; el body ya no lleva
           tokens. Si la red falla, igual cerramos sesión del lado cliente. */
        return fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        }).catch(() => {});
    },

    health() {
        return fetch(`${API_URL}/health`)
            .then(res => res.json())
            .catch(() => ({ ok: false, api: false, db: false }));
    },

    getPaises() {
        return this._req(`${API_URL}/countries`);
    },

    getRecetas(id) {
        return this._req(`${API_URL}/countries/${id}/recipes`);
    },

    getStats() {
        return this._req(`${API_URL}/stats`);
    },

    getIngrediente(id) {
        return this._req(`${API_URL}/ingredients/${id}`);
    },

    getFavoritos() {
        return this._req(`${API_URL}/favorites`);
    },

    toggleFav(id, add) {
        return this._req(`${API_URL}/favorites`, {
            method: 'POST',
            body: JSON.stringify({
                recipe_id: id,
                add: add ? 1 : 0
            })
        });
    },

    buscar(q) {
        return this._req(`${API_URL}/search?q=${encodeURIComponent(q)}`);
    },

    adminList() {
        return this._req(`${API_URL}/admin/data`);
    },

    adminSave(p) {
        return this._req(`${API_URL}/admin/recipes`, {
            method: 'POST',
            body: JSON.stringify(p)
        });
    },

    adminDeleteRecipe(id) {
        return this._req(`${API_URL}/admin/recipes/${id}`, {
            method: 'DELETE'
        });
    },

    adminCountrySave(p) {
        return this._req(`${API_URL}/admin/countries/${p.id}`, {
            method: 'PUT',
            body: JSON.stringify(p)
        });
    },

    adminIngRename(id, name) {
        return this._req(`${API_URL}/admin/ingredients/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name })
        });
    },

    adminIngDelete(id) {
        return this._req(`${API_URL}/admin/ingredients/${id}`, {
            method: 'DELETE'
        });
    }
};
