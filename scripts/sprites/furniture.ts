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
const NIGHT = '#3a2f7a';
const VIOLET = '#5c4ade';

type P3 = [number, number, number];

/** Polígono libre con puntos (u, v, z) del mueble: útil para caras planas sobre la pared. */
function shape(p: Pen, pts: P3[], fill: string, sw = 2): void {
  p.out += `<path d="M${pts.map(([u, v, z]) => p.p(u, v, z).map((n) => n.toFixed(2)).join(' ')).join('L')}Z" fill="${fill}" stroke="${LINE}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

/** Disco sobre el plano de la pared (v fijo): radio ru en celdas a lo largo y rz en px de alto. */
function wallDisc(p: Pen, u: number, v: number, z: number, ru: number, rz: number, fill: string, sw = 2): void {
  const pts: P3[] = [];
  for (let k = 0; k < 24; k++) {
    const t = (k / 24) * Math.PI * 2;
    pts.push([u + ru * Math.cos(t), v, z + rz * Math.sin(t)]);
  }
  shape(p, pts, fill, sw);
}

/** Línea entre dos puntos del mueble. */
function line(p: Pen, a: P3, b: P3, color = LINE, w = 2): void {
  const [x0, y0] = p.p(...a);
  const [x1, y1] = p.p(...b);
  p.out += `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
}

