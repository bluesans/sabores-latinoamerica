import type { CSSProperties } from 'react';
import type { Recipe } from '../api/types';
import { DIFF } from '../data/map-data';
import { formatTime } from '../lib/format';
import { useIngredientModal } from './IngredientModal';
import { VideoGate } from './VideoGate';

interface RecipeCardProps {
  recipe: Recipe;
  index: number;
  favorite: boolean;
  onToggleFavorite: (recipe: Recipe, add: boolean) => void;
}

export function RecipeCard({ recipe, index, favorite, onToggleFavorite }: RecipeCardProps) {
  const { openIngredient } = useIngredientModal();
  const [label, level] = DIFF[recipe.difficulty] ?? ['—', 'lv2'];
  return (
    <article
      className="rcard"
      style={{ '--i': index } as CSSProperties}
      data-rid={recipe.id}
      id={`recipe-${recipe.id}`}
    >
      <div className="rcard-top">
        <h4>{recipe.name}</h4>
        <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button
            className={`fav-btn${favorite ? ' on' : ''}`}
            type="button"
            title={favorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
            aria-label={
              favorite
                ? `Quitar ${recipe.name} de favoritos`
                : `Guardar ${recipe.name} en favoritos`
            }
            aria-pressed={favorite}
            onClick={() => onToggleFavorite(recipe, !favorite)}
          >
            ♥
          </button>
          <span className={`diff ${level}`}>{label}</span>
        </span>
      </div>
      <p className="rdesc">{recipe.description || ''}</p>
      <div className="rmeta">
        <span>⏱ {formatTime(recipe.time_minutes)}</span>
        <span>{recipe.youtube_id ? '🎬 con video' : '🎬 video en camino'}</span>
      </div>
      <div className="chips">
        {recipe.ingredients.map((ingredient) => (
          <button
            className="chip"
            key={ingredient.id}
            type="button"
            title={`Ver recetas con ${ingredient.name}`}
            onClick={() => openIngredient(ingredient.id)}
          >
            {ingredient.name}
          </button>
        ))}
      </div>
      <VideoGate youtubeId={recipe.youtube_id} name={recipe.name} />
    </article>
  );
}
