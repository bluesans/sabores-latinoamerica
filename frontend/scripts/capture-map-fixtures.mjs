/* Genera fixtures de los algoritmos puros copiados del v1 (js/map.js).
   Se ejecuta una vez; el JSON resultante queda versionado y los tests
   comparan el port TS contra estos valores. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function merc(lon, lat) {
  const c = Math.max(-85, Math.min(85, lat));
  return [(lon * Math.PI) / 180, -Math.log(Math.tan(Math.PI / 4 + (c * Math.PI) / 360))];
}

function ringArea2(r) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i],
      [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

function ringCentroid2(r) {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i],
      [x2, y2] = r[(i + 1) % r.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return null;
  return [cx / (6 * a), cy / (6 * a)];
}

function pip2(p, r) {
  const [x, y] = p;
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i],
      [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function labelPoint(r) {
  const c = ringCentroid2(r);
  if (c && pip2(c, r)) return c;
  let minX = 1e9,
    minY = 1e9,
    maxX = -1e9,
    maxY = -1e9;
  r.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  const bc = [(minX + maxX) / 2, (minY + maxY) / 2];
  return pip2(bc, r) ? bc : c || bc;
}

function decodeTopo(topo) {
  const tr = topo.transform,
    sx = tr.scale[0],
    sy = tr.scale[1],
    tx = tr.translate[0],
    ty = tr.translate[1];
  const arcs = topo.arcs.map((arc) => {
    let x = 0,
      y = 0;
    return arc.map((p) => {
      x += p[0];
      y += p[1];
      return [x * sx + tx, y * sy + ty];
    });
  });
  const ring = (idxs) => {
    let pts = [];
    idxs.forEach((idx, i) => {
      let a = idx >= 0 ? arcs[idx] : arcs[~idx].slice().reverse();
      if (i > 0) a = a.slice(1);
      pts = pts.concat(a);
    });
    return pts;
  };
  return topo.objects.countries.geometries.map((g) => ({
    id: parseInt(g.id, 10),
    polys:
      g.type === 'Polygon'
        ? [g.arcs.map(ring)]
        : g.type === 'MultiPolygon'
          ? g.arcs.map((p) => p.map(ring))
          : [],
  }));
}

const rings = {
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

const topo = {
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

const mercInputs = [
  [0, 0],
  [-70, 10],
  [120, 45],
  [0, 90],
  [0, -90],
];

const fixture = {
  merc: mercInputs.map((input) => ({ input, output: merc(input[0], input[1]) })),
  rings: Object.fromEntries(
    Object.entries(rings).map(([name, ring]) => [
      name,
      {
        area: ringArea2(ring),
        centroid: ringCentroid2(ring),
        labelPoint: labelPoint(ring),
        pipInside: pip2([5, 5], ring),
        pipOutside: pip2([20, 20], ring),
      },
    ]),
  ),
  topo: decodeTopo(topo),
};

const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/map/__fixtures__/v1-geo.json',
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Fixtures escritas en ${output} (clamp ${clamp(0, 1, 2) === 0 ? 'ok' : '?'})`);
