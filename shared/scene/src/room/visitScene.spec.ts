import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRng } from '@pockai/mind';
import { parseHostMessage } from '../protocol';
import { VISIT_SCENES, clipsUsed, entranceCell, freeNeighbor, isVisitScene, roamCell, scriptFor } from './visitScene';

const GRID = { gridWidth: 8, gridHeight: 6 };
const blockedOf = (...cells: string[]) => new Set(cells);

describe('guion de las escenas de visita', () => {
  it('cubre las mismas escenas que resuelve el servidor', () => {
    const balance = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../game-data/balance.json'), 'utf8'));
    expect([...VISIT_SCENES].sort()).toEqual(Object.keys(balance.personality.social.scenes).sort());
  });

  it('cada escena tiene tiempos, y en cada tiempo los dos actores saben qué hacer', () => {
    for (const type of VISIT_SCENES) {
      const beats = scriptFor(type);
      expect(beats.length, type).toBeGreaterThan(0);
      for (const b of beats) {
        expect(b.holdMs, type).toBeGreaterThan(0);
        expect(['stay', 'meet', 'roam', 'follow']).toContain(b.host.move);
        expect(['stay', 'meet', 'roam', 'follow']).toContain(b.guest.move);
        // «Ir junto al otro» necesita que el otro se quede quieto; «seguir», que el otro se vaya
        if (b.guest.move === 'meet') expect(b.host.move, type).toBe('stay');
        if (b.host.move === 'meet') expect(b.guest.move, type).toBe('stay');
        if (b.guest.move === 'follow') expect(b.host.move, type).toBe('roam');
        if (b.host.move === 'follow') expect(b.guest.move, type).toBe('roam');
      }
    }
  });

  it('solo usa clips que existen en las hojas de animación', () => {
    const anim = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../assets/species/axolunar/anim.json'), 'utf8'));
    const known = new Set<string>(anim.meta.frameTags.map((t: { name: string }) => t.name));
    for (const clip of clipsUsed()) expect(known.has(clip), clip).toBe(true);
  });

  it('una escena desconocida no rompe: no tiene tiempos', () => {
    expect(scriptFor('baile_sincronizado')).toEqual([]);
    expect(isVisitScene('greet')).toBe(true);
    expect(isVisitScene(7)).toBe(false);
  });
});

describe('dónde se coloca cada uno', () => {
  it('junto al otro: a su lado en pantalla, por el costado desde el que se acerca', () => {
    // En la rejilla isométrica, (x+1, y-1) y (x-1, y+1) quedan a la misma altura en pantalla
    expect(freeNeighbor({ x: 4, y: 3 }, blockedOf(), GRID, { x: 7, y: 1 })).toEqual({ x: 5, y: 2 });
    expect(freeNeighbor({ x: 4, y: 3 }, blockedOf(), GRID, { x: 0, y: 5 })).toEqual({ x: 3, y: 4 });
  });

  it('si un costado está ocupado usa el otro; sin costados, una celda contigua', () => {
    expect(freeNeighbor({ x: 4, y: 3 }, blockedOf('5,2'), GRID, { x: 7, y: 1 })).toEqual({ x: 3, y: 4 });
    expect(freeNeighbor({ x: 4, y: 3 }, blockedOf('5,2', '3,4'), GRID, { x: 7, y: 3 })).toEqual({ x: 5, y: 3 });
  });

  it('evita muebles y los bordes de la sala', () => {
    // En la esquina (0,0) no hay costados dentro de la sala: queda la contigua libre
    expect(freeNeighbor({ x: 0, y: 0 }, blockedOf('1,0'), GRID, { x: 5, y: 0 })).toEqual({ x: 0, y: 1 });
  });

  it('justo delante o detrás solo como último recurso; rodeada del todo, ninguna', () => {
    const noSideNoCross = blockedOf('5,2', '3,4', '5,3', '3,3', '4,4', '4,2');
    expect(freeNeighbor({ x: 4, y: 3 }, noSideNoCross, GRID, { x: 7, y: 5 })).toEqual({ x: 5, y: 4 });
    const all = blockedOf('5,2', '3,4', '5,3', '3,3', '4,4', '4,2', '5,4', '3,2');
    expect(freeNeighbor({ x: 4, y: 3 }, all, GRID, { x: 7, y: 5 })).toBeNull();
  });

  it('pasear: una celda libre, dentro de la sala y algo alejada', () => {
    const rng = createRng(11);
    const blocked = blockedOf('2,2', '3,3');
    for (let i = 0; i < 100; i++) {
      const c = roamCell({ x: 4, y: 3 }, blocked, GRID, rng)!;
      expect(c).not.toBeNull();
      expect(blocked.has(`${c.x},${c.y}`)).toBe(false);
      expect(c.x >= 0 && c.x < 8 && c.y >= 0 && c.y < 6).toBe(true);
      expect(c.x !== 4 || c.y !== 3).toBe(true);
    }
  });

  it('en una sala sin sitio no encuentra dónde pasear', () => {
    const tiny = { gridWidth: 1, gridHeight: 1 };
    expect(roamCell({ x: 0, y: 0 }, blockedOf(), tiny, createRng(1))).toBeNull();
  });

  it('el visitante entra por la celda libre más cercana a la esquina delantera', () => {
    expect(entranceCell(blockedOf(), GRID)).toEqual({ x: 7, y: 5 });
    expect(entranceCell(blockedOf('7,5', '6,5'), GRID)).toEqual({ x: 7, y: 4 });
  });
});

describe('mensajes del anfitrión para la visita', () => {
  const pet = { species: 'ignisaur', stage: 'adult', palette: { primary: '#112233', secondary: '#445566' }, visualSeed: 7 };

  it('setGuest lleva el aspecto del visitante, validado como el de la mascota', () => {
    const msg = parseHostMessage({ type: 'setGuest', pet: { ...pet, shiny: true, accessories: { head: 'x' } } });
    expect(msg).toMatchObject({ type: 'setGuest', pet: { species: 'ignisaur', stage: 'adult', shiny: true, visualSeed: 7 } });
  });

  it('setGuest con null retira al visitante; un aspecto incompleto se rechaza', () => {
    expect(parseHostMessage({ type: 'setGuest', pet: null })).toEqual({ type: 'setGuest', pet: null });
    expect(parseHostMessage({ type: 'setGuest', pet: { species: 'x' } })).toBeNull();
  });

  it('playScene solo admite identificadores cortos', () => {
    expect(parseHostMessage({ type: 'playScene', scene: 'play_tag' })).toEqual({ type: 'playScene', scene: 'play_tag' });
    expect(parseHostMessage({ type: 'playScene', scene: '<script>' })).toBeNull();
    expect(parseHostMessage({ type: 'playScene' })).toBeNull();
  });
});
