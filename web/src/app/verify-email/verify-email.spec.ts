import { describe, expect, it } from 'vitest';
import { VERIFY_EMAIL_ENDPOINT, statusFromResponse } from './verify-email';

describe('verify-email', () => {
  it('apunta al endpoint de verificación por enlace de la API', () => {
    expect(VERIFY_EMAIL_ENDPOINT).toMatch(/\/v1\/auth\/verify-email\/link$/);
  });

  it('traduce las respuestas del backend a estados de la página', () => {
    expect(statusFromResponse(200)).toBe('verified');
    expect(statusFromResponse(400)).toBe('invalid');
    expect(statusFromResponse(429)).toBe('limited');
    expect(statusFromResponse(500)).toBe('error');
  });
});
