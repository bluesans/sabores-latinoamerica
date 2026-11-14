import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useBeforeUnload, useBlocker } from 'react-router';
import { api } from '../api/client';
import type {
  AdminCountry,
  AdminData,
  AdminIngredient,
  AdminRecipe,
  AdminSession,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../ui/ToastProvider';

type Tab = 'recipes' | 'countries' | 'ingredients' | 'sessions';

interface RecipeDraft {
  id: number;
  country_id: number;
  name: string;
  description: string;
  difficulty: string;
  time_minutes: number;
  youtube_id: string;
  ingredientsText: string;
}

function emptyRecipe(countryId: number): RecipeDraft {
  return {
    id: 0,
    country_id: countryId,
    name: '',
    description: '',
    difficulty: 'easy',
    time_minutes: 30,
    youtube_id: '',
    ingredientsText: '',
  };
}

function hasDirtyDrafts(
  data: AdminData | undefined,
  countryDrafts: Record<number, { emoji: string; tagline: string }>,
  ingredientNames: Record<number, string>,
): boolean {
  if (!data) return false;
  const countriesDirty = data.countries.some((country) => {
    const draft = countryDrafts[country.id];
    if (!draft) return false;
    return draft.emoji !== (country.emoji ?? '') || draft.tagline !== (country.tagline ?? '');
  });
  const ingredientsDirty = data.ingredients.some(
    (ingredient) => (ingredientNames[ingredient.id] ?? ingredient.name) !== ingredient.name,
  );
  return countriesDirty || ingredientsDirty;
}

export function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('recipes');
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [countryDrafts, setCountryDrafts] = useState<
    Record<number, { emoji: string; tagline: string }>
  >({});
  const [ingredientNames, setIngredientNames] = useState<Record<number, string>>({});
  const draftsInitialized = useRef(false);
  const blocker = useBlocker(dirty);

  useBeforeUnload(
    (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    },
    { capture: true },
  );

  const dataQuery = useQuery({
    queryKey: ['admin-data'],
    queryFn: () => api.adminData(),
    enabled: user?.role === 'admin',
    retry: 1,
  });

  const sessionsQuery = useQuery({
    queryKey: ['admin-sessions'],
    queryFn: () => api.adminSessions(),
    enabled: user?.role === 'admin' && tab === 'sessions',
    retry: 1,
  });

  const data = dataQuery.data;

  const refreshDirty = () => {
    const fresh = queryClient.getQueryData<AdminData>(['admin-data']);
    setDirty(hasDirtyDrafts(fresh, countryDrafts, ingredientNames));
  };

  useEffect(() => {
    if (!data || draftsInitialized.current) return;
    draftsInitialized.current = true;
    setCountryDrafts(
      Object.fromEntries(
        data.countries.map((country) => [
          country.id,
          { emoji: country.emoji ?? '', tagline: country.tagline ?? '' },
        ]),
      ),
    );
    setIngredientNames(
      Object.fromEntries(data.ingredients.map((ingredient) => [ingredient.id, ingredient.name])),
    );
  }, [data]);

  const saveRecipe = useMutation({
    mutationFn: (recipe: RecipeDraft) =>
      api.adminSaveRecipe({
        id: recipe.id,
        country_id: Number(recipe.country_id),
        name: recipe.name,
        description: recipe.description,
        difficulty: recipe.difficulty,
        time_minutes: Number(recipe.time_minutes),
        youtube_id: recipe.youtube_id,
        ingredients: recipe.ingredientsText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-data'] });
      await queryClient.invalidateQueries({ queryKey: ['countries'] });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
      refreshDirty();
      toast('Receta guardada ✅');
    },
    onError: (error) => toast(error.message),
  });

  const deleteRecipe = useMutation({
    mutationFn: (id: number) => api.adminDeleteRecipe(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-data'] });
      await queryClient.invalidateQueries({ queryKey: ['countries'] });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
      refreshDirty();
      toast('Receta eliminada');
    },
    onError: (error) => toast(error.message),
  });

  const saveCountry = useMutation({
    mutationFn: (country: AdminCountry) => {
      const draftCountry = countryDrafts[country.id];
      return api.adminSaveCountry({
        id: country.id,
        emoji: draftCountry?.emoji ?? '',
        tagline: draftCountry?.tagline ?? '',
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-data'] });
      await queryClient.invalidateQueries({ queryKey: ['countries'] });
      refreshDirty();
      toast('País actualizado ✅');
    },
    onError: (error) => toast(error.message),
  });

  const renameIngredient = useMutation({
    mutationFn: (ingredient: AdminIngredient) =>
      api.adminRenameIngredient(ingredient.id, ingredientNames[ingredient.id] ?? ingredient.name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-data'] });
      refreshDirty();
      toast('Ingrediente renombrado ✅');
    },
    onError: (error) => toast(error.message),
  });

  const deleteIngredient = useMutation({
    mutationFn: (id: number) => api.adminDeleteIngredient(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-data'] });
      refreshDirty();
      toast('Ingrediente eliminado');
    },
    onError: (error) => toast(error.message),
  });

  const revokeSession = useMutation({
    mutationFn: (id: number) => api.adminRevokeSession(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-sessions'] });
      toast('Sesión revocada');
    },
    onError: (error) => toast(error.message),
  });

  if (user?.role !== 'admin') {
    return (
      <main className="admin-page" id="main-content">
        <div className="state-error" role="alert">
          <span className="state-error-ico">🔒</span>
          <p>Solo las personas administradoras pueden acceder a este panel.</p>
          <Link className="btn-retry" to="/">
            ← Volver al mapa
          </Link>
        </div>
      </main>
    );
  }

  const changeTab = (next: Tab) => {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    setDraft(null);
    if (data) {
      setCountryDrafts(
        Object.fromEntries(
          data.countries.map((country) => [
            country.id,
            { emoji: country.emoji ?? '', tagline: country.tagline ?? '' },
          ]),
        ),
      );
      setIngredientNames(
        Object.fromEntries(data.ingredients.map((ingredient) => [ingredient.id, ingredient.name])),
      );
    }
    setDirty(false);
    setTab(next);
  };

  const startEdit = (recipe: AdminRecipe) => {
    setDraft({
      id: recipe.id,
      country_id: Number(recipe.country_id),
      name: recipe.name,
      description: recipe.description ?? '',
      difficulty: recipe.difficulty ?? 'easy',
      time_minutes: Number(recipe.time_minutes) || 0,
      youtube_id: recipe.youtube_id ?? '',
      ingredientsText: (recipe.ingredients ?? []).join(', '),
    });
    setDirty(false);
  };

  const submitRecipe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) {
      toast('El nombre de la receta es obligatorio.');
      return;
    }
    saveRecipe.mutate(draft);
  };

  return (
    <main className="admin-page" id="main-content">
      <div className="p-head">
        <div className="p-flag">🛠️</div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '2rem' }}>
          Administración
        </h3>
        <p className="p-tag">ABM de recetas, países e ingredientes.</p>
      </div>
      <p className="admin-note">
        Los cambios se guardan contra la API y se reflejan sin recargar la página. Si hay ediciones
        sin guardar, la navegación pide confirmación. <Link to="/">← Volver al mapa</Link>
      </p>

      {dataQuery.isLoading ? <p className="p-tag">Cargando administración…</p> : null}
      {dataQuery.isError ? (
        <div className="state-error" role="alert">
          <span className="state-error-ico">⚠️</span>
          <p>
            {dataQuery.error instanceof Error
              ? dataQuery.error.message
              : 'No se pudo cargar el panel.'}
          </p>
          <button className="btn-retry" type="button" onClick={() => void dataQuery.refetch()}>
            ↻ Reintentar
          </button>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="admin-tabs" role="tablist" aria-label="Secciones de administración">
            {(
              [
                ['recipes', 'Recetas'],
                ['countries', 'Países'],
                ['ingredients', 'Ingredientes'],
                ['sessions', 'Sesiones'],
              ] as Array<[Tab, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? 'on' : ''}
                onClick={() => changeTab(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'recipes' ? (
            draft ? (
              <form className="adm-form" onSubmit={submitRecipe}>
                <label>
                  País
                  <select
                    value={draft.country_id}
                    onChange={(event) => {
                      setDraft({ ...draft, country_id: Number(event.target.value) });
                      setDirty(true);
                    }}
                  >
                    {data.countries.map((country) => (
                      <option key={country.id} value={country.id}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nombre
                  <input
                    required
                    value={draft.name}
                    onChange={(event) => {
                      setDraft({ ...draft, name: event.target.value });
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Descripción
                  <textarea
                    rows={3}
                    value={draft.description}
                    onChange={(event) => {
                      setDraft({ ...draft, description: event.target.value });
                      setDirty(true);
                    }}
                  />
                </label>
                <div className="adm-line">
                  <label>
                    Dificultad
                    <select
                      value={draft.difficulty}
                      onChange={(event) => {
                        setDraft({ ...draft, difficulty: event.target.value });
                        setDirty(true);
                      }}
                    >
                      <option value="easy">Fácil</option>
                      <option value="medium">Intermedia</option>
                      <option value="hard">Difícil</option>
                    </select>
                  </label>
                  <label>
                    Minutos
                    <input
                      type="number"
                      min={1}
                      value={draft.time_minutes}
                      onChange={(event) => {
                        setDraft({ ...draft, time_minutes: Number(event.target.value) });
                        setDirty(true);
                      }}
                    />
                  </label>
                </div>
                <label>
                  YouTube ID
                  <input
                    placeholder="p. ej. MWo42SO1aOM"
                    value={draft.youtube_id}
                    onChange={(event) => {
                      setDraft({ ...draft, youtube_id: event.target.value });
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Ingredientes (separados por coma)
                  <input
                    list="ingredient-list"
                    value={draft.ingredientsText}
                    onChange={(event) => {
                      setDraft({ ...draft, ingredientsText: event.target.value });
                      setDirty(true);
                    }}
                  />
                </label>
                <datalist id="ingredient-list">
                  {data.ingredients.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.name} />
                  ))}
                </datalist>
                <div className="adm-line">
                  <button className="btn-primary" type="submit" disabled={saveRecipe.isPending}>
                    {saveRecipe.isPending ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={() => {
                      if (dirty && !window.confirm('¿Descartar los cambios?')) return;
                      setDraft(null);
                      setDirty(false);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <>
                <button
                  className="btn-primary adm-new"
                  type="button"
                  onClick={() => {
                    setDraft(emptyRecipe(data.countries[0]?.id ?? 0));
                    setDirty(false);
                  }}
                >
                  ＋ Nueva receta
                </button>
                {data.recipes.map((recipe) => (
                  <div className="adm-row" key={recipe.id}>
                    <span className="adm-name">
                      {recipe.country_name} · <b>{recipe.name}</b>
                    </span>
                    <span>
                      <button
                        className="adm-ico"
                        type="button"
                        title="Editar"
                        onClick={() => startEdit(recipe)}
                      >
                        ✏️
                      </button>
                      <button
                        className="adm-ico"
                        type="button"
                        title="Eliminar"
                        onClick={() => {
                          if (window.confirm('¿Eliminar esta receta?'))
                            deleteRecipe.mutate(recipe.id);
                        }}
                      >
                        🗑️
                      </button>
                    </span>
                  </div>
                ))}
              </>
            )
          ) : null}

          {tab === 'countries' ? (
            <div>
              {data.countries.map((country) => (
                <div className="adm-row adm-crow" key={country.id}>
                  <b style={{ minWidth: '8rem' }}>{country.name}</b>
                  <input
                    aria-label={`Emoji de ${country.name}`}
                    maxLength={8}
                    style={{ width: '3.2rem', flex: '0 0 3.2rem' }}
                    value={countryDrafts[country.id]?.emoji ?? ''}
                    onChange={(event) => {
                      setCountryDrafts((current) => ({
                        ...current,
                        [country.id]: {
                          emoji: event.target.value,
                          tagline: current[country.id]?.tagline ?? '',
                        },
                      }));
                      setDirty(true);
                    }}
                  />
                  <input
                    aria-label={`Frase de ${country.name}`}
                    placeholder="Frase del panel"
                    value={countryDrafts[country.id]?.tagline ?? ''}
                    onChange={(event) => {
                      setCountryDrafts((current) => ({
                        ...current,
                        [country.id]: {
                          emoji: current[country.id]?.emoji ?? '',
                          tagline: event.target.value,
                        },
                      }));
                      setDirty(true);
                    }}
                  />
                  <button
                    className="adm-ico"
                    type="button"
                    title="Guardar país"
                    onClick={() => saveCountry.mutate(country)}
                  >
                    💾
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'ingredients' ? (
            <div>
              {data.ingredients.map((ingredient) => (
                <div className="adm-row adm-crow" key={ingredient.id}>
                  <input
                    aria-label={`Nombre de ${ingredient.name}`}
                    value={ingredientNames[ingredient.id] ?? ingredient.name}
                    onChange={(event) => {
                      setIngredientNames((current) => ({
                        ...current,
                        [ingredient.id]: event.target.value,
                      }));
                      setDirty(true);
                    }}
                  />
                  <small className="adm-uses">
                    {ingredient.uses} uso{ingredient.uses === 1 ? '' : 's'}
                  </small>
                  <button
                    className="adm-ico"
                    type="button"
                    title="Guardar ingrediente"
                    onClick={() => renameIngredient.mutate(ingredient)}
                  >
                    💾
                  </button>
                  <button
                    className="adm-ico"
                    type="button"
                    title="Eliminar ingrediente"
                    onClick={() => {
                      if (
                        window.confirm(
                          '¿Eliminar ingrediente? Se quitará de las recetas que lo usen.',
                        )
                      ) {
                        deleteIngredient.mutate(ingredient.id);
                      }
                    }}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'sessions' ? (
            <div>
              {sessionsQuery.isLoading ? <p className="p-tag">Cargando sesiones…</p> : null}
              {sessionsQuery.isError ? (
                <p className="p-tag">
                  {sessionsQuery.error instanceof Error
                    ? sessionsQuery.error.message
                    : 'Error de sesiones.'}
                </p>
              ) : null}
              {sessionsQuery.data?.sessions.length === 0 ? (
                <p className="p-tag">No hay sesiones para mostrar.</p>
              ) : null}
              {(sessionsQuery.data?.sessions ?? []).map((session: AdminSession) => (
                <div className="adm-row adm-crow" key={session.id}>
                  <span className="adm-name">
                    <b>{session.username}</b> · {session.revoked_at ? 'Revocada' : 'Activa'}
                  </span>
                  <small className="adm-uses">
                    Creada {session.created_at} · Expira {session.expires_at} · IP{' '}
                    {session.ip || '—'} · {session.user_agent || '—'}
                  </small>
                  {!session.revoked_at ? (
                    <button
                      className="adm-ico"
                      type="button"
                      title="Revocar sesión"
                      onClick={() => {
                        if (
                          window.confirm('¿Revocar esta sesión? La persona deberá volver a entrar.')
                        ) {
                          revokeSession.mutate(session.id);
                        }
                      }}
                    >
                      🚫
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {blocker.state === 'blocked' ? (
        <div className="modal">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Cambios sin guardar"
            data-lenis-prevent
          >
            <h4 className="ing-title">Cambios sin guardar</h4>
            <p className="ing-sub">Si salís ahora, las ediciones de esta pantalla se pierden.</p>
            <div className="adm-line">
              <button className="btn-primary" type="button" onClick={() => blocker.reset?.()}>
                Seguir editando
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  setDirty(false);
                  blocker.proceed?.();
                }}
              >
                Descartar y salir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