/** Estrella de 5 puntas en píxeles centrada en (x, y). */
function star(x: number, y: number, r: number, fill = GOLD): string {
  const pts = Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    return `${(x + rr * Math.cos(a)).toFixed(2)} ${(y + rr * Math.sin(a)).toFixed(2)}`;
  });
  return `<path d="M${pts.join('L')}Z" fill="${fill}" stroke="${LINE}" stroke-width="1.8" stroke-linejoin="round"/>`;
}

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
  {
    id: 'food_bowl',
    footprint: [1, 1],
    height: 22,
    draw(p) {
      p.flat(0.5, 0.5, 0, 0.36, '#000000', false, 0.15);
      p.cyl(0.5, 0.5, 0.36, 0, 9, '#4da2ff', '#2f6fb8');
      p.flat(0.5, 0.5, 9, 0.28, '#c98a4b', false); // pienso
      p.raw(0.5, 0.5, 9, (x, y) =>
        [[-7, 0], [-2, -3], [4, -2], [-3, 2], [3, 2], [8, 0], [0, 0]]
          .map(([dx, dy], k) => `<circle cx="${x + dx}" cy="${y + dy - 1}" r="2.2" fill="${k % 2 ? '#fb8b3c' : '#8a5a2b'}" stroke="${LINE}" stroke-width="0.8"/>`)
          .join(''),
      );
      // Pez de adorno pintado en el frente del cuenco.
      p.raw(0.5, 0.5, 4, (x, y) => `<path d="M${x - 5} ${y + 6}Q${x} ${y + 3} ${x + 4} ${y + 6}Q${x} ${y + 9} ${x - 5} ${y + 6}ZM${x + 4} ${y + 6}L${x + 7} ${y + 4}L${x + 7} ${y + 8}Z" fill="#ffffff"/>`);
    },
  },
  {
    id: 'round_rug',
    footprint: [2, 2],
    height: 6,
    draw(p) {
      p.flat(1, 1, 0, 0.92, shade('#e8604c', -0.25));
      p.flat(1, 1, 2, 0.92, '#e8604c');
      p.flat(1, 1, 2, 0.68, '#ffd8a8', false);
      p.flat(1, 1, 2, 0.46, '#e8604c', false);
      p.flat(1, 1, 2, 0.22, GOLD, false);
    },
  },
  {
    id: 'wall_clock',
    footprint: [1, 1],
    height: 70,
    wall: true,
    draw(p) {
      wallDisc(p, 0.5, 0, 46, 0.46, 13, WOOD_DARK);
      wallDisc(p, 0.5, 0.06, 46, 0.36, 10, '#fff8e8', 1.4);
      for (let k = 0; k < 4; k++) {
        const t = (k * Math.PI) / 2;
        p.raw(0.5 + 0.24 * Math.cos(t), 0.06, 46 + 7 * Math.sin(t), (x, y) => `<circle cx="${x}" cy="${y}" r="1.2" fill="${LINE}"/>`);
      }
      line(p, [0.5, 0.06, 46], [0.5, 0.06, 53], LINE, 1.8); // minutero
      line(p, [0.5, 0.06, 46], [0.66, 0.06, 46], '#fb4903', 1.8); // horario
      // Péndulo bajo la esfera.
      line(p, [0.5, 0.04, 34], [0.5, 0.04, 26], WOOD_DARK, 1.6);
      p.raw(0.5, 0.04, 25, (x, y) => `<circle cx="${x}" cy="${y}" r="3" fill="${GOLD}" stroke="${LINE}" stroke-width="1.6"/>`);
    },
  },
  {
    id: 'garden_swing',
    footprint: [2, 1],
    height: 58,
    draw(p) {
      p.footprintShadow(2, 1);
      p.box(0.12, 0.4, 0.26, 0.6, 0, 52, WOOD_DARK); // poste del fondo
      p.box(0.12, 0.42, 1.88, 0.58, 48, 54, WOOD); // travesaño
      for (const u of [0.72, 1.28]) line(p, [u, 0.5, 48], [u, 0.5, 16], '#6b4429', 1.8);
      p.box(0.62, 0.28, 1.38, 0.72, 13, 17, '#fb4903'); // asiento
      p.box(1.74, 0.4, 1.88, 0.6, 0, 52, WOOD_DARK); // poste del frente
    },
  },
  {
    id: 'stone_lantern',
    footprint: [1, 1],
    height: 52,
    draw(p) {
      p.flat(0.5, 0.5, 0, 0.34, '#000000', false, 0.15);
      p.box(0.28, 0.28, 0.72, 0.72, 0, 6, STONE);
      p.box(0.42, 0.42, 0.58, 0.58, 6, 18, STONE);
      p.box(0.26, 0.26, 0.74, 0.74, 18, 22, shade(STONE, -0.08));
      p.raw(0.5, 0.5, 30, (x, y) => `<circle cx="${x}" cy="${y}" r="15" fill="#ffd296" fill-opacity="0.35"/>`);
      p.box(0.34, 0.34, 0.66, 0.66, 22, 34, '#ffd296'); // luz
      p.box(0.18, 0.18, 0.82, 0.82, 34, 38, shade(STONE, -0.12)); // tejadillo
      p.box(0.4, 0.4, 0.6, 0.6, 38, 44, shade(STONE, -0.12));
      p.ball(0.5, 0.5, 44, 3, STONE);
    },
  },
  {
    id: 'zen_cushion',
    footprint: [1, 1],
    height: 20,
    draw(p) {
      p.footprintShadow(1, 1);
      p.box(0.06, 0.06, 0.94, 0.94, 0, 3, '#e2cfae'); // tatami
      p.cyl(0.5, 0.5, 0.38, 3, 9, '#c0392b', '#e0584a');
      p.flat(0.5, 0.5, 9, 0.24, '#c0392b', false);
      p.flat(0.5, 0.5, 9, 0.07, GOLD);
    },
  },
  {
    id: 'bonsai_tree',
    footprint: [1, 1],
    height: 48,
    draw(p) {
      p.flat(0.5, 0.5, 0, 0.34, '#000000', false, 0.15);
      p.box(0.24, 0.3, 0.76, 0.7, 0, 8, '#3d5a80'); // maceta
      p.box(0.28, 0.34, 0.72, 0.66, 8, 9, '#6b4429', false);
      p.raw(0.5, 0.5, 9, (x, y) =>
        `<path d="M${x} ${y}C${x - 6} ${y - 8} ${x + 8} ${y - 12} ${x + 2} ${y - 22}" fill="none" stroke="${LINE}" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="M${x} ${y}C${x - 6} ${y - 8} ${x + 8} ${y - 12} ${x + 2} ${y - 22}" fill="none" stroke="#8a5a2b" stroke-width="3.6" stroke-linecap="round"/>` +
        [[-9, -22, 7], [10, -26, 6], [1, -32, 8]]
          .map(([dx, dy, r]) => `<ellipse cx="${x + dx}" cy="${y + dy}" rx="${r + 3}" ry="${r}" fill="${LEAF_DARK}" stroke="${LINE}" stroke-width="2"/><ellipse cx="${x + dx - 2}" cy="${y + dy - 2}" rx="${r - 1}" ry="${r - 3}" fill="${LEAF}"/>`)
          .join(''),
      );
    },
  },
  {
    id: 'hanging_scroll',
    footprint: [1, 1],
    height: 78,
    wall: true,
    draw(p) {
      line(p, [0.25, 0.04, 62], [0.5, 0.04, 68], LINE, 1.4);
      line(p, [0.75, 0.04, 62], [0.5, 0.04, 68], LINE, 1.4);
      shape(p, [[0.14, 0.05, 60], [0.86, 0.05, 60], [0.86, 0.05, 28], [0.14, 0.05, 28]], '#f4e7d1');
      shape(p, [[0.22, 0.06, 33], [0.44, 0.06, 49], [0.56, 0.06, 41], [0.66, 0.06, 45], [0.8, 0.06, 33]], '#7e8aa0', 1.2); // montaña
      shape(p, [[0.36, 0.06, 43], [0.44, 0.06, 49], [0.5, 0.06, 45]], '#ffffff', 0.8); // nieve
      wallDisc(p, 0.66, 0.06, 53, 0.08, 3.5, '#c0392b', 1); // sol
      p.box(0.06, 0, 0.94, 0.1, 59, 62, WOOD_DARK);
      p.box(0.08, 0, 0.92, 0.1, 25, 28, WOOD_DARK);
    },
  },
  {
    id: 'star_fountain',
    footprint: [2, 2],
    height: 66,
    draw(p) {
      p.footprintShadow(2, 2);
      p.box(0.1, 0.1, 1.9, 1.9, 0, 8, VIOLET);
      p.box(0.3, 0.3, 1.7, 1.7, 7, 8.5, '#7fc8ff', false);
      [[0.6, 1.3], [1.4, 0.55], [1.45, 1.4]].forEach(([u, v]) =>
        p.raw(u, v, 9, (x, y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#ffffff"/>`),
      );
      p.cyl(1, 1, 0.12, 8, 30, '#cdb4ff');
      p.cyl(1, 1, 0.38, 30, 36, VIOLET, '#7fc8ff');
      p.raw(1, 1, 36, (x, y) =>
        `<circle cx="${x}" cy="${y - 14}" r="15" fill="#c8f0ff" fill-opacity="0.35"/>` +
        `<path d="M${x - 4} ${y - 2}Q${x - 14} ${y - 6} ${x - 18} ${y + 14}M${x + 4} ${y - 2}Q${x + 14} ${y - 6} ${x + 18} ${y + 14}" fill="none" stroke="#c8f0ff" stroke-width="2.2" stroke-linecap="round"/>` +
        star(x, y - 16, 9),
      );
    },
  },
  {
    id: 'constellation_frame',
    footprint: [2, 1],
    height: 80,
    wall: true,
    draw(p) {
      p.box(0.14, 0, 1.86, 0.08, 28, 64, GOLD);
      shape(p, [[0.24, 0.09, 32], [1.76, 0.09, 32], [1.76, 0.09, 60], [0.24, 0.09, 60]], NIGHT, 1.4);
      const stars: [number, number][] = [[0.42, 38], [0.7, 50], [1.0, 44], [1.25, 54], [1.55, 40]];
      stars.slice(1).forEach(([u, z], k) => line(p, [stars[k][0], 0.1, stars[k][1]], [u, 0.1, z], '#c8f0ff', 1.2));
      stars.forEach(([u, z], k) =>
        p.raw(u, 0.1, z, (x, y) => `<circle cx="${x}" cy="${y}" r="${k === 3 ? 2.6 : 1.8}" fill="${k === 3 ? GOLD : '#ffffff'}"/>`),
      );
    },
  },
  {
    // Reproductor MP3 (spec 42), de cualquier sala. Pasado a mano del concepto de Nano Banana:
    // reproductor de pie en una base-altavoz de madera con dos conos y auriculares en el suelo.
    id: 'mp3',
    footprint: [1, 1],
    height: 58,
    draw(p) {
      const PEARL = '#eeeaf6';
      const SPEAKER = '#4b3d8f';
      const WOOD_MP3 = '#e0a05a';
      /** Cono de altavoz en la cara +u (plano u fijo), centrado en (v, z). */
      const sideCone = (u: number, v: number, z: number, rv: number, rz: number, fill: string, sw: number) => {
        const pts: P3[] = [];
        for (let k = 0; k < 24; k++) {
          const t = (k / 24) * Math.PI * 2;
          pts.push([u, v + rv * Math.cos(t), z + rz * Math.sin(t)]);
        }
        shape(p, pts, fill, sw);
      };
      p.footprintShadow(1, 1);
      // Base-altavoz de madera con zócalo oscuro
      p.box(0.1, 0.1, 0.92, 0.92, 0, 3, WOOD_DARK);
      p.box(0.08, 0.08, 0.9, 0.9, 3, 14, WOOD_MP3);
      // Conos: uno en cada cara visible
      wallDisc(p, 0.3, 0.9, 8.5, 0.14, 4.4, SPEAKER, 1.8);
      wallDisc(p, 0.3, 0.9, 8.5, 0.05, 1.7, shade(SPEAKER, 0.4), 1.2);
      sideCone(0.9, 0.62, 8.5, 0.14, 4.4, shade(SPEAKER, -0.1), 1.8);
      sideCone(0.9, 0.62, 8.5, 0.05, 1.7, shade(SPEAKER, 0.3), 1.2);
      // Reproductor de pie, encajado al fondo de la base y de cara al frente
      p.box(0.14, 0.24, 0.86, 0.42, 14, 44, PEARL);
      // Pantalla violeta oscura con ecualizador menta
      shape(p, [[0.2, 0.42, 30], [0.8, 0.42, 30], [0.8, 0.42, 41], [0.2, 0.42, 41]], NIGHT, 1.6);
      [3, 6, 4, 7, 5].forEach((h, k) => line(p, [0.27 + k * 0.115, 0.42, 32], [0.27 + k * 0.115, 0.42, 32 + h], LEAF, 1.6));
      // Rueda de control gris con botón violeta
      wallDisc(p, 0.5, 0.42, 21.5, 0.2, 6, '#c4c4cc', 1.6);
      wallDisc(p, 0.5, 0.42, 21.5, 0.07, 2.2, '#9b86f0', 1.2);
      // Auriculares violetas apoyados en la base, delante del reproductor
      p.raw(0.8, 0.8, 14, (x, y) =>
        `<path d="M${x - 6} ${y}Q${x} ${y - 11} ${x + 6} ${y - 2}" fill="none" stroke="${LINE}" stroke-width="4.2" stroke-linecap="round"/>` +
        `<path d="M${x - 6} ${y}Q${x} ${y - 11} ${x + 6} ${y - 2}" fill="none" stroke="${VIOLET}" stroke-width="2.2" stroke-linecap="round"/>` +
        `<ellipse cx="${x - 6}" cy="${y + 0.5}" rx="3.2" ry="2.6" fill="${shade(VIOLET, 0.25)}" stroke="${LINE}" stroke-width="1.6"/>` +
        `<ellipse cx="${x + 6}" cy="${y - 1.5}" rx="3.2" ry="2.6" fill="${VIOLET}" stroke="${LINE}" stroke-width="1.6"/>`);
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
