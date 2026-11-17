import { ChangeDetectionStrategy, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { CONTACT_EMAIL, CONTACT_ENDPOINT } from '../../contact/contact';
import { WEB_CLIENT_HEADERS } from '../auth/api';
import { SOCIAL_LINKS } from '../social';

export type ContactStatus = 'idle' | 'sending' | 'sent' | 'error' | 'limited' | 'invalid';

/**
 * Pie oscuro de las pantallas que tapan la web («Coming soon» y mantenimiento): correo, botón con el
 * formulario de contacto en un diálogo y redes sociales. Con `form = false` (backend caído) solo se
 * enseñan el correo y las redes: el formulario no podría enviarse.
 */
@Component({
  selector: 'app-contact-footer',
  template: `
    <footer class="bottom">
      <div class="bottom__contact">
        <a class="bottom__email" [href]="'mailto:' + contactEmail">{{ contactEmail }}</a>
        @if (form()) {
          <button type="button" class="bottom__contact-btn" (click)="openContactDialog()" i18n="@@soon.contactBtn">Contacto</button>
        }
      </div>
      <ul class="social" aria-label="Redes sociales" i18n-aria-label="@@soon.social">
        @for (s of social; track s.id) {
          <li>
            <a class="social__link" [href]="s.url" target="_blank" rel="noopener" [attr.aria-label]="s.name" [title]="s.name">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path [attr.d]="s.path" /></svg>
            </a>
          </li>
        }
      </ul>
      <p class="handle">&#64;pockais</p>
    </footer>

    @if (form()) {
      <dialog #contactDialog class="dialog dialog--dark" (close)="closed.emit()">
        <button type="button" class="dialog__close" aria-label="Cerrar" (click)="closeContactDialog()" i18n-aria-label="@@dialog.close">✕</button>
        <h2 class="dialog__title" i18n="@@contact.title">Escríbenos</h2>
        <p class="dialog__eyebrow" i18n="@@contact.eyebrow">Contacto</p>
        <p class="dialog__lead" i18n="@@contact.lead">
          ¿Dudas, ideas, un fallo o tu pockai hace cosas raras? Cuéntanoslo y te responderemos por correo.
        </p>
        <p class="contact__direct-notice">
          <span i18n="@@contact.direct">También puedes escribir directamente a</span>
          <a class="contact__direct-link" [href]="'mailto:' + contactEmail">{{ contactEmail }}</a>
        </p>

        @if (contactStatus() === 'sent') {
          <div class="dialog__done" role="status">
            <h3 class="dialog__done-title" i18n="@@contact.sent.title">¡Mensaje enviado!</h3>
            <p class="dialog__done-text" i18n="@@contact.sent.text">Gracias por escribirnos. Te responderemos a tu correo lo antes posible.</p>
            <div class="dialog__actions">
              <button type="button" class="btn btn--filled btn--glow" (click)="contactStatus.set('idle')" i18n="@@contact.sent.again">Enviar otro mensaje</button>
              <button type="button" class="btn btn--ghost-light" (click)="closeContactDialog()" i18n="@@contact.close">Cerrar</button>
            </div>
          </div>
        } @else {
          <form class="dialog__form" method="post" (submit)="submitContact($event)" [attr.aria-busy]="contactStatus() === 'sending'">
            <div class="dialog__field">
              <label for="cf-contact-name" i18n="@@contact.name">Nombre</label>
              <input class="dialog__input" id="cf-contact-name" name="name" type="text" autocomplete="name" required maxlength="100" />
            </div>
            <div class="dialog__field">
              <label for="cf-contact-email" i18n="@@contact.email">Correo electrónico</label>
              <input class="dialog__input" id="cf-contact-email" name="email" type="email" autocomplete="email" required maxlength="254" />
            </div>
            <div class="dialog__field">
              <label for="cf-contact-subject" i18n="@@contact.subject">Asunto</label>
              <input class="dialog__input" id="cf-contact-subject" name="subject" type="text" required maxlength="150" />
            </div>
            <div class="dialog__field">
              <label for="cf-contact-message" i18n="@@contact.message">Mensaje</label>
              <textarea class="dialog__input dialog__textarea" id="cf-contact-message" name="message" rows="5" required minlength="10" maxlength="5000"></textarea>
            </div>
            <div class="hp" aria-hidden="true">
              <label for="cf-contact-website">Website</label>
              <input id="cf-contact-website" name="website" type="text" tabindex="-1" autocomplete="off" />
            </div>

            @switch (contactStatus()) {
              @case ('error') {
                <p class="dialog__error" role="alert" i18n="@@contact.error">
                  No hemos podido enviar el mensaje. Inténtalo más tarde o escríbenos por correo.
                </p>
              }
              @case ('limited') {
                <p class="dialog__error" role="alert" i18n="@@contact.limited">
                  Has enviado demasiados mensajes seguidos. Espera un rato y vuelve a intentarlo.
                </p>
              }
              @case ('invalid') {
                <p class="dialog__error" role="alert" i18n="@@contact.invalid">
                  Revisa los datos: el correo debe ser válido y el mensaje tener al menos 10 caracteres.
                </p>
              }
            }

            <div class="dialog__actions">
              <button class="btn btn--filled btn--glow" type="submit" [disabled]="contactStatus() === 'sending'">
                @if (contactStatus() === 'sending') {
                  <span i18n="@@contact.sending">Enviando…</span>
                } @else {
                  <span i18n="@@contact.send">Enviar mensaje</span>
                }
              </button>
            </div>
          </form>
        }
      </dialog>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .bottom {
      display: grid;
      justify-items: center;
      gap: 12px;
      padding: 12px 16px 28px;
    }
    .bottom__contact {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 12px;
      font-size: 14px;
    }
    .bottom__email {
      color: rgb(255 255 255 / 0.85);
      text-decoration: underline;
      text-underline-offset: 3px;
      font-weight: var(--font-weight-bold);
      transition: color var(--dur-2) var(--ease-out);
    }
    .bottom__email:hover {
      color: #ffd731;
    }
    .bottom__contact-btn {
      padding: 5px 14px;
      border: 1px solid rgb(255 255 255 / 0.25);
      border-radius: var(--radius-pills);
      background: rgb(255 255 255 / 0.08);
      color: #fff;
      font-family: inherit;
      font-size: 13px;
      font-weight: var(--font-weight-bold);
      cursor: pointer;
      transition:
        background var(--dur-2) var(--ease-out),
        border-color var(--dur-2) var(--ease-out);
    }
    .bottom__contact-btn:hover {
      background: rgb(255 255 255 / 0.18);
      border-color: #ffd731;
    }
    .social {
      display: flex;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .social__link {
      display: grid;
      place-items: center;
      inline-size: 44px;
      aspect-ratio: 1;
      border: 1px solid rgb(255 255 255 / 0.22);
      border-radius: 50%;
      background: rgb(255 255 255 / 0.06);
      color: #fff;
      transition:
        background var(--dur-2) var(--ease-out),
        scale var(--dur-2) var(--ease-bounce);
    }
    .social__link:hover {
      background: rgb(255 255 255 / 0.16);
      scale: 1.08;
    }
    .social__link svg {
      inline-size: 18px;
      fill: currentColor;
    }
    .handle {
      margin: 0;
      color: rgb(255 255 255 / 0.55);
      font-size: 13px;
      letter-spacing: 0.06em;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 14px 28px;
      border: 2px solid transparent;
      border-radius: var(--radius-pills);
      font-family: inherit;
      font-weight: var(--font-weight-extrabold);
      font-size: 15px;
      text-decoration: none;
      cursor: pointer;
      transition:
        scale var(--dur-2) var(--ease-bounce),
        background var(--dur-2) var(--ease-out);
    }
    .btn:hover {
      scale: 1.04;
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      scale: 1;
    }
    .btn--filled {
      background: #fff;
      color: #0b0a14;
    }
    .btn--glow {
      box-shadow: 0 0 32px rgb(255 215 49 / 0.45);
    }
    .btn--ghost-light {
      border-color: rgb(255 255 255 / 0.35);
      background: rgb(255 255 255 / 0.08);
      color: #fff;
    }
    .btn--ghost-light:hover {
      background: rgb(255 255 255 / 0.14);
    }

    dialog.dialog--dark {
      position: fixed;
      inset: 0;
      margin: auto;
      inline-size: min(480px, calc(100vw - 32px));
      max-block-size: min(90svh, 720px);
      overflow-y: auto;
      padding: clamp(24px, 5vw, 36px);
      border: 1px solid rgb(255 255 255 / 0.18);
      border-radius: 24px;
      background: #141322;
      color: #fff;
      box-shadow: 0 24px 64px rgb(0 0 0 / 0.7);
      text-align: start;
    }
    dialog.dialog--dark::backdrop {
      background-color: rgb(11 10 20 / 0.75);
      backdrop-filter: blur(8px);
    }
    .dialog__title {
      margin: 0;
      font-family: var(--font-lateral);
      font-size: clamp(24px, 4vw, 32px);
      letter-spacing: -0.01em;
      line-height: 1.1;
    }
    .dialog__eyebrow {
      margin: 4px 0 0;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffd731;
    }
    .dialog__lead {
      margin: 10px 0 0;
      font-size: 14px;
      line-height: 1.45;
      color: rgb(255 255 255 / 0.75);
    }
    .dialog__close {
      position: absolute;
      inset-block-start: 18px;
      inset-inline-end: 18px;
      display: grid;
      place-items: center;
      inline-size: 34px;
      block-size: 34px;
      padding: 0;
      border: 1px solid rgb(255 255 255 / 0.15);
      border-radius: 50%;
      background: rgb(255 255 255 / 0.06);
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .dialog__close:hover {
      background: rgb(255 255 255 / 0.16);
      border-color: #ffd731;
    }
    .dialog__form {
      display: grid;
      gap: 14px;
      margin-block-start: 16px;
    }
    .dialog__field {
      display: grid;
      gap: 6px;
    }
    .dialog__field label {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: rgb(255 255 255 / 0.75);
    }
    .dialog__input {
      inline-size: 100%;
      box-sizing: border-box;
      padding: 10px 14px;
      border: 1px solid rgb(255 255 255 / 0.2);
      border-radius: 12px;
      background: rgb(255 255 255 / 0.08);
      color: #fff;
      font-family: inherit;
      font-size: 15px;
      outline: none;
      transition: border-color 0.15s, background-color 0.15s;
    }
    .dialog__input:focus {
      border-color: #ffd731;
      background: rgb(255 255 255 / 0.12);
    }
    .dialog__textarea {
      resize: vertical;
      min-block-size: 100px;
    }
    .dialog__error {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: #fb4903;
    }
    .dialog__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-block-start: 6px;
    }
    .contact__direct-notice {
      margin: 8px 0 0;
      font-size: 13px;
      color: rgb(255 255 255 / 0.65);
    }
    .contact__direct-link {
      color: #ffd731;
      text-decoration: underline;
      font-weight: 600;
      margin-inline-start: 4px;
    }
    .dialog__done {
      display: grid;
      gap: 12px;
      margin-block-start: 16px;
    }
    .dialog__done-title {
      margin: 0;
      font-size: 22px;
      color: #55db9c;
    }
    .dialog__done-text {
      margin: 0;
      font-size: 15px;
      color: rgb(255 255 255 / 0.85);
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
export class ContactFooter {
  /** Mostrar el botón y el diálogo con el formulario (no tiene sentido si el backend no responde). */
  readonly form = input(true);
  /** El diálogo de contacto se ha cerrado. */
  readonly closed = output<void>();

  protected readonly social = SOCIAL_LINKS;
  protected readonly contactEmail = CONTACT_EMAIL;
  protected readonly contactStatus = signal<ContactStatus>('idle');
  private readonly contactDialog = viewChild<ElementRef<HTMLDialogElement>>('contactDialog');

  openContactDialog() {
    this.contactStatus.set('idle');
    this.contactDialog()?.nativeElement.showModal();
  }

  protected closeContactDialog() {
    this.contactDialog()?.nativeElement.close();
  }

  protected async submitContact(event: SubmitEvent) {
    event.preventDefault();
    if (this.contactStatus() === 'sending') return;
    const form = event.target as HTMLFormElement;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    this.contactStatus.set('sending');
    try {
      const res = await fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...WEB_CLIENT_HEADERS },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        form.reset();
        this.contactStatus.set('sent');
      } else {
        this.contactStatus.set(res.status === 429 ? 'limited' : res.status === 400 ? 'invalid' : 'error');
      }
    } catch {
      this.contactStatus.set('error');
    }
  }
}
