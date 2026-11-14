import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import type { SearchResults } from '../api/types';
import { useIngredientModal } from '../panel/IngredientModal';

export function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const sequence = useRef(0);
  const navigate = useNavigate();
  const { openIngredient } = useIngredientModal();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    const current = ++sequence.current;
    const timer = window.setTimeout(() => {
      api
        .search(trimmed)
        .then((data) => {
          if (current !== sequence.current) return;
          setResults(data);
          setOpen(true);
          setActive(-1);
        })
        .catch(() => {
          if (current !== sequence.current) return;
          setOpen(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const flat = results
    ? [
        ...results.countries.map((item) => ({ kind: 'country' as const, item })),
        ...results.recipes.map((item) => ({ kind: 'recipe' as const, item })),
        ...results.ingredients.map((item) => ({ kind: 'ingredient' as const, item })),
      ]
    : [];

  const choose = (entry: (typeof flat)[number]) => {
    setOpen(false);
    setQuery('');
    if (entry.kind === 'country') {
      navigate(`/pais/${entry.item.id}`);
    } else if (entry.kind === 'recipe') {
      navigate(`/pais/${entry.item.country_id}?receta=${entry.item.id}`);
    } else {
      openIngredient(entry.item.id);
    }
  };

  return (
    <div className="search-box" ref={boxRef}>
      <input
        className="search-inp"
        placeholder="🔎 Plato, país o ingrediente…"
        autoComplete="off"
        aria-label="Buscar"
        role="combobox"
        aria-expanded={open}
        aria-controls="search-results"
        aria-autocomplete="list"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (results) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (flat.length) setActive((index) => (index + 1) % flat.length);
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (flat.length) setActive((index) => (index <= 0 ? flat.length - 1 : index - 1));
            return;
          }
          if (event.key === 'Enter') {
            const entry = flat[active >= 0 ? active : 0];
            if (entry) {
              event.preventDefault();
              choose(entry);
            }
          }
        }}
      />
      {open ? (
        <div
          className="search-res"
          id="search-results"
          role="listbox"
          aria-label="Resultados de búsqueda"
        >
          {flat.length === 0 ? (
            <div className="s-empty">Sin resultados 🤷</div>
          ) : (
            flat.map((entry, index) => {
              if (entry.kind === 'country') {
                return (
                  <button
                    className="s-res"
                    key={`c-${entry.item.id}`}
                    type="button"
                    role="option"
                    aria-selected={active === index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(entry)}
                  >
                    <span>{entry.item.emoji}</span>
                    <b>{entry.item.name}</b>
                    <small>país</small>
                  </button>
                );
              }
              if (entry.kind === 'recipe') {
                return (
                  <button
                    className="s-res"
                    key={`r-${entry.item.id}`}
                    type="button"
                    role="option"
                    aria-selected={active === index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(entry)}
                  >
                    <span>{entry.item.emoji}</span>
                    <b>{entry.item.name}</b>
                    <small>{entry.item.country_name}</small>
                  </button>
                );
              }
              return (
                <button
                  className="s-res"
                  key={`i-${entry.item.id}`}
                  type="button"
                  role="option"
                  aria-selected={active === index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(entry)}
                >
                  <span>🧺</span>
                  <b>{entry.item.name}</b>
                  <small>{entry.item.uses} usos</small>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
