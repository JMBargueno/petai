import { findUserIdByHandle, handleInvalidReason, handleSchema, isHandleValid, isUniqueViolationOn, normalizeHandle } from './user-handle';

describe('user-handle (nickname público)', () => {
  it('normaliza: recorta, quita la @ inicial y pasa a minúsculas', () => {
    expect(normalizeHandle('  @JMBargueno ')).toBe('jmbargueno');
    expect(normalizeHandle('dada')).toBe('dada');
    expect(normalizeHandle(42)).toBe('');
  });

  it.each(['abc', 'jmbargueno', 'dada_99', 'el.nombre', 'a'.repeat(20), 'x_1.y'])('acepta %s', (h) => {
    expect(isHandleValid(h)).toBe(true);
  });

  it.each([
    ['ab', 'al menos 3'],
    ['a'.repeat(21), 'superar los 20'],
    ['1abc', 'empezar por una letra'],
    ['_abc', 'empezar por una letra'],
    ['ab-c', 'solo puede tener'],
    ['abç', 'solo puede tener'],
    ['ab c', 'solo puede tener'],
    ['ab..c', 'dos puntos seguidos'],
    ['abc.', 'terminar en punto'],
    ['admin', 'reservado'],
    ['pockai', 'reservado'],
  ])('rechaza %s', (h, motivo) => {
    expect(handleInvalidReason(h)).toContain(motivo);
  });

  it('el esquema zod normaliza antes de validar (no distingue mayúsculas)', () => {
    expect(handleSchema.parse('@Dada')).toBe('dada');
    expect(handleSchema.safeParse('@ADMIN').success).toBe(false);
    expect(handleSchema.safeParse(undefined).error?.issues[0].message).toBe('handle es obligatorio');
  });

  it('isUniqueViolationOn reconoce el target como array o como nombre de índice', () => {
    expect(isUniqueViolationOn({ code: 'P2002', meta: { target: ['handle'] } }, 'handle')).toBe(true);
    expect(isUniqueViolationOn({ code: 'P2002', meta: { target: 'User_handle_key' } }, 'handle')).toBe(true);
    expect(isUniqueViolationOn({ code: 'P2002', meta: { target: ['email'] } }, 'handle')).toBe(false);
    expect(isUniqueViolationOn({ code: 'P2025' }, 'handle')).toBe(false);
    expect(isUniqueViolationOn(null, 'handle')).toBe(false);
  });

  it('findUserIdByHandle busca normalizado y no consulta si el formato no es válido', async () => {
    const prisma = { user: { findUnique: jest.fn(async () => ({ id: 'u1' })) } };
    await expect(findUserIdByHandle(prisma, '@Dada')).resolves.toBe('u1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { handle: 'dada' }, select: { id: true } });
    prisma.user.findUnique.mockClear();
    await expect(findUserIdByHandle(prisma, 'no válido')).resolves.toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
