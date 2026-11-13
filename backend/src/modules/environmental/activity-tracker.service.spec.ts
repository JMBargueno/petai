import { ActivityTrackerService } from './activity-tracker.service';
import { RedisService } from '../../redis/redis.service';
import { GameDataService } from '../game-data/game-data.service';

describe('ActivityTrackerService (umbral de inactivity)', () => {
  let service: ActivityTrackerService;
  let memory: Map<string, string>;

  const thresholdHours = 2;

  beforeEach(() => {
    memory = new Map();
    const fakeClient = {
      get: jest.fn(async (k: string) => memory.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => {
        memory.set(k, v);
        return 'OK';
      }),
    };
    const mockRedis = {
      key: (name: string) => name,
      run: jest.fn(async (fn: (r: any) => Promise<any>) => fn(fakeClient)),
    } as unknown as RedisService;
    const mockGameData = {
      getBalance: jest.fn().mockReturnValue({ environmental: { inactivityThresholdHours: thresholdHours } }),
    } as unknown as GameDataService;

    service = new ActivityTrackerService(mockRedis, mockGameData);
  });

  it('sin heartbeat → active (sin evidencia de inactividad)', async () => {
    const status = await service.getStatus('u1');
    expect(status).toEqual({ active: true, mode: 'active', lastActiveAt: null });
  });

  it('heartbeat reciente → active', async () => {
    await service.recordHeartbeat('u1', { active: true, cpuUsage: 42.5 });
    const status = await service.getStatus('u1');
    expect(status.mode).toBe('active');
    expect(status.active).toBe(true);
    expect(status.lastActiveAt).toEqual(expect.any(String));
    // cpuUsage se guarda si es válido
    const stored = JSON.parse(memory.get('activity:u1')!);
    expect(stored.cpuUsage).toBe(42.5);
  });

  it('tras omitir heartbeats > 2 h → solo', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    memory.set('activity:u1', JSON.stringify({ lastActiveAt: threeHoursAgo, active: true }));
    const status = await service.getStatus('u1');
    expect(status.mode).toBe('solo');
    expect(status.active).toBe(false);
  });

  it('al reenviar un heartbeat desde solo → transitionedToActive', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    memory.set('activity:u1', JSON.stringify({ lastActiveAt: threeHoursAgo, active: true }));
    const result = await service.recordHeartbeat('u1', { active: true });
    expect(result.transitionedToActive).toBe(true);
    const status = await service.getStatus('u1');
    expect(status.mode).toBe('active');
  });

  it('no transiciona si ya estaba active', async () => {
    await service.recordHeartbeat('u1', { active: true });
    const result = await service.recordHeartbeat('u1', { active: true });
    expect(result.transitionedToActive).toBe(false);
  });

  it('descarta cpuUsage inválido (negativo / NaN)', async () => {
    await service.recordHeartbeat('u1', { cpuUsage: -10 });
    const stored = JSON.parse(memory.get('activity:u1')!);
    expect(stored.cpuUsage).toBeUndefined();
    await service.recordHeartbeat('u1', { cpuUsage: Number.NaN });
    const stored2 = JSON.parse(memory.get('activity:u1')!);
    expect(stored2.cpuUsage).toBeUndefined();
  });
});
