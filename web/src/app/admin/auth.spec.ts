import { TestBed } from '@angular/core/testing';
import { Route, UrlTree, provideRouter } from '@angular/router';
import { AdminAuth, DEMO_ACCESS_CODE, adminGuard } from './auth';

describe('acceso simulado al panel', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  // El guard no usa sus argumentos: solo mira la sesión.
  const runGuard = () =>
    TestBed.runInInjectionContext(() => (adminGuard as (...args: unknown[]) => unknown)({} as Route, []));

  it('rechaza un código incorrecto', () => {
    const auth = TestBed.inject(AdminAuth);
    expect(auth.login('nope')).toBe(false);
    expect(auth.authenticated()).toBe(false);
  });

  it('acepta el código de demo y cierra sesión', () => {
    const auth = TestBed.inject(AdminAuth);
    expect(auth.login(` ${DEMO_ACCESS_CODE} `)).toBe(true);
    expect(auth.authenticated()).toBe(true);

    auth.logout();
    expect(auth.authenticated()).toBe(false);
  });

  it('el guard manda al login sin sesión y deja pasar con ella', () => {
    const redirect = runGuard();
    expect(redirect).toBeInstanceOf(UrlTree);
    expect(String(redirect)).toBe('/admin/login');

    TestBed.inject(AdminAuth).login(DEMO_ACCESS_CODE);
    expect(runGuard()).toBe(true);
  });
});
