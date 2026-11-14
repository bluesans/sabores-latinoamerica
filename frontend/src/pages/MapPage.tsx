import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { MapView } from '../map/MapView';
import { CountryPanel } from '../panel/CountryPanel';
import { useIngredientModal } from '../panel/IngredientModal';
import { useToast } from '../ui/ToastProvider';

export function MapPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { openIngredient } = useIngredientModal();
  const openerRef = useRef<Element | null>(null);

  const parsedId = params.countryId ? Number(params.countryId) : Number.NaN;
  const countryId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;
  const focusRecipeId = Number(searchParams.get('receta')) || null;

  const countriesQuery = useQuery({
    queryKey: ['countries'],
    queryFn: () => api.publicCountries(),
    retry: 1,
  });

  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.stats(),
    retry: 1,
  });

  const countries = countriesQuery.data?.countries ?? [];
  const stats = statsQuery.data?.stats;
  const topIngredients = statsQuery.data?.top_ingredients ?? [];

  const failed = useMemo(() => {
    const labels: string[] = [];
    if (countriesQuery.isError) labels.push('el mapa');
    if (statsQuery.isError) labels.push('las estadísticas');
    return labels;
  }, [countriesQuery.isError, statsQuery.isError]);

  return (
    <main className="main" id="main-content">
      <div className="map-head">
        <div>
          <h2 className="map-title">
            El mapa del sabor
            {stats ? (
              <span className="count">
                {stats.paises_con_recetas} países · {stats.total_recetas} recetas
              </span>
            ) : null}
          </h2>
          <p className="map-sub">
            Arrastrá para moverte y usá la rueda o los botones para hacer zoom. Los países
            encendidos guardan recetas; los apagados esperan su turno.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-ghost rnd-btn"
            type="button"
            onClick={() => {
              const options = countries.filter((country) => country.recipe_count > 0);
              const chosen = options[Math.floor(Math.random() * options.length)];
              if (chosen) navigate(`/pais/${chosen.id}`);
            }}
          >
            🎲 País sorpresa
          </button>
          <div className="legend">
            <span>
              <span className="lg-dot on" />
              Con recetas
            </span>
            <span>
              <span className="lg-dot off" />
              Próximamente
            </span>
          </div>
        </div>
      </div>

      {countriesQuery.isError ? (
        <div className="load-retry">
          <span>⚠️ No se pudo cargar el mapa.</span>
          <button className="btn-retry" type="button" onClick={() => void countriesQuery.refetch()}>
            ↻ Reintentar
          </button>
        </div>
      ) : (
        <MapView
          countries={countries}
          selectedCountryId={countryId}
          onSelect={(country, element) => {
            openerRef.current = element;
            if (country.recipe_count > 0) navigate(`/pais/${country.id}`);
            else toast(`Pronto sumaremos recetas de ${country.name} 🌱`);
          }}
          onEscape={() => navigate('/')}
        />
      )}

      <section className="stats" aria-label="Datos generales">
        <div className="stat">
          <AnimatedNumber value={Number(stats?.paises_con_recetas ?? 0)} />
          <span className="stat-label">Países documentados</span>
        </div>
        <div className="stat">
          <AnimatedNumber value={Number(stats?.total_recetas ?? 0)} />
          <span className="stat-label">Recetas típicas</span>
        </div>
        <div className="stat">
          <AnimatedNumber value={Number(stats?.ingredientes_distintos ?? 0)} />
          <span className="stat-label">Ingredientes relevados</span>
        </div>
        <div className="stat">
          <AnimatedNumber value={Number(stats?.recetas_con_video ?? 0)} />
          <span className="stat-label">Recetas con video</span>
        </div>
      </section>

      {statsQuery.isError ? (
        <div className="load-retry">
          <span>⚠️ No se pudieron cargar las estadísticas.</span>
          <button className="btn-retry" type="button" onClick={() => void statsQuery.refetch()}>
            ↻ Reintentar
          </button>
        </div>
      ) : null}

      {topIngredients.length ? (
        <div className="ing-strip">
          <span className="ing-strip-title">🧺 Los más usados — tocá para explorar:</span>
          {topIngredients.map((ingredient) => (
            <button
              className="chip top-chip"
              key={ingredient.id}
              type="button"
              onClick={() => openIngredient(ingredient.id)}
            >
              {ingredient.name}
              <em>{ingredient.uses}</em>
            </button>
          ))}
        </div>
      ) : null}

      {failed.length ? (
        <p className="p-tag" style={{ marginTop: '0.8rem' }}>
          No se pudo cargar {failed.join(' ni ')}. Podés reintentar sin recargar la página.
        </p>
      ) : null}

      {countryId !== null ? (
        <CountryPanel
          key={countryId}
          countryId={countryId}
          focusRecipeId={focusRecipeId}
          opener={openerRef.current}
          onClose={() => navigate('/')}
        />
      ) : null}
    </main>
  );
}
