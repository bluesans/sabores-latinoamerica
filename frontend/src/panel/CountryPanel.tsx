import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Recipe } from '../api/types';
import { useToast } from '../ui/ToastProvider';
import { RecipeCard } from './RecipeCard';

interface CountryPanelProps {
  countryId: number;
  focusRecipeId: number | null;
  opener: Element | null;
  onClose: () => void;
}

const PAGE_SIZE = 12;

export function CountryPanel({ countryId, focusRecipeId, opener, onClose }: CountryPanelProps) {
  const [page, setPage] = useState(1);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['country', countryId, page],
    queryFn: () => api.countryRecipes(countryId, page, PAGE_SIZE),
    retry: 1,
  });

  const favoritesQuery = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.favorites(),
    retry: 1,
  });

  const favorites = useMemo(
    () => new Set((favoritesQuery.data?.favorites ?? []).map((favorite) => favorite.id)),
    [favoritesQuery.data],
  );

  const toggle = useMutation({
    mutationFn: ({ recipe, add }: { recipe: Recipe; add: boolean }) =>
      api.toggleFavorite(recipe.id, add),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
    onError: (error) => toast(error.message),
  });

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement || opener instanceof SVGElement) {
        opener.focus({ preventScroll: true });
      } else {
        document.getElementById('mapShell')?.focus({ preventScroll: true });
      }
    };
  }, [opener]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!focusRecipeId || !query.data) return;
    const element = document.querySelector(`#recipe-${focusRecipeId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.add('flash');
    const timer = window.setTimeout(() => element.classList.remove('flash'), 1400);
    return () => window.clearTimeout(timer);
  }, [focusRecipeId, query.data]);

  const pagination = query.data?.pagination;
  const totalPages = pagination?.total_pages ?? 1;

  return (
    <>
      <button
        className="panel-backdrop show"
        type="button"
        aria-label="Cerrar panel"
        onClick={onClose}
      />
      <aside className="panel open" aria-label="Recetas del país" data-lenis-prevent>
        <button
          className="panel-close"
          type="button"
          aria-label="Cerrar panel"
          onClick={onClose}
          ref={closeRef}
        >
          ✕
        </button>
        <div ref={bodyRef}>
          {query.isLoading ? (
            <>
              <div className="p-head">
                <div className="p-flag">🌎</div>
                <h3>Cargando país…</h3>
                <p className="p-tag">Cargando recetas…</p>
              </div>
              {[0, 1, 2].map((index) => (
                <div
                  className="skel-card"
                  key={index}
                  style={{ '--i': index } as React.CSSProperties}
                  aria-hidden="true"
                >
                  <div className="skel w40" />
                  <div className="skel w90" />
                  <div className="skel w70" />
                  <div className="skel tall" />
                </div>
              ))}
            </>
          ) : null}

          {query.isError ? (
            <div className="state-error" role="alert">
              <span className="state-error-ico">⚠️</span>
              <p>
                {query.error instanceof Error
                  ? query.error.message
                  : 'No se pudieron cargar las recetas.'}
              </p>
              <button className="btn-retry" type="button" onClick={() => void query.refetch()}>
                ↻ Reintentar
              </button>
            </div>
          ) : null}

          {query.data ? (
            <>
              <div className="p-head">
                <div className="p-flag">{query.data.country.emoji || '🌎'}</div>
                <h3>{query.data.country.name}</h3>
                <p className="p-tag">{query.data.country.tagline || ''}</p>
                <div className="p-chips">
                  <span className="p-chip">
                    🍲 {pagination?.total ?? query.data.recipes.length} recetas
                  </span>
                  <span className="p-chip">
                    🎬 {query.data.recipes.filter((recipe) => recipe.youtube_id).length} con video
                  </span>
                </div>
              </div>

              {query.data.recipes.map((recipe, index) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  index={index}
                  favorite={favorites.has(recipe.id)}
                  onToggleFavorite={(item, add) => toggle.mutate({ recipe: item, add })}
                />
              ))}

              {totalPages > 1 ? (
                <div className="pager">
                  <button
                    className="btn-ghost"
                    type="button"
                    disabled={page <= 1}
                    onClick={() => {
                      setPage((current) => Math.max(1, current - 1));
                      bodyRef.current?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    ← Anterior
                  </button>
                  <span className="p-tag-page">
                    Página {page} de {totalPages}
                  </span>
                  <button
                    className="btn-ghost"
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => {
                      setPage((current) => Math.min(totalPages, current + 1));
                      bodyRef.current?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    Siguiente →
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
