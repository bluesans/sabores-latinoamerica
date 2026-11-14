import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import type { IngredientRecipes } from '../api/types';
import { DIFF } from '../data/map-data';

interface IngredientModalContextValue {
  openIngredient: (id: number) => void;
}

const IngredientModalContext = createContext<IngredientModalContextValue | null>(null);

export function IngredientModalProvider({ children }: { children: ReactNode }) {
  const [ingredientId, setIngredientId] = useState<number | null>(null);
  const [data, setData] = useState<IngredientRecipes | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async (id: number) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.ingredient(id);
      setData(result);
    } catch (loadError) {
      setData(null);
      setError(
        loadError instanceof Error ? loadError.message : 'No se pudo cargar el ingrediente.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const openIngredient = useCallback(
    (id: number) => {
      openerRef.current = document.activeElement;
      setIngredientId(id);
      setData(null);
      void load(id);
    },
    [load],
  );

  const close = useCallback(() => {
    setIngredientId(null);
    setLoading(false);
    setError('');
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (ingredientId === null) return;
    document.documentElement.classList.add('modal-lock');
    closeRef.current?.focus({ preventScroll: true });
    return () => document.documentElement.classList.remove('modal-lock');
  }, [ingredientId]);

  useEffect(() => {
    if (ingredientId === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !cardRef.current) return;
      const focusables = [
        ...cardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hasAttribute('disabled'));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (!cardRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ingredientId, close]);

  const value = { openIngredient };

  return (
    <IngredientModalContext.Provider value={value}>
      {children}
      {ingredientId !== null ? (
        <div className="modal">
          <div
            className="modal-card"
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label="Recetas con este ingrediente"
            data-lenis-prevent
          >
            <button
              className="modal-close"
              type="button"
              aria-label="Cerrar"
              onClick={close}
              ref={closeRef}
            >
              ✕
            </button>
            {loading ? <p className="ing-sub">Buscando recetas…</p> : null}
            {error ? (
              <div className="state-error" role="alert">
                <span className="state-error-ico">⚠️</span>
                <p>{error}</p>
                <button
                  className="btn-retry"
                  type="button"
                  onClick={() => {
                    void load(ingredientId);
                  }}
                >
                  ↻ Reintentar
                </button>
              </div>
            ) : null}
            {data ? (
              <>
                <h4 className="ing-title">🧺 {data.ingredient.name}</h4>
                <p className="ing-sub">
                  Presente en {data.recipes.length} receta{data.recipes.length === 1 ? '' : 's'}.
                  Tocá una para ir al país.
                </p>
                {data.recipes.map((recipe) => (
                  <button
                    className="ing-row"
                    key={recipe.recipe_id}
                    type="button"
                    onClick={() => {
                      close();
                      navigate(`/pais/${recipe.country_id}?receta=${recipe.recipe_id}`);
                    }}
                  >
                    <span className="flag">{recipe.emoji || '🌎'}</span>
                    <span>
                      <b>{recipe.recipe_name}</b>
                      <small>
                        {recipe.country_name} · {(DIFF[recipe.difficulty] ?? ['—'])[0]}
                      </small>
                    </span>
                  </button>
                ))}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </IngredientModalContext.Provider>
  );
}

export function useIngredientModal(): IngredientModalContextValue {
  const value = useContext(IngredientModalContext);
  if (!value) throw new Error('useIngredientModal debe usarse dentro de IngredientModalProvider');
  return value;
}
