import test from 'node:test';
import assert from 'node:assert/strict';

/* ------------------------------------------------------------------ *
 * Stub mínimo de localStorage ANTES de importar api.js: el módulo
 * toca localStorage al evaluarse (lectura en el esquema viejo,
 * limpieza de migración en el nuevo).
 * ------------------------------------------------------------------ */
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear()
};

// Claves viejas (esquema pre-cookie): la migración debe borrarlas al cargar.
store.set('sdl_access', 'stale-access-token');
store.set('sdl_refresh', 'stale-refresh-token');

const { API } = await import('../api.js');

/* ---------------------------- helpers ----------------------------- */

const resp = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
});

const isRefresh = url => String(url).includes('/auth/refresh');
const isLogout = url => String(url).includes('/auth/logout');

/** Reemplaza fetch global por un mock que registra cada llamada. */
function mockFetch(handler) {
    const calls = [];
    const fn = (url, opts = {}) => {
        calls.push({ url: String(url), opts });
        return handler(url, opts, calls.length);
    };
    fn.calls = calls;
    globalThis.fetch = fn;
    return fn;
}

function resetApi() {
    API.setTokens(null);
    API._refreshPromise = null;
}

const flush = () => new Promise(r => setTimeout(r, 0));

/* ------------------------------ tests ----------------------------- */

test('migración: las claves sdl_access/sdl_refresh viejas se borran de localStorage al cargar el módulo', () => {
    assert.equal(localStorage.getItem('sdl_access'), null, 'sdl_access debe morir en la migración');
    assert.equal(localStorage.getItem('sdl_refresh'), null, 'sdl_refresh debe morir en la migración');
});

test('setTokens guarda sólo en memoria: localStorage queda intacto y acepta un único argumento', () => {
    API.setTokens('mem-only-token');
    assert.equal(API.access, 'mem-only-token');
    assert.equal(localStorage.getItem('sdl_access'), null);
    assert.equal(localStorage.getItem('sdl_refresh'), null);

    API.setTokens(null);
    assert.equal(API.access, null);
});

test('401 dispara UN refresh silencioso por cookie y reintenta una vez con el Bearer nuevo', async () => {
    resetApi();
    API.setTokens('old-access');

    const fetchMock = mockFetch((url, opts) => {
        if (isRefresh(url)) {
            // Contrato nuevo: POST + credenciales, SIN Authorization.
            assert.equal(opts.method, 'POST');
            assert.equal(opts.credentials, 'include');
            assert.equal(opts.headers?.Authorization, undefined, 'el refresh no lleva Authorization');
            return Promise.resolve(resp(200, { ok: true, access: 'new-access' }));
        }
        if (opts.headers.Authorization === 'Bearer old-access') {
            return Promise.resolve(resp(401, { ok: false, error: 'token vencido' }));
        }
        if (opts.headers.Authorization === 'Bearer new-access') {
            return Promise.resolve(resp(200, { ok: true, countries: [] }));
        }
        return Promise.resolve(resp(500, { ok: false }));
    });

    const out = await API.getPaises();

    assert.deepEqual(out, { ok: true, countries: [] });
    assert.equal(fetchMock.calls.length, 3, 'pedido 401 + refresh + reintento');
    assert.ok(isRefresh(fetchMock.calls[1].url), 'la segunda llamada es /auth/refresh');
    assert.equal(
        fetchMock.calls[2].opts.headers.Authorization,
        'Bearer new-access',
        'el reintento usa el access NUEVO'
    );
});

test('refresh fallido: limpia el access, lanza el error de sesión expirada y NO loopea', async () => {
    resetApi();
    API.setTokens('old-access');

    const fetchMock = mockFetch(url => {
        if (isRefresh(url)) return Promise.resolve(resp(401, { ok: false }));
        return Promise.resolve(resp(401, { ok: false, error: 'token vencido' }));
    });

    await assert.rejects(
        () => API.getStats(),
        err => err instanceof Error && err.message === 'La sesión expiró. Volvé a entrar.'
    );

    assert.equal(API.access, null, 'setTokens(null) tras el fallo de refresh');
    assert.equal(fetchMock.calls.length, 2, 'un pedido + un refresh fallido; sin bucle infinito');
});

test('single-flight: pedidos concurrentes en 401 comparten UNA sola llamada de red a refresh', async () => {
    resetApi();
    API.setTokens('shared-old');

    let refreshCalls = 0;
    let release;
    const gate = new Promise(res => { release = res; });

    mockFetch((url, opts) => {
        if (isRefresh(url)) {
            refreshCalls++;
            return gate.then(() => resp(200, { ok: true, access: 'fresh-access' }));
        }
        if (opts.headers.Authorization === 'Bearer shared-old') {
            return Promise.resolve(resp(401, { ok: false }));
        }
        return Promise.resolve(resp(200, { ok: true }));
    });

    const p1 = API.buscar('asado');
    const p2 = API.getStats();
    const p3 = API.getPaises();

    // Dejamos que los tres pedidos lleguen a su 401 y pidan refresh.
    await flush();
    await flush();

    release();
    await Promise.all([p1, p2, p3]);

    assert.equal(refreshCalls, 1, 'exactamente UNA llamada de red a /auth/refresh durante el vuelo');
});

