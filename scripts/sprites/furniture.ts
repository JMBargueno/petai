/**
 * Muebles del hábitat en SVG isométrico procedural (GUIA_ARTISTICA §7.4).
 *
 * Proyección dimétrica 2:1: una celda es un rombo de 32×16 px. Un punto de la rejilla
 * `(gx, gy, gz)` (gz = altura en px) se proyecta a `((gx − gy)·16, (gx + gy)·8 − gz)`. El origen
 * `(0, 0)` es el vértice superior de la huella: ahí se ancla el mueble en la sala.
 *
 * Cada mueble se dibuja en dos orientaciones:
 *  - `a` (rotación 0): eje largo a lo largo de x (hacia abajo-derecha).
 *  - `b` (rotación 1): eje largo a lo largo de y (hacia abajo-izquierda).
 * Las rotaciones 2 y 3 son el espejo horizontal de `b` y `a` respecto al ancla.
 *
 * Luz desde arriba a la izquierda: cara superior +12 %, cara izquierda (+y) = base, cara derecha
 * (+x) −18 %. Contorno exterior #1A1A1A de 2 px; aristas interiores de 1,2 px al 60 %.
 */

export type Orientation = 'a' | 'b';

export const TILE_W = 32;
export const TILE_H = 16;
const LINE = '#1A1A1A';

