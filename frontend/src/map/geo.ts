import { FILLS, MAP_SHAPES, type MapShape } from '../data/map-data';

export interface TopoGeometry {
  type: string;
  id?: string | number;
  arcs?: number[][] | number[][][];
}

export interface TopoJSON {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: { countries: { geometries: TopoGeometry[] } };
}

export interface FeaturePoly {
  id: number;
  polys: Array<Array<Array<[number, number]>>>;
}

export interface GeoLayers {
  byIso: Record<number, string>;
  labelPts: Record<number, [number, number]>;
  eqY: number;
  labels: { pacifico: [number, number]; atlantico: [number, number]; caribe: [number, number] };
}

export const VB_W = 1000;
export const VB_H = 1110;

export function decodeTopo(topo: TopoJSON): FeaturePoly[] {
  const { scale, translate } = topo.transform;
  const [sx, sy] = scale;
  const [tx, ty] = translate;
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map((point) => {
      x += point[0] ?? 0;
      y += point[1] ?? 0;
      return [x * sx + tx, y * sy + ty] as [number, number];
    });
  });

  const ring = (idxs: number[]): Array<[number, number]> => {
    let points: Array<[number, number]> = [];
    idxs.forEach((idx, index) => {
      let arc = idx >= 0 ? arcs[idx] : arcs[~idx]?.slice().reverse();
      if (!arc) return;
      if (index > 0) arc = arc.slice(1);
      points = points.concat(arc);
    });
    return points;
  };

  return topo.objects.countries.geometries.map((geometry) => {
    let polys: Array<Array<Array<[number, number]>>> = [];
    if (geometry.type === 'Polygon') {
      polys = [(geometry.arcs as number[][]).map(ring)];
    } else if (geometry.type === 'MultiPolygon') {
      polys = (geometry.arcs as number[][][]).map((polygon) => polygon.map(ring));
    }
    return { id: Number.parseInt(String(geometry.id), 10), polys };
  });
}

export function merc(lon: number, lat: number): [number, number] {
  const clamped = Math.max(-85, Math.min(85, lat));
  return [(lon * Math.PI) / 180, -Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360))];
}

export function ringArea2(ring: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    if (!current || !next) continue;
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area / 2);
}

export function ringCentroid2(ring: Array<[number, number]>): [number, number] | null {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    if (!current || !next) continue;
    const factor = current[0] * next[1] - next[0] * current[1];
    area += factor;
    cx += (current[0] + next[0]) * factor;
    cy += (current[1] + next[1]) * factor;
  }
  area /= 2;
  if (Math.abs(area) < 1e-9) return null;
  return [cx / (6 * area), cy / (6 * area)];
}

export function pip2(point: [number, number], ring: Array<[number, number]>): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i];
    const previous = ring[j];
    if (!current || !previous) continue;
    const [xi, yi] = current;
    const [xj, yj] = previous;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function labelPoint(ring: Array<[number, number]>): [number, number] {
  const centroid = ringCentroid2(ring);
  if (centroid && pip2(centroid, ring)) return centroid;
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  ring.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  const bboxCenter: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
  return pip2(bboxCenter, ring) ? bboxCenter : (centroid ?? bboxCenter);
}

function path2d(ring: Array<[number, number]>, tolerance: number): string {
  let path = '';
  let lastX = 0;
  let lastY = 0;
  let started = false;
  for (const [x, y] of ring) {
    if (!started) {
      path += `M${x.toFixed(1)},${y.toFixed(1)}`;
      started = true;
    } else if (Math.hypot(x - lastX, y - lastY) >= tolerance) {
      path += `L${x.toFixed(1)},${y.toFixed(1)}`;
    } else {
      continue;
    }
    lastX = x;
    lastY = y;
  }
  return `${path}Z`;
}

export function buildGeoLayers(topo: TopoJSON): GeoLayers | null {
  const features = decodeTopo(topo);
  if (!features.length) return null;

  const isos = new Set(MAP_SHAPES.map((shape) => shape.iso));
  const latam = features.filter((feature) => isos.has(feature.id));
  if (!latam.length) return null;

  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  latam.forEach((feature) => {
    feature.polys.forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach(([lon, lat]) => {
          const [x, y] = merc(lon, lat);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        });
      });
    });
  });

  const pad = 18;
  const scale = Math.min((VB_W - 2 * pad) / (maxX - minX), (VB_H - 2 * pad) / (maxY - minY));
  const offsetX = (VB_W - (maxX - minX) * scale) / 2;
  const offsetY = (VB_H - (maxY - minY) * scale) / 2;
  const project = (lon: number, lat: number): [number, number] => {
    const [x, y] = merc(lon, lat);
    return [(x - minX) * scale + offsetX, (y - minY) * scale + offsetY];
  };

  const byIso: Record<number, string> = {};
  const labelPts: Record<number, [number, number]> = {};

  latam.forEach((feature) => {
    let path = '';
    let best: { area: number; ring: Array<[number, number]> } | null = null;
    feature.polys.forEach((polygon) => {
      const rings = polygon.map((ring) => ring.map(([lon, lat]) => project(lon, lat)));
      rings.forEach((projected) => {
        path += path2d(projected, 0.35);
      });
      const first = rings[0];
      if (!first) return;
      const area = ringArea2(first);
      if (!best || area > best.area) best = { area, ring: first };
    });
    byIso[feature.id] = path;
    if (best !== null) {
      const chosen: { area: number; ring: Array<[number, number]> } = best;
      labelPts[feature.id] = labelPoint(chosen.ring);
    }
  });

  return {
    byIso,
    labelPts,
    eqY: project(-70, 0)[1],
    labels: {
      pacifico: project(-103, -14),
      atlantico: project(-37, -30),
      caribe: project(-70, 14),
    },
  };
}

export interface MapCountryRender {
  info: MapShape & {
    id: number | null;
    name: string;
    emoji: string;
    tagline: string;
    recipe_count: number;
    dbId: number | null;
  };
  path: string;
  fill: string;
}

export function renderCountries(
  countries: Array<{
    id: number;
    iso_code: number;
    name: string;
    emoji: string;
    tagline: string | null;
    recipe_count: number;
  }>,
  geo: GeoLayers | null,
): MapCountryRender[] {
  const byIso = new Map(countries.map((country) => [Number(country.iso_code), country]));
  let fillIndex = 0;
  return MAP_SHAPES.map((shape) => {
    const db = byIso.get(shape.iso);
    const hasData = (db?.recipe_count ?? 0) > 0;
    const fill = hasData
      ? (FILLS[fillIndex++ % FILLS.length] ?? FILLS[0] ?? '#f2b134')
      : 'url(#hatch)';
    const info = {
      ...shape,
      id: db?.id ?? null,
      name: db?.name ?? shape.n,
      emoji: db?.emoji ?? shape.f,
      tagline: db?.tagline ?? '',
      recipe_count: db?.recipe_count ?? 0,
      dbId: db?.id ?? null,
    };
    const fallbackPath = shape.p.join('');
    return { info, path: geo?.byIso[shape.iso] ?? fallbackPath, fill };
  });
}