test('logout: limpia el access en memoria y postea con credentials aunque fetch rechace', async () => {
    resetApi();
    API.setTokens('tok-antes-de-salir');

    const fetchMock = mockFetch(() => Promise.reject(new TypeError('network down')));

    await assert.doesNotReject(() => API.logout(), 'logout traga errores de red');

    assert.equal(API.access, null, 'el access en memoria se limpia igual');

    assert.equal(fetchMock.calls.length, 1, 'el POST a /auth/logout sale siempre');
    const { url, opts } = fetchMock.calls[0];
    assert.ok(isLogout(url));
    assert.equal(opts.method, 'POST');
    assert.equal(opts.credentials, 'include');
    assert.deepEqual(JSON.parse(opts.body), {}, 'body vacío: el server limpia su cookie');
    assert.equal(opts.headers.Authorization, undefined);
});

test('checkSession sin access restaura silenciosamente desde la cookie y sigue con bearer', async () => {
    resetApi();

    const fetchMock = mockFetch((url, opts) => {
        if (isRefresh(url)) return Promise.resolve(resp(200, { ok: true, access: 'restored-access' }));
        if (String(url).includes('/auth/check')) {
            assert.equal(opts.headers.Authorization, 'Bearer restored-access');
            return Promise.resolve(resp(200, { ok: true, username: 'qa_ck', role: 'user' }));
        }
        return Promise.resolve(resp(500, { ok: false }));
    });

    const out = await API.checkSession();

    assert.equal(out.username, 'qa_ck');
    assert.equal(API.access, 'restored-access');
    assert.equal(fetchMock.calls.length, 2);
});

test('checkSession sin cookie: el refresh falla y el boot cae en pantalla de login', async () => {
    resetApi();

    mockFetch(url => {
        if (isRefresh(url)) return Promise.resolve(resp(401, { ok: false }));
        return Promise.resolve(resp(200, { ok: true }));
    });

    await assert.rejects(
        () => API.checkSession(),
        err => err instanceof Error && err.message === 'La sesión expiró. Volvé a entrar.'
    );
});

/* ---------------------------- timeouts ---------------------------- */

// Drena microtareas sin tocar el setTimeout mockeado (setImmediate
// corre después de toda la cascada de promesas pendientes).
const settle = () => new Promise(r => setImmediate(r));

/** fetch que nunca responde por sí solo pero rechaza con AbortError
 *  cuando el controller de api.js corta la conexión (igual que undici
 *  y los navegadores). Sin signal en el pedido (código viejo), cuelga
 *  para siempre: así el rojo de estos tests es "no hay timeout". */
function mockFetchHanging() {
    return mockFetch((url, opts = {}) => {
        if (!opts.signal) {
            return new Promise(() => {});
        }

        return new Promise((_, reject) => {
            opts.signal.addEventListener('abort', () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
            });
        });
    });
}

test('_req: a los 15s aborta y avisa "La conexión tardó demasiado."', { timeout: 10000 }, async t => {
    resetApi();
    const fetchMock = mockFetchHanging();

    t.mock.timers.enable({ apis: ['setTimeout'] });

    const pending = API.getStats();

    // El manejador de rechazo se cuelga ANTES de adelantar el reloj:
    // si no, el rechazo queda sin handler y Node lo marca como
    // unhandledRejection antes de que assert.rejects lo espere.
    const rejection = assert.rejects(
        () => pending,
        err => err instanceof Error && err.message === 'La conexión tardó demasiado.'
    );

    // Adelanta el reloj falso 15s y deja correr las microtareas del abort.
    t.mock.timers.tick(15000);
    await settle();

    await rejection;

    assert.equal(fetchMock.calls.length, 1, 'el corte ocurre antes del 401: sin refresh ni reintento');
});

test('health: a los 5s cae al fallback {ok:false} sin rechazar ni colgar', { timeout: 10000 }, async t => {
    resetApi();
    const fetchMock = mockFetchHanging();

    t.mock.timers.enable({ apis: ['setTimeout'] });

    const pending = API.health();

    t.mock.timers.tick(5000);
    await settle();

    const out = await pending;

    assert.deepEqual(out, { ok: false, api: false, db: false }, 'timeout de health => fallback, nunca rechaza');
    assert.equal(fetchMock.calls.length, 1);
});

test('respuesta rápida: el timer se limpia y ningún abort tardío la toca', { timeout: 10000 }, async t => {
    resetApi();

    let seenSignal = null;
    mockFetch((url, opts = {}) => {
        seenSignal = opts.signal || null;
        return Promise.resolve(resp(200, { ok: true, stats: { paises: 21 } }));
    });

    t.mock.timers.enable({ apis: ['setTimeout'] });

    const out = await API.getStats();

    assert.deepEqual(out, { ok: true, stats: { paises: 21 } });
    assert.ok(seenSignal instanceof AbortSignal, 'el pedido sale con su AbortController');

    // Si el finally no limpiara el timer, este tick dispararía un abort
    // tardío sobre un pedido ya resuelto.
    t.mock.timers.tick(15000);
    await settle();

    assert.equal(seenSignal.aborted, false, 'sin abort post-respuesta');
});