// ───────────────────────── Color ─────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Aclara (k > 0) u oscurece (k < 0) en espacio RGB hacia blanco/negro. */
export function shade(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// ───────────────────────── Geometría ─────────────────────────

type Pt = [number, number];

/**
 * Lápiz de una orientación: las coordenadas del mueble se escriben en ejes propios
 * `(u, v)` = (a lo largo, a lo ancho). En `a`, u = x y v = y; en `b`, u = y y v = x.
 */
export class Pen {
  out = '';
  private n = 0;
  /** `prefix` hace únicos los ids de degradado (varios SVG pueden convivir en una página). */
  constructor(
    readonly o: Orientation,
    private readonly prefix = 'f',
  ) {}

  private uid(): string {
    return `${this.prefix}${this.o}${this.n++}`;
  }

  /** Proyección de un punto (u, v, altura) del mueble. */
  p(u: number, v: number, z = 0): Pt {
    const [gx, gy] = this.o === 'a' ? [u, v] : [v, u];
    return [(gx - gy) * (TILE_W / 2), (gx + gy) * (TILE_H / 2) - z];
  }

  private poly(pts: Pt[], fill: string, stroke = `stroke="${LINE}" stroke-opacity="0.6" stroke-width="1.2"`): void {
    this.out += `<path d="M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z" fill="${fill}" ${stroke} stroke-linejoin="round"/>`;
  }

  /**
   * Caja de [u0,u1]×[v0,v1]×[z0,z1] en coordenadas del mueble. Dibuja las tres caras visibles
   * (arriba, +x y +y en la rejilla) y el contorno exterior.
   */
  box(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, color: string, outline = true): void {
    // Pasamos a rejilla para saber qué caras se ven (+x a la derecha, +y a la izquierda).
    const g = (u: number, v: number): Pt => (this.o === 'a' ? [u, v] : [v, u]);
    const [ax, ay] = g(u0, v0);
    const [bx, by] = g(u1, v1);
    const [x0, x1] = [Math.min(ax, bx), Math.max(ax, bx)];
    const [y0, y1] = [Math.min(ay, by), Math.max(ay, by)];
    const P = (x: number, y: number, z: number): Pt => [(x - y) * (TILE_W / 2), (x + y) * (TILE_H / 2) - z];
    this.poly([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], color); // izquierda (+y)
    this.poly([P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], shade(color, -0.18)); // derecha (+x)
    this.poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], shade(color, 0.12)); // arriba
    if (outline) {
      this.poly(
        [P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), P(x0, y1, z1)],
        'none',
        `stroke="${LINE}" stroke-width="2"`,
      );
    }
  }

  /** Cilindro vertical de radio r (en celdas) centrado en (u, v). */
  cyl(u: number, v: number, r: number, z0: number, z1: number, color: string, top?: string): void {
    const [cx, cyTop] = this.p(u, v, z1);
    const [, cyBot] = this.p(u, v, z0);
    const rx = r * (TILE_W / 2) * Math.SQRT2;
    const ry = r * (TILE_H / 2) * Math.SQRT2;
    const id = this.uid();
    this.out +=
      `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0.45" stop-color="${color}"/><stop offset="0.55" stop-color="${shade(color, -0.18)}"/></linearGradient></defs>` +
      `<path d="M${cx - rx} ${cyTop}L${cx - rx} ${cyBot}A${rx} ${ry} 0 0 0 ${cx + rx} ${cyBot}L${cx + rx} ${cyTop}Z" fill="url(#${id})" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>` +
      `<ellipse cx="${cx}" cy="${cyTop}" rx="${rx}" ry="${ry}" fill="${top ?? shade(color, 0.12)}" stroke="${LINE}" stroke-width="2"/>`;
  }

  /** Elipse plana sobre el suelo o una superficie (agua, alfombra, sombra). */
  flat(u: number, v: number, z: number, r: number, fill: string, stroke = true, opacity = 1): void {
    const [cx, cy] = this.p(u, v, z);
    const rx = r * (TILE_W / 2) * Math.SQRT2;
    const ry = r * (TILE_H / 2) * Math.SQRT2;
    this.out += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}${stroke ? ` stroke="${LINE}" stroke-width="2"` : ''}/>`;
  }

  /** Esfera (círculo con brillo) apoyada en (u, v) a altura z. */
  ball(u: number, v: number, z: number, r: number, color: string): void {
    const [cx, cy] = this.p(u, v, z);
    this.out +=
      `<circle cx="${cx}" cy="${cy - r}" r="${r}" fill="${color}" stroke="${LINE}" stroke-width="2"/>` +
      `<circle cx="${cx - r * 0.35}" cy="${cy - r * 1.35}" r="${r * 0.3}" fill="#ffffff" fill-opacity="0.7"/>`;
  }

  /** Forma libre en píxeles relativa a la proyección de (u, v, z). */
  raw(u: number, v: number, z: number, svg: (x: number, y: number) => string): void {
    const [x, y] = this.p(u, v, z);
    this.out += svg(x, y);
  }

  /** Sombra de contacto: el rombo de la huella. */
  footprintShadow(w: number, d: number): void {
    this.poly([this.p(0, 0), this.p(w, 0), this.p(w, d), this.p(0, d)], '#000000', 'fill-opacity="0.15" stroke="none"');
  }
}

// ───────────────────────── Catálogo ─────────────────────────

export interface FurnitureArt {
  id: string;
  /** Huella [a lo largo, a lo ancho] con rotación 0 (debe coincidir con habitats.json). */
  footprint: [number, number];
  /** Altura aproximada para el margen superior del lienzo. */
  height: number;
  /** Mueble de pared: se dibuja elevado contra la pared y sin sombra de suelo. */
  wall?: boolean;
  draw: (pen: Pen) => void;
}

const WOOD = '#b9783f';
const WOOD_DARK = '#8a5a2b';
const STONE = '#b8c0cc';
const WATER = '#4da2ff';
const LEAF = '#55db9c';
const LEAF_DARK = '#2f9a5e';
const GOLD = '#ffd731';

const FURNITURE: FurnitureArt[] = [
  {
    id: 'fountain_water',
    footprint: [1, 1],
    height: 44,
    draw(p) {
      p.footprintShadow(1, 1);
      p.cyl(0.5, 0.5, 0.42, 0, 12, STONE, shade(STONE, 0.1));
      p.flat(0.5, 0.5, 12, 0.32, WATER, false);
      p.cyl(0.5, 0.5, 0.08, 12, 30, STONE);
      p.flat(0.5, 0.5, 30, 0.16, WATER);
      // Chorros
      p.raw(0.5, 0.5, 30, (x, y) =>
        `<path d="M${x} ${y - 2}Q${x - 9} ${y - 10} ${x - 12} ${y + 12}M${x} ${y - 2}Q${x + 9} ${y - 10} ${x + 12} ${y + 12}" fill="none" stroke="#bfe3ff" stroke-width="2.2" stroke-linecap="round"/>`,
      );
    },
  },
  {
    id: 'soft_bed',
    footprint: [2, 1],
    height: 34,
    draw(p) {
      p.footprintShadow(2, 1);
      // Cabecero al fondo (u = 0, arriba-izquierda); los pies miran al frente (+u).
      p.box(0, 0.06, 0.14, 0.94, 0, 26, WOOD_DARK);
      p.box(0.14, 0.08, 1.94, 0.92, 0, 7, WOOD);
      p.box(0.18, 0.12, 1.88, 0.88, 7, 13, '#f2eefc');
      p.box(0.24, 0.2, 0.62, 0.8, 13, 18, '#ffffff'); // almohada
      p.box(0.72, 0.12, 1.88, 0.88, 13, 15, '#b3a8ff'); // manta
    },
  },
  {
    id: 'toy_ball',
    footprint: [1, 1],
    height: 26,
    draw(p) {
      p.flat(0.5, 0.5, 0, 0.3, '#000000', false, 0.15);
      p.ball(0.5, 0.5, 0, 9, '#fb4903');
      p.raw(0.5, 0.5, 0, (x, y) => `<path d="M${x - 8} ${y - 9}Q${x} ${y - 4} ${x + 8} ${y - 9}" fill="none" stroke="#ffffff" stroke-width="2.4"/>`);
    },
  },
  {
    id: 'wall_shelf',
    footprint: [2, 1],
    height: 70,
    wall: true,
    draw(p) {
      // Balda pegada a la pared (v = 0), elevada.
      p.box(0.08, 0, 1.92, 0.3, 36, 40, WOOD);
      const books = ['#4da2ff', '#fb4903', '#55db9c', '#5c4ade', '#ffd731'];
      books.forEach((c, k) => p.box(0.2 + k * 0.28, 0.04, 0.38 + k * 0.28, 0.26, 40, 40 + 10 + (k % 2) * 3, c));
      p.box(0.15, 0, 0.25, 0.25, 30, 36, WOOD_DARK); // escuadras
      p.box(1.75, 0, 1.85, 0.25, 30, 36, WOOD_DARK);
    },
  },
  {
    id: 'flower_pot',
    footprint: [1, 1],
    height: 44,
    draw(p) {
      p.flat(0.5, 0.5, 0, 0.36, '#000000', false, 0.15);
      p.cyl(0.5, 0.5, 0.26, 0, 14, '#d9734a');
      p.flat(0.5, 0.5, 14, 0.2, '#6b4429', false);
      p.raw(0.5, 0.5, 14, (x, y) =>
        [-9, 0, 9]
          .map((dx, k) => `<ellipse cx="${x + dx}" cy="${y - 10 - (k === 1 ? 6 : 0)}" rx="5" ry="10" transform="rotate(${dx * 2} ${x + dx} ${y - 6})" fill="${LEAF}" stroke="${LINE}" stroke-width="1.6"/>`)
          .join('') +
          [-7, 6, 0]
            .map((dx, k) => `<circle cx="${x + dx}" cy="${y - 20 - k * 4}" r="4" fill="#ff6f91" stroke="${LINE}" stroke-width="1.4"/><circle cx="${x + dx}" cy="${y - 20 - k * 4}" r="1.5" fill="${GOLD}"/>`)
            .join(''),
      );
    },
  },
  {
    id: 'garden_bench',
    footprint: [2, 1],
    height: 36,
    draw(p) {
      p.footprintShadow(2, 1);
      p.box(0.2, 0.3, 0.32, 0.7, 0, 10, WOOD_DARK);
      p.box(1.68, 0.3, 1.8, 0.7, 0, 10, WOOD_DARK);
      p.box(0.1, 0.2, 1.9, 0.8, 10, 14, WOOD);
      p.box(0.1, 0.12, 1.9, 0.24, 14, 30, WOOD); // respaldo (al fondo, v pequeño)
    },
  },
  {
    id: 'garden_pond',
    footprint: [2, 2],
    height: 22,
    draw(p) {
      p.box(0.05, 0.05, 1.95, 1.95, 0, 6, STONE);
      p.box(0.25, 0.25, 1.75, 1.75, 5, 6.5, WATER, false);
      p.flat(0.75, 1.2, 7, 0.2, '#2fae6a'); // nenúfar
      p.raw(1.3, 0.8, 7, (x, y) => `<path d="M${x - 6} ${y}Q${x} ${y - 4} ${x + 6} ${y}Q${x} ${y + 4} ${x - 6} ${y}ZM${x + 6} ${y}L${x + 10} ${y - 3}L${x + 10} ${y + 3}Z" fill="#fb8b3c" stroke="${LINE}" stroke-width="1.4"/>`);
    },
  },
  {
    id: 'shrine_altar',
    footprint: [2, 2],
    height: 60,
    draw(p) {
      p.footprintShadow(2, 2);
      p.box(0.1, 0.1, 1.9, 1.9, 0, 6, STONE);
      p.box(0.35, 0.35, 1.65, 1.65, 6, 12, shade(STONE, -0.05));
      p.box(0.7, 0.7, 1.3, 1.3, 12, 30, '#e9ccff');
      p.ball(1, 1, 30, 8, '#b3a8ff');
      p.raw(1, 1, 46, (x, y) => `<circle cx="${x}" cy="${y}" r="16" fill="#e9ccff" fill-opacity="0.35"/>`);
    },
  },
  {
    id: 'crystal_lamp',
    footprint: [1, 1],
    height: 54,
    draw(p) {
      p.flat(0.5, 0.5, 0, 0.32, '#000000', false, 0.15);
      p.cyl(0.5, 0.5, 0.18, 0, 6, '#5c4ade');
      p.cyl(0.5, 0.5, 0.05, 6, 24, '#3d2fa8');
      p.raw(0.5, 0.5, 24, (x, y) =>
        `<circle cx="${x}" cy="${y - 10}" r="16" fill="#c8f0ff" fill-opacity="0.35"/>` +
        `<path d="M${x} ${y - 22}L${x + 7} ${y - 10}L${x} ${y + 2}L${x - 7} ${y - 10}Z" fill="#c8f0ff" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M${x} ${y - 22}L${x + 2} ${y - 10}L${x} ${y + 2}" fill="none" stroke="#7fc8ff" stroke-width="1.4"/>`,
      );
    },
  },
  {
    id: 'final_throne',
    footprint: [2, 2],
    height: 64,
    draw(p) {
      p.footprintShadow(2, 2);
      p.box(0.15, 0.15, 1.85, 1.85, 0, 6, '#5c4ade'); // tarima
      p.box(0.45, 0.4, 1.55, 1.6, 6, 18, GOLD); // asiento
      p.box(0.5, 0.45, 1.5, 1.55, 18, 21, '#fb4903'); // cojín
      p.box(0.45, 0.4, 1.55, 0.6, 18, 50, GOLD); // respaldo (al fondo)
      p.raw(1, 0.5, 50, (x, y) => `<path d="M${x - 9} ${y + 2}L${x - 6} ${y - 8}L${x} ${y - 2}L${x + 6} ${y - 8}L${x + 9} ${y + 2}Z" fill="${GOLD}" stroke="${LINE}" stroke-width="1.8" stroke-linejoin="round"/>`);
    },
  },
  {
    id: 'final_garden',
    footprint: [2, 2],
    height: 64,
    draw(p) {
      p.box(0.05, 0.05, 1.95, 1.95, 0, 4, '#6cc56a');
      p.cyl(0.7, 0.7, 0.08, 4, 22, WOOD_DARK);
      p.raw(0.7, 0.7, 22, (x, y) =>
        `<circle cx="${x}" cy="${y - 10}" r="17" fill="${LEAF}" stroke="${LINE}" stroke-width="2"/><circle cx="${x - 6}" cy="${y - 15}" r="5" fill="#ffffff" fill-opacity="0.35"/>` +
        [[-8, -4], [7, -12], [2, 2]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy - 8}" r="2.6" fill="#ff6f91"/>`).join(''),
      );
      [[1.4, 1.3], [1.6, 0.6], [0.6, 1.6]].forEach(([u, v]) =>
        p.raw(u, v, 4, (x, y) => `<circle cx="${x}" cy="${y - 3}" r="4" fill="${GOLD}" stroke="${LINE}" stroke-width="1.4"/><path d="M${x} ${y}L${x} ${y + 3}" stroke="${LEAF_DARK}" stroke-width="2"/>`),
      );
    },
  },
];

