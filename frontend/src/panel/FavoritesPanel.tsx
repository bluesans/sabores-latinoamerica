import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { DIFF } from '../data/map-data';
import { formatTime } from '../lib/format';

export function FavoritesPanel({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<Element | null>(document.activeElement);
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['favorites'], queryFn: () => api.favorites(), retry: 1 });

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const opener = openerRef.current;
      if (opener instanceof HTMLElement || opener instanceof SVGElement) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [onClose]);

  const favorites = query.data?.favorites ?? [];

  return (
    <>
      <button
        className="panel-backdrop show"
        type="button"
        aria-label="Cerrar panel"
        onClick={onClose}
      />
      <aside className="panel open" aria-label="Mis favoritos" data-lenis-prevent>
        <button
          className="panel-close"
          type="button"
          aria-label="Cerrar panel"
          onClick={onClose}
          ref={closeRef}
        >
          ✕
        </button>
        <div className="p-head">
          <div className="p-flag">⭐</div>
          <h3>Mis favoritos</h3>
          <p className="p-tag">
            {favorites.length
              ? `${favorites.length} receta${favorites.length === 1 ? '' : 's'} guardada${favorites.length === 1 ? '' : 's'}`
              : 'Todavía no guardaste ninguna receta: tocá el ♥ en una tarjeta.'}
          </p>
        </div>
        {query.isLoading ? <p className="p-tag">Buscando tus favoritos…</p> : null}
        {query.isError ? (
          <div className="state-error" role="alert">
            <span className="state-error-ico">⚠️</span>
            <p>
              {query.error instanceof Error
                ? query.error.message
                : 'No se pudieron cargar los favoritos.'}
            </p>
            <button className="btn-retry" type="button" onClick={() => void query.refetch()}>
              ↻ Reintentar
            </button>
          </div>
        ) : null}
        {favorites.map((favorite, index) => (
          <button
            className="ing-row"
            key={favorite.id}
            type="button"
            style={{ '--i': index } as CSSProperties}
            onClick={() => navigate(`/pais/${favorite.country_id}?receta=${favorite.id}`)}
          >
            <span className="flag">{favorite.emoji || '🌎'}</span>
            <span>
              <b>{favorite.name}</b>
              <small>
                {favorite.country_name} · {(DIFF[favorite.difficulty] ?? ['—'])[0]} ·{' '}
                {formatTime(favorite.time_minutes)}
              </small>
            </span>
          </button>
        ))}
      </aside>
    </>
  );
}
