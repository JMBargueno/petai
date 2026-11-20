import { expect, test, type Page } from '@playwright/test';

/**
 * El mismo componente, pintado como en cada sistema y con cada tema. Se mide lo calculado por el
 * navegador (tamaños, radios, colores), que es igual en Windows y en Linux, y se adjunta una captura.
 */
const PLATFORMS = ['desktop', 'android', 'ios'] as const;
const THEMES = ['classic', 'cozy'] as const;
const SCHEMES = ['light', 'dark'] as const;

/** `--bg` de cada tema y esquema (tokens.css y themes/cozy.css). */
const BG: Record<(typeof THEMES)[number], Record<(typeof SCHEMES)[number], string>> = {
  classic: { light: 'rgb(251, 250, 255)', dark: 'rgb(13, 12, 25)' },
  cozy: { light: 'rgb(251, 244, 232)', dark: 'rgb(26, 20, 16)' },
};

async function open(page: Page, platform: string, theme: string, scheme: string) {
  await page.addInitScript(
    // Solo la primera vez: al recargar vale lo que el jugador haya elegido en el selector.
    ([t, s]) => {
      if (sessionStorage.getItem('seeded')) return;
      localStorage.setItem('pockai_appearance', JSON.stringify({ v: 1, theme: t, scheme: s }));
      sessionStorage.setItem('seeded', '1');
    },
    [theme, scheme],
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?gallery&platform=${platform}`);
  await expect(page.locator('.ui-gallery')).toBeVisible();
}

const box = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: r.width, h: r.height, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, border: cs.borderTopWidth };
  });

for (const platform of PLATFORMS) {
  for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
      test(`${platform} · ${theme} · ${scheme}`, async ({ page }, info) => {
        await open(page, platform, theme, scheme);

        const html = page.locator('html');
        await expect(html).toHaveAttribute('data-platform', platform);
        await expect(html).toHaveAttribute('data-theme', theme);
        await expect(html).toHaveAttribute('data-scheme', scheme);
        expect(await page.locator('.ui-gallery').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(BG[theme][scheme]);

        const track = await box(page, '.ui-switch__track');
        const button = await box(page, '.btn');
        const card = await box(page, '.ui-card');
        if (platform === 'android') {
          expect([track.w, track.h]).toEqual([52, 32]);
          expect(button.h).toBeGreaterThanOrEqual(48);
          expect(card.radius).toBe('12px');
          // Material 3: el segmento elegido lleva un check en lugar de su icono.
          await expect(page.locator('.ui-seg [aria-selected="true"] .lucide-check').first()).toBeVisible();
        } else if (platform === 'ios') {
          expect([track.w, track.h]).toEqual([51, 31]);
          expect(button.h).toBeGreaterThanOrEqual(44);
          expect(card.radius).toBe('12px');
          expect(card.border).toBe('0px');
        } else {
          expect([track.w, track.h]).toEqual([38, 22]); // 36×20 más el contorno
          expect(await page.locator('.ui-seg [aria-selected="true"] .lucide-check').count()).toBe(0);
          expect(card.radius).toBe('20px');
          expect(card.border).not.toBe('0px');
        }

        await info.attach('kit', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      });
    }
  }

  test(`${platform} · modal y confirmación`, async ({ page }, info) => {
    await open(page, platform, 'classic', 'light');
    await page.getByRole('button', { name: 'Abrir hoja' }).click();
    const modal = page.locator('.ui-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveClass(platform === 'desktop' ? /ui-modal--dialog/ : /ui-modal--sheet/);
    if (platform !== 'desktop') {
      // Hoja inferior: pegada abajo y a todo lo ancho.
      const r = await modal.evaluate((el) => el.getBoundingClientRect().toJSON());
      expect(Math.round(r.bottom)).toBe(812);
      expect(Math.round(r.width)).toBe(375);
    }
    await info.attach('hoja', { body: await page.screenshot(), contentType: 'image/png' });
    await page.getByRole('button', { name: 'Vale' }).click();

    await page.getByRole('button', { name: 'Confirmar' }).click();
    const dialog = page.locator('.ui-modal--dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', platform === 'ios' ? 'alertdialog' : 'dialog');
    await info.attach('confirmación', { body: await page.screenshot(), contentType: 'image/png' });
  });
}

test('cambiar de tema en el selector se aplica y se guarda', async ({ page }) => {
  await open(page, 'android', 'classic', 'light');
  await page.getByRole('radio', { name: /Cozy/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cozy');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cozy');
});