export const FURNITURE_ART = FURNITURE;

export interface RenderedFurniture {
  svg: string;
  /** Tamaño del lienzo en px. */
  width: number;
  height: number;
  /** Posición del ancla (vértice superior de la huella) dentro del lienzo. */
  anchorX: number;
  anchorY: number;
}

/** Renderiza un mueble en una orientación a SVG con su ancla. */
export function renderFurniture(art: FurnitureArt, o: Orientation): RenderedFurniture {
  const pen = new Pen(o, art.id.replace(/[^a-z]/g, ''));
  art.draw(pen);
  const [w, d] = art.footprint;
  // Rombo de la huella en esta orientación (en a: w a lo largo de x; en b: w a lo largo de y).
  const [gw, gd] = o === 'a' ? [w, d] : [d, w];
  const pad = 4;
  const left = gd * (TILE_W / 2) + pad;
  const right = gw * (TILE_W / 2) + pad;
  const top = art.height + pad + 12;
  const bottom = (gw + gd) * (TILE_H / 2) + pad;
  const width = Math.ceil(left + right);
  const height = Math.ceil(top + bottom);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-left} ${-top} ${width} ${height}">` +
    `<g stroke-linecap="round">${pen.out}</g></svg>\n`;
  return { svg, width, height, anchorX: left, anchorY: top };
}
