import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/v1-geo.json';
import {
  buildGeoLayers,
  decodeTopo,
  labelPoint,
  merc,
  pip2,
  renderCountries,
  ringArea2,
  ringCentroid2,
  type TopoJSON,
} from './geo';

const rings: Record<string, Array<[number, number]>> = {
  square: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
  offCenter: [
    [2, 1],
    [8, 3],
    [7, 9],
    [1, 6],
  ],
  concave: [
    [0, 0],
    [6, 0],
    [6, 6],
    [3, 2],
    [0, 6],
  ],
  degenerate: [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  worldRing: [
    [-70, 10],
    [-60, 10],
    [-60, 0],
    [-70, 0],
  ],
};

const topo: TopoJSON = {
  transform: { scale: [0.5, 0.25], translate: [-10, 5] },
  arcs: [
    [
      [0, 0],
      [10, 0],
      [0, 10],
      [-10, 0],
      [0, -10],
    ],
    [
      [20, 0],
      [10, 0],
      [0, 10],
      [-10, 0],
      [0, -10],
    ],
  ],
  objects: {
    countries: {
      geometries: [
        { type: 'Polygon', id: '484', arcs: [[0]] },
        { type: 'MultiPolygon', id: '76', arcs: [[[0]], [[1]]] },
      ],
    },
  },
};

describe('algoritmos del mapa (paridad v1)', () => {
  it('merc proyecta los mismos puntos que el v1', () => {
    for (const { input, output } of fixture.merc) {
      const projected = merc(Number(input[0]), Number(input[1]));
      expect(projected[0]).toBeCloseTo(output[0] ?? 0, 12);
      expect(projected[1]).toBeCloseTo(output[1] ?? 0, 12);
    }
    expect(merc(0, 90)[1]).toBeCloseTo(merc(0, 85)[1], 12);
  });

  it('área, centroide, point-in-polygon y punto de etiqueta coinciden', () => {
    for (const [name, ring] of Object.entries(rings)) {
      const expected = fixture.rings[name as keyof typeof fixture.rings];
      expect(ringArea2(ring)).toBeCloseTo(expected.area, 12);
      const centroid = ringCentroid2(ring);
      if (expected.centroid === null) expect(centroid).toBeNull();
      else {
        expect(centroid).not.toBeNull();
        expect(centroid?.[0]).toBeCloseTo(expected.centroid[0] ?? 0, 12);
        expect(centroid?.[1]).toBeCloseTo(expected.centroid[1] ?? 0, 12);
      }
      expect(pip2([5, 5], ring)).toBe(expected.pipInside);
      expect(pip2([20, 20], ring)).toBe(expected.pipOutside);
      const label = labelPoint(ring);
      expect(label[0]).toBeCloseTo(expected.labelPoint[0] ?? 0, 12);
      expect(label[1]).toBeCloseTo(expected.labelPoint[1] ?? 0, 12);
    }
  });

  it('decodifica TopoJSON con arcos negativos y multipolígonos', () => {
    expect(decodeTopo(topo)).toEqual(fixture.topo);
  });

  it('buildGeoLayers produce paths para los países con geometría', () => {
    const scaled: TopoJSON = {
      transform: { scale: [1, 1], translate: [0, 0] },
      arcs: [
        [
          [-70, 10],
          [10, 0],
          [0, -10],
          [-10, 0],
        ],
        [
          [-45, 10],
          [10, 0],
          [0, -10],
          [-10, 0],
        ],
      ],
      objects: {
        countries: {
          geometries: [
            { type: 'Polygon', id: '484', arcs: [[0]] },
            { type: 'Polygon', id: '76', arcs: [[1]] },
          ],
        },
      },
    };
    const layers = buildGeoLayers(scaled);
    expect(layers).not.toBeNull();
    expect(layers?.byIso[484]).toMatch(/^M/);
    expect(layers?.byIso[76]).toMatch(/^M/);
    expect(layers?.labelPts[484]).toBeDefined();
  });

  it('sin países de Latinoamérica no inventa capas', () => {
    const layers = buildGeoLayers({
      transform: { scale: [1, 1], translate: [0, 0] },
      arcs: [
        [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
      ],
      objects: { countries: { geometries: [{ type: 'Polygon', id: '999', arcs: [[0]] }] } },
    });
    expect(layers).toBeNull();
  });

  it('renderiza las 22 siluetas y usa datos de la API', () => {
    const rendered = renderCountries(
      [
        {
          id: 1,
          iso_code: 484,
          name: 'México',
          emoji: '🇲🇽',
          tagline: 'Cocina mestiza',
          recipe_count: 3,
        },
      ],
      null,
    );
    expect(rendered).toHaveLength(22);
    expect(rendered[0]?.info.name).toBe('México');
    expect(rendered[0]?.info.recipe_count).toBe(3);
    expect(rendered[0]?.fill).toBe('#f2b134');
    expect(rendered[1]?.fill).toBe('url(#hatch)');
  });
});
