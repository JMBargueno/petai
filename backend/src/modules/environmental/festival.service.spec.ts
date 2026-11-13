import { FestivalService } from './festival.service';
import { GameDataService } from '../game-data/game-data.service';
import { CalendarDay } from './festival.service';

const FESTIVALS = [
  { id: 'ano_nuevo', name: 'Año Nuevo', monthStart: 1, dayStart: 1, accessory: 'confeti', message: '🎉' },
  { id: 'halloween', name: 'Halloween', monthStart: 10, dayStart: 31, accessory: 'calabaza', message: '🎃' },
  { id: 'navidad', name: 'Navidad', monthStart: 12, dayStart: 24, monthEnd: 12, dayEnd: 26, accessory: 'sombrerito', message: '🎄' },
  { id: 'reinos', name: 'Reyes Magos', monthStart: 1, dayStart: 6, accessory: 'corona', message: '👑' },
  { id: 'verde', name: 'Semana Verde', monthStart: 3, dayStart: 21, monthEnd: 3, dayEnd: 27, region: 'es_latam', accessory: 'hojas', message: '🌿' },
];

describe('FestivalService (lookup)', () => {
  let service: FestivalService;
  const day = (y: number, m: number, d: number): CalendarDay => ({ year: y, month: m, day: d });

  beforeEach(() => {
    const mockGameData = { getFestivals: jest.fn().mockReturnValue(FESTIVALS) } as unknown as GameDataService;
    service = new FestivalService(mockGameData);
  });

  it('hoy cae en una festividad → devuelve el FestivalInfo', () => {
    const active = service.getActive(day(2026, 12, 25), null);
    expect(active).toEqual({ id: 'navidad', name: 'Navidad', accessory: 'sombrerito', message: '🎄' });
  });

  it('día fuera de cualquier festividad → null', () => {
    expect(service.getActive(day(2026, 7, 15), null)).toBeNull();
  });

  it('rango multi-día: primer y último día activos, intermedio fuera no', () => {
    expect(service.getActive(day(2026, 12, 24), null)?.id).toBe('navidad');
    expect(service.getActive(day(2026, 12, 26), null)?.id).toBe('navidad');
    expect(service.getActive(day(2026, 12, 27), null)).toBeNull();
  });

  it('respeta la región: festividad regional no aplica sin región', () => {
    expect(service.getActive(day(2026, 3, 22), null)).toBeNull();
    expect(service.getActive(day(2026, 3, 22), 'es_latam')?.id).toBe('verde');
  });

  it('rango que cruza el año (ej. Nochevieja - 1 de enero)', () => {
    const finDeAno = [
      { id: 'findeano', name: 'Fin de año', monthStart: 12, dayStart: 31, monthEnd: 1, dayEnd: 1, accessory: 'a', message: 'm' },
    ];
    const svc = new FestivalService({ getFestivals: () => finDeAno } as unknown as GameDataService);
    expect(svc.getActive(day(2026, 12, 31), null)?.id).toBe('findeano');
    expect(svc.getActive(day(2026, 1, 1), null)?.id).toBe('findeano');
    expect(svc.getActive(day(2026, 2, 1), null)).toBeNull();
  });

  describe('getUpcoming', () => {
    it('lista próximas con daysRemaining ≥ 0 y ordenadas', () => {
      const upcoming = service.getUpcoming(day(2026, 12, 15), { birthday: null });
      const navidad = upcoming.find((u) => u.id === 'navidad');
      expect(navidad?.daysRemaining).toBe(9); // 15→24 dic
      expect(navidad?.date).toBe('2026-12-24');
      // La de menor días va primero
      expect(upcoming[0].daysRemaining).toBe(Math.min(...upcoming.map((u) => u.daysRemaining)));
    });

    it('la festividad de hoy tiene daysRemaining = 0', () => {
      const upcoming = service.getUpcoming(day(2026, 12, 25), { birthday: null });
      const navidad = upcoming.find((u) => u.id === 'navidad');
      expect(navidad?.daysRemaining).toBe(0);
    });

    it('si ya pasó en el año, usa el año siguiente', () => {
      const upcoming = service.getUpcoming(day(2026, 12, 31), { birthday: null });
      const halloween = upcoming.find((u) => u.id === 'halloween');
      expect(halloween?.date).toBe('2027-10-31');
    });

    it('incluye el cumpleaños del usuario', () => {
      const upcoming = service.getUpcoming(day(2026, 12, 15), { birthday: '2090-03-02' });
      const bday = upcoming.find((u) => u.id === 'cumpleaños');
      expect(bday?.date).toBe('2027-03-02');
      expect(bday?.daysRemaining).toBeGreaterThan(0);
    });

    it('cumpleaños hoy → daysRemaining 0', () => {
      const upcoming = service.getUpcoming(day(2026, 6, 15), { birthday: '1990-06-15' });
      const bday = upcoming.find((u) => u.id === 'cumpleaños');
      expect(bday?.daysRemaining).toBe(0);
    });
  });
});
