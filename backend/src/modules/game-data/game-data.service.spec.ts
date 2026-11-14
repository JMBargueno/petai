import { GameDataService, isReloadError } from './game-data.service';

describe('GameDataService (hot-swappable)', () => {
  let service: GameDataService;

  beforeEach(() => {
    service = new GameDataService();
    service.onModuleInit();
  });

  it('carga el snapshot de disco en onModuleInit', () => {
    const snap = service.getSnapshot();
    expect(snap.balance).toBeTruthy();
    expect(Array.isArray(snap.species)).toBe(true);
    expect(snap.source).toBe('disk');
    expect(typeof snap.loadedAt).toBe('string');
  });

  it('reload válido: swap atómico y changedFields', () => {
    const balance = service.getBalance() as any;
    const newBalance = JSON.parse(JSON.stringify(balance));
    newBalance.combats.elo.k = 18;

    const result = service.reload('balance', newBalance, 'inline');
    expect(result.ok).toBe(true);
    expect((result as { changedFields: string[] }).changedFields).toContain('combats.elo.k');
    expect((service.getBalance() as any).combats.elo.k).toBe(18);
    expect(service.getSnapshot().source).toBe('inline');
  });

  it('reload inválido (schema): rechaza y conserva el snapshot anterior', () => {
    const before = JSON.parse(JSON.stringify(service.getSpecies())) as any[];
    const badSpecies = JSON.parse(JSON.stringify(before));
    badSpecies[0] = { ...badSpecies[0], element: 'plasma' }; // elemento no válido

    const result = service.reload('species', badSpecies, 'inline');
    expect(isReloadError(result)).toBe(true);
    if (isReloadError(result)) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.path.includes('element'))).toBe(true);
    }
    // snapshot anterior conservado (atomic swap no se aplica)
    expect(service.getSpecies()).toEqual(before);
  });

  it('reload con referencia cruzada rota (favoriteFood inexistente) es rechazado', () => {
    const badSpecies = JSON.parse(JSON.stringify(service.getSpecies())) as any[];
    badSpecies[0] = { ...badSpecies[0], favoriteFood: 'no_existe' };
    const result = service.reload('species', badSpecies);
    expect(isReloadError(result)).toBe(true);
    if (isReloadError(result)) {
      expect(result.errors.some((e) => e.path === '<cross-ref>')).toBe(true);
    }
    expect(service.getSpecies()).not.toEqual(badSpecies);
  });

  it('reload de archivo desconocido devuelve error', () => {
    const result = service.reload('nope' as never, {});
    expect(isReloadError(result)).toBe(true);
  });

  it('los lectores siguen devolviendo el snapshot vigente', () => {
    const catalog = service.getCatalog();
    expect(catalog.balance).toBe(service.getBalance());
    expect(catalog.skills).toBe(service.getSkills());
  });
});