import { EnvironmentalService } from './environmental.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WeatherService } from './weather.service';
import { ActivityTrackerService } from './activity-tracker.service';
import { FestivalService } from './festival.service';

describe('EnvironmentalService (orquestador)', () => {
  let service: EnvironmentalService;

  const mockPrisma = { user: { findUnique: jest.fn() } };
  const mockWeather = { getWeather: jest.fn() };
  const mockActivity = { getStatus: jest.fn(), recordHeartbeat: jest.fn() };
  const mockFestival = { getActive: jest.fn(), getUpcoming: jest.fn() };
  const mockRealtime = { emitToUser: jest.fn() };

  beforeEach(() => {
    mockPrisma.user.findUnique.mockClear().mockResolvedValue({
      timezone: 'America/Mexico_City',
      latitude: 19.4,
      longitude: -99.13,
      birthday: null,
    });
    mockWeather.getWeather.mockClear().mockResolvedValue({
      condition: 'hot',
      temperature: 32,
      weatherCode: 0,
      cached: true,
      fetchedAt: '2026-01-01T00:00:00.000Z',
    });
    mockActivity.getStatus.mockClear().mockResolvedValue({ active: true, mode: 'active', lastActiveAt: 'x' });
    mockActivity.recordHeartbeat.mockClear().mockResolvedValue({ transitionedToActive: false });
    mockFestival.getActive.mockClear().mockReturnValue(null);
    mockFestival.getUpcoming.mockClear().mockResolvedValue([]);
    mockRealtime.emitToUser.mockClear();

    service = new EnvironmentalService(
      mockPrisma as unknown as PrismaService,
      mockWeather as unknown as WeatherService,
      mockActivity as unknown as ActivityTrackerService,
      mockFestival as unknown as FestivalService,
      mockRealtime as unknown as RealtimeGateway,
    );
  });

  it('compone el estado ambiental { timeOfDay, weather, activity, festival }', async () => {
    const status = await service.getStatus('u1');
    expect(status.timeOfDay).toMatch(/^(late_night|morning|afternoon|evening|night)$/);
    expect(status.weather.condition).toBe('hot');
    expect(status.activity.mode).toBe('active');
    expect(status.festival).toBeNull();
  });

  it('no emite en la primera lectura (no hay transición)', async () => {
    await service.getStatus('u1');
    expect(mockRealtime.emitToUser).not.toHaveBeenCalled();
  });

  it('emite "weather" al cambiar la condición de clima', async () => {
    await service.getStatus('u1');
    mockWeather.getWeather.mockResolvedValue({
      condition: 'rain',
      temperature: 18,
      weatherCode: 61,
      cached: false,
      fetchedAt: '2026-01-01T00:00:00.000Z',
    });
    await service.getStatus('u1');
    expect(mockRealtime.emitToUser).toHaveBeenCalledWith(
      'u1',
      'environmental:changed',
      { type: 'weather', data: expect.objectContaining({ condition: 'rain', temperature: 18 }) },
    );
  });

  it('emite "activity" al transitar a/ desde "solo"', async () => {
    await service.getStatus('u1');
    mockActivity.getStatus.mockResolvedValue({ active: false, mode: 'solo', lastActiveAt: 'x' });
    await service.getStatus('u1');
    expect(mockRealtime.emitToUser).toHaveBeenCalledWith('u1', 'environmental:changed', {
      type: 'activity',
      data: { mode: 'solo' },
    });
  });

  it('emite "activity" (retorno active) al reenviar un heartbeat desde solo', async () => {
    // Último estado recordado: solo
    await service.getStatus('u1');
    (service as any).lastEnv.set('u1', { timeOfDay: 'morning', condition: 'hot', mode: 'solo', festivalId: null });
    mockActivity.recordHeartbeat.mockResolvedValue({ transitionedToActive: true });

    await service.recordActivity('u1', { active: true });

    expect(mockRealtime.emitToUser).toHaveBeenCalledWith('u1', 'environmental:changed', {
      type: 'activity',
      data: { mode: 'active' },
    });
  });

  it('no emite activity al reenviar heartbeat si ya estaba active', async () => {
    await service.recordActivity('u1', { active: true });
    expect(mockRealtime.emitToUser).not.toHaveBeenCalled();
  });

  it('emite "festival" al iniciar una festividad', async () => {
    await service.getStatus('u1');
    mockFestival.getActive.mockReturnValue({
      id: 'navidad',
      name: 'Navidad',
      accessory: 'sombrerito',
      message: '🎄',
    });
    await service.getStatus('u1');
    expect(mockRealtime.emitToUser).toHaveBeenCalledWith('u1', 'environmental:changed', {
      type: 'festival',
      data: expect.objectContaining({ id: 'navidad' }),
    });
  });

  it('devuelve las festividades próximas vía el service de festividades', async () => {
    mockFestival.getUpcoming.mockResolvedValue([
      { id: 'navidad', name: 'Navidad', date: '2026-12-24', daysRemaining: 10 },
    ]);
    const upcoming = await service.getUpcomingFestivals('u1');
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].id).toBe('navidad');
  });
});
