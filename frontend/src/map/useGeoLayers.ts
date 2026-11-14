import { useEffect, useState } from 'react';
import { buildGeoLayers, type GeoLayers, type TopoJSON } from './geo';

const CACHE_KEY = 'sdl_topo_50m_v1';

function isTopo(value: unknown): value is TopoJSON {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.arcs)) return false;
  if (typeof record.transform !== 'object' || record.transform === null) return false;
  if (typeof record.objects !== 'object' || record.objects === null) return false;
  const objects = record.objects as Record<string, unknown>;
  const countries = objects.countries;
  return typeof countries === 'object' && countries !== null;
}

async function loadJson(url: string): Promise<TopoJSON | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return isTopo(data) ? data : null;
  } catch {
    return null;
  }
}

export interface GeoState {
  geo: GeoLayers | null;
  hd: boolean;
  loading: boolean;
}

export function useGeoLayers(): GeoState {
  const [state, setState] = useState<GeoState>({ geo: null, hd: false, loading: true });

  useEffect(() => {
    let active = true;
    const base = import.meta.env.BASE_URL;
    const sources = [`${base}data/countries-50m.json`, `${base}data/countries-110m.json`];

    async function load() {
      let topo: TopoJSON | null = null;
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed: unknown = JSON.parse(cached);
          if (isTopo(parsed)) topo = parsed;
        } catch {
          topo = null;
        }
      }
      let hd = Boolean(topo);
      if (!topo) {
        for (const [index, url] of sources.entries()) {
          topo = await loadJson(url);
          if (topo) {
            hd = index === 0;
            if (index === 0) {
              try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(topo));
              } catch {
                // Cuota llena o storage bloqueado: se sigue sin caché.
              }
            }
            break;
          }
        }
      }
      if (!active) return;
      let geo: GeoLayers | null = null;
      if (topo) {
        try {
          geo = buildGeoLayers(topo);
        } catch {
          geo = null;
        }
      }
      setState({ geo, hd: hd && geo !== null, loading: false });
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return state;
}
