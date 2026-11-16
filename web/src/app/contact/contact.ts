import { ChangeDetectionStrategy, Component, LOCALE_ID, inject, signal } from '@angular/core';
import { navPages } from '../shared/layout/nav-pages';
import { NavLink, SiteHeader } from '../shared/layout/site-header';
import { SiteFooter } from '../shared/layout/site-footer';
import { SeoService } from '../shared/seo/seo.service';
import { SITE_NAME, pageUrl } from '../site.config';
import site from '../site.json';

/** Buzón de contacto público (mailcow, pockai.world). */
export const CONTACT_EMAIL = 'contact@pockai.world';

/** Endpoint del formulario: `POST {apiUrl}/v1/contact`. */
export const CONTACT_ENDPOINT = `${site.apiUrl.replace(/\/$/, '')}/v1/contact`;

type Status = 'idle' | 'sending' | 'sent' | 'error' | 'limited' | 'invalid';

/** Página de contacto: formulario que llega a contact@pockai.world, más el correo directo. */
@Component({
  selector: 'app-contact',
  imports: [SiteHeader, SiteFooter],
  template: `
    <app-site-header
      [pages]="pages"
      [contactCurrent]="true"
      [cta]="cta"
      [home]="home"
      [homeLabel]="homeLabel"
      [navLabel]="navLabel"
      [locale]="locale"
      [langHrefs]="{ es: '/es/contact', en: '/en/contact' }"
    />

    <main id="main" tabindex="-1">
      <section class="band band--hero band--first">
        <div class="band__inner contact">
          <div class="contact__intro">
            <p class="eyebrow" style="--eyebrow-dot: var(--theme-social)" i18n="@@contact.eyebrow">Contacto</p>
            <h1 class="display section-title" i18n="@@contact.title">Escríbenos</h1>
            <p class="lead" i18n="@@contact.lead">
              ¿Dudas, ideas, un fallo o tu pockai hace cosas raras? Cuéntanoslo y te responderemos por correo.
            </p>
            <aside class="contact__faq">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />
              </svg>
              <p>
                <strong i18n="@@contact.faq.title">¿Antes de escribir?</strong>
                <span i18n="@@contact.faq.text">Puede que tu duda ya esté resuelta en nuestras <a class="link" [href]="faqHref">preguntas frecuentes</a>.</span>
              </p>
            </aside>
            <p class="contact__direct">
              <span i18n="@@contact.direct">También puedes escribir directamente a</span>
              <a class="link" [href]="'mailto:' + email">{{ email }}</a>
            </p>
          </div>

          @if (status() === 'sent') {
            <div class="contact__card contact__done" role="status">
              <h2 class="display" i18n="@@contact.sent.title">¡Mensaje enviado!</h2>
              <p i18n="@@contact.sent.text">Gracias por escribirnos. Te responderemos a tu correo lo antes posible.</p>
              <button type="button" class="btn" (click)="status.set('idle')" i18n="@@contact.sent.again">Enviar otro mensaje</button>
            </div>
          } @else {
            <form class="contact__card contact__form" method="post" (submit)="send($event)" [attr.aria-busy]="status() === 'sending'">
              <div class="field">
                <label for="contact-name" i18n="@@contact.name">Nombre</label>
                <input class="input" id="contact-name" name="name" type="text" autocomplete="name" required maxlength="100" />
              </div>
              <div class="field">
                <label for="contact-email" i18n="@@contact.email">Correo electrónico</label>
                <input class="input" id="contact-email" name="email" type="email" autocomplete="email" required maxlength="254" />
              </div>
              <div class="field">
                <label for="contact-subject" i18n="@@contact.subject">Asunto</label>
                <input class="input" id="contact-subject" name="subject" type="text" required maxlength="150" />
              </div>
              <div class="field">
                <label for="contact-message" i18n="@@contact.message">Mensaje</label>
                <textarea class="input" id="contact-message" name="message" rows="7" required minlength="10" maxlength="5000"></textarea>
              </div>
              <!-- Honeypot anti-spam: invisible para personas, los bots lo rellenan. -->
              <div class="hp" aria-hidden="true">
                <label for="contact-website">Website</label>
                <input id="contact-website" name="website" type="text" tabindex="-1" autocomplete="off" />
              </div>

              @switch (status()) {
                @case ('error') {
                  <p class="contact__error" role="alert" i18n="@@contact.error">
                    No hemos podido enviar el mensaje. Inténtalo más tarde o escríbenos por correo.
                  </p>
                }
                @case ('limited') {
                  <p class="contact__error" role="alert" i18n="@@contact.limited">
                    Has enviado demasiados mensajes seguidos. Espera un rato y vuelve a intentarlo.
                  </p>
                }
                @case ('invalid') {
                  <p class="contact__error" role="alert" i18n="@@contact.invalid">
                    Revisa los datos: el correo debe ser válido y el mensaje tener al menos 10 caracteres.
                  </p>
                }
              }

              <button class="btn btn--filled" type="submit" [disabled]="status() === 'sending'">
                @if (status() === 'sending') {
                  <span i18n="@@contact.sending">Enviando…</span>
                } @else {
                  <span i18n="@@contact.send">Enviar mensaje</span>
                }
              </button>
            </form>
          }
        </div>
      </section>
    </main>

    <app-site-footer />
  `,
  styles: `
    main:focus {
      outline: none;
    }
    .contact {
      display: grid;
      gap: clamp(32px, 5vw, 64px);
      align-items: start;
    }
    @media (width >= 1100px) {
      .contact {
        grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
      }
    }
    .contact__intro {
      display: grid;
      gap: 16px;
      min-inline-size: 0;
    }
    .contact__intro h1 {
      font-size: clamp(40px, 5vw, 72px);
    }
    .contact__intro .lead {
      margin: 0;
    }
    .contact__faq {
      display: flex;
      gap: 12px;
      align-items: start;
      padding: 14px 16px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-cards);
      background: var(--surface-2);
    }
    .contact__faq svg {
      flex: none;
      inline-size: 22px;
      margin-block-start: 1px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .contact__faq p {
      margin: 0;
      display: grid;
      gap: 2px;
    }
    .contact__direct {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      color: var(--ink-muted);
    }
    .contact__card {
      display: grid;
      gap: 18px;
      padding: clamp(20px, 4vw, 36px);
      border: var(--outline);
      border-radius: var(--radius-2xl);
      background: var(--surface);
    }
    .contact__form .btn {
      justify-self: start;
    }
    .contact__done {
      justify-items: start;
    }
    .contact__done h2 {
      font-size: clamp(28px, 4vw, 40px);
    }
    .contact__done p {
      margin: 0;
    }
    .field {
      display: grid;
      gap: 6px;
    }
    .field label {
      font-weight: var(--font-weight-bold);
    }
    .contact__error {
      margin: 0;
      color: var(--color-ember);
      font-weight: var(--font-weight-bold);
    }
    .hp {
      position: absolute;
      inset-inline-start: -10000px;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Contact {
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly home = `/${this.locale}/`;
  protected readonly email = CONTACT_EMAIL;
  protected readonly faqHref = `${this.home}#faq`;
  protected readonly pages = navPages(this.locale);
  protected readonly cta: NavLink = { href: `${this.home}#descargar`, label: $localize`:@@nav.cta:Descargar` };
  protected readonly homeLabel = $localize`:@@nav.home:Pockai, inicio`;
  protected readonly navLabel = $localize`:@@nav.label:Principal`;
  protected readonly status = signal<Status>('idle');

  constructor() {
    const title = $localize`:@@contact.meta.title:Contacto · Pockai`;
    const description = $localize`:@@contact.meta.description:Escribe al equipo de Pockai: dudas, ideas, fallos o colaboraciones. Te respondemos por correo.`;
    const url = pageUrl(this.locale, 'contact');
    inject(SeoService).set({
      title,
      description,
      path: 'contact',
      jsonLd: [
        { '@context': 'https://schema.org', '@type': 'ContactPage', '@id': `${url}#webpage`, name: title, description, url, inLanguage: this.locale },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: SITE_NAME, item: pageUrl(this.locale, '') },
            { '@type': 'ListItem', position: 2, name: title, item: url },
          ],
        },
      ],
    });
  }

  protected async send(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (this.status() === 'sending') return;
    const form = event.target as HTMLFormElement;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    this.status.set('sending');
    try {
      const res = await fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        form.reset();
        this.status.set('sent');
      } else {
        this.status.set(res.status === 429 ? 'limited' : res.status === 400 ? 'invalid' : 'error');
      }
    } catch {
      this.status.set('error');
    }
  }
}
