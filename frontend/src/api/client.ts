import type {
  AdminData,
  AdminSession,
  ConsentInput,
  Country,
  CountryRecipes,
  Favorite,
  IngredientRecipes,
  Recipe,
  SearchResults,
  SessionUser,
  Stats,
  TopIngredient,
} from './types';

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/sabores-latinoamerica/api').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('La conexión tardó demasiado.', 0);
    }
    throw new ApiError('No se pudo conectar con la API. Revisá Apache y la base.', 0);
  } finally {
    clearTimeout(timer);
  }
}

class ApiClient {
  access: string | null = null;
  private refreshPromise: Promise<string> | null = null;

  setAccess(token: string | null): void {
    this.access = token;
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {},
    retried = false,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    };
    const hasBody = options.body !== undefined;
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (this.access) headers.Authorization = `Bearer ${this.access}`;

    const response = await fetchWithTimeout(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 401 && !retried && !path.startsWith('/auth/')) {
      await this.refresh();
      return this.request<T>(path, options, true);
    }

    let data: unknown = {};
    try {
      data = await response.json();
    } catch {
      // Respuesta sin body.
    }
    const payload = isObject(data) ? data : {};
    if (!response.ok || payload.ok === false) {
      const message =
        typeof payload.error === 'string'
          ? payload.error
          : `Error ${response.status} del servidor.`;
      throw new ApiError(message, response.status, payload);
    }
    return data as T;
  }

  async refresh(): Promise<string> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<string> {
    try {
      const response = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data: unknown = await response.json().catch(() => ({}));
      const payload = isObject(data) ? data : {};
      if (!response.ok || payload.ok === false || typeof payload.access !== 'string') {
        throw new ApiError('La sesión expiró. Volvé a entrar.', response.status);
      }
      this.setAccess(payload.access);
      return payload.access;
    } catch (error) {
      this.setAccess(null);
      window.dispatchEvent(new CustomEvent('sdl:auth-expired'));
      if (error instanceof ApiError) throw error;
      throw new ApiError('La sesión expiró. Volvé a entrar.', 401);
    }
  }

  async checkSession(): Promise<SessionUser> {
    if (!this.access) await this.refresh();
    try {
      return await this.request<SessionUser & { ok: boolean }>('/auth/check');
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      await this.refresh();
      return this.request<SessionUser & { ok: boolean }>('/auth/check');
    }
  }

  login(username: string, password: string): Promise<SessionUser & { access: string }> {
    return this.request('/auth/login', { method: 'POST', body: { username, password } });
  }

  register(
    username: string,
    password: string,
    consent: ConsentInput,
  ): Promise<SessionUser & { access: string }> {
    return this.request('/auth/register', {
      method: 'POST',
      body: { username, password, ...consent },
    });
  }

  async logout(): Promise<void> {
    this.setAccess(null);
    try {
      await fetchWithTimeout(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}',
      });
    } catch {
      // El cierre local es suficiente si la red falla.
    }
  }

  deleteAccount(password: string): Promise<{ ok: boolean }> {
    return this.request('/auth/account', { method: 'DELETE', body: { password } });
  }

  publicCountries(): Promise<{ countries: Country[] }> {
    return this.request('/countries');
  }

  stats(): Promise<{ stats: Stats; top_ingredients: TopIngredient[] }> {
    return this.request('/stats');
  }

  countryRecipes(countryId: number, page?: number, perPage = 12): Promise<CountryRecipes> {
    const params = page === undefined ? '' : `?page=${page}&per_page=${perPage}`;
    return this.request(`/countries/${countryId}/recipes${params}`);
  }

  search(query: string): Promise<SearchResults> {
    return this.request(`/search?q=${encodeURIComponent(query)}`);
  }

  favorites(): Promise<{ favorites: Favorite[] }> {
    return this.request('/favorites');
  }

  toggleFavorite(recipeId: number, add: boolean): Promise<{ ok: boolean }> {
    return this.request('/favorites', {
      method: 'POST',
      body: { recipe_id: recipeId, add: add ? 1 : 0 },
    });
  }

  ingredient(id: number): Promise<IngredientRecipes> {
    return this.request(`/ingredients/${id}`);
  }

  adminData(): Promise<AdminData> {
    return this.request('/admin/data');
  }

  adminSaveRecipe(payload: {
    id: number;
    country_id: number;
    name: string;
    description: string;
    difficulty: string;
    time_minutes: number;
    youtube_id: string;
    ingredients: string[];
  }): Promise<{ ok: boolean; recipe?: Recipe }> {
    return this.request('/admin/recipes', { method: 'POST', body: payload });
  }

  adminDeleteRecipe(id: number): Promise<{ ok: boolean }> {
    return this.request(`/admin/recipes/${id}`, { method: 'DELETE' });
  }

  adminSaveCountry(payload: {
    id: number;
    emoji: string;
    tagline: string;
  }): Promise<{ ok: boolean }> {
    return this.request(`/admin/countries/${payload.id}`, { method: 'PUT', body: payload });
  }

  adminRenameIngredient(id: number, name: string): Promise<{ ok: boolean }> {
    return this.request(`/admin/ingredients/${id}`, { method: 'PUT', body: { name } });
  }

  adminDeleteIngredient(id: number): Promise<{ ok: boolean }> {
    return this.request(`/admin/ingredients/${id}`, { method: 'DELETE' });
  }

  adminSessions(): Promise<{ sessions: AdminSession[] }> {
    return this.request('/admin/sessions');
  }

  adminRevokeSession(id: number): Promise<{ ok: boolean }> {
    return this.request(`/admin/sessions/${id}`, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
