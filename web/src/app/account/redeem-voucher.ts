import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient, ApiError } from '../shared/auth/api';

interface RewardReceived {
  redemptionId: string;
  granted: {
    coins: number;
    gems: number;
    proDays: number;
    proUntil: string | null;
    chests: { type: string; qty: number }[];
    accessories: { id: string; name: string; alreadyOwned: boolean }[];
  };
}

interface Line {
  kind: 'coins' | 'gems' | 'pro' | 'chest' | 'accessory';
  text: string;
}

/** «Canjear código» en Mi cuenta: canjea un voucher y enseña lo recibido con una pequeña celebración. */
@Component({
  selector: 'app-redeem-voucher',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="redeem" aria-labelledby="account-redeem">
      <h2 id="account-redeem" class="label-caps" i18n="@@account.redeem.title">Canjear código</h2>
      <form class="redeem__form" (ngSubmit)="redeem()">
        <label class="visually-hidden" for="redeem-code" i18n="@@account.redeem.label">Código del voucher</label>
        <input
          class="input redeem__input"
          id="redeem-code"
          name="code"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="40"
          placeholder="ABCD-EF23"
          required
          [ngModel]="code()"
          (ngModelChange)="code.set($event)"
        />
        <button class="btn btn--filled" type="submit" [disabled]="busy() || !code().trim()" i18n="@@account.redeem.submit">Canjear</button>
      </form>
      @if (error(); as e) {
        <p class="form-error" role="alert">{{ e }}</p>
      }
      @if (lines().length) {
        <div class="reward" role="status" [attr.data-key]="celebration()">
          <div class="reward__burst" aria-hidden="true">
            @for (s of sparks; track $index) {
              <span [style.--i]="$index"></span>
            }
          </div>
          <strong i18n="@@account.redeem.ok">¡Recompensa recibida!</strong>
          <ul>
            @for (l of lines(); track $index) {
              <li [class]="'reward__line reward__line--' + l.kind" [style.--d]="$index">{{ l.text }}</li>
            }
          </ul>
        </div>
      }
    </section>
  `,
  styles: `
    .redeem {
      display: grid;
      gap: 10px;
      padding-block-start: 14px;
      border-block-start: 1px solid var(--line-soft);
    }
    .redeem h2 {
      margin: 0;
    }
    .redeem__form {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .redeem__input {
      flex: 1 1 180px;
      font-family: ui-monospace, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .form-error {
      margin: 0;
      padding: 8px 14px;
      border: 2px solid var(--color-ember);
      border-radius: var(--radius-2xl);
      font-weight: var(--font-weight-bold);
    }
    .reward {
      position: relative;
      display: grid;
      gap: 6px;
      padding: 14px 16px;
      overflow: hidden;
      border: 2px solid var(--color-mint-pop);
      border-radius: var(--radius-2xl);
      background: color-mix(in srgb, var(--color-mint-pop) 12%, var(--surface));
      animation: reward-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    .reward ul {
      display: grid;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .reward__line {
      font-weight: var(--font-weight-bold);
      animation: reward-line 360ms ease-out both;
      animation-delay: calc(200ms + var(--d) * 90ms);
    }
    .reward__line::before {
      content: '✦ ';
    }
    .reward__line--coins::before { color: #e0a800; }
    .reward__line--gems::before { color: #2bb5d8; }
    .reward__line--pro::before { color: #b06cf0; }
    .reward__line--chest::before { color: #c9822b; }
    .reward__line--accessory::before { color: #e2598b; }
    .reward__burst {
      position: absolute;
      inset-block-start: 50%;
      inset-inline-end: 28px;
      pointer-events: none;
    }
    .reward__burst span {
      position: absolute;
      inline-size: 6px;
      block-size: 6px;
      border-radius: 2px;
      background: hsl(calc(var(--i) * 45deg) 85% 60%);
      animation: reward-spark 900ms ease-out both;
      --a: calc(var(--i) * 45deg);
    }
    @keyframes reward-pop {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: none; }
    }
    @keyframes reward-line {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: none; }
    }
    @keyframes reward-spark {
      from { opacity: 1; transform: rotate(var(--a)) translateX(0) scale(1); }
      to { opacity: 0; transform: rotate(var(--a)) translateX(42px) scale(0.4); }
    }
    @media (prefers-reduced-motion: reduce) {
      .reward,
      .reward__line {
        animation: none;
      }
      .reward__burst {
        display: none;
      }
    }
  `,
})
export class RedeemVoucher {
  private readonly api = inject(ApiClient);
  private readonly dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

  protected readonly sparks = Array.from({ length: 8 });
  protected readonly code = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly lines = signal<Line[]>([]);
  protected readonly celebration = signal('');

  protected async redeem() {
    const code = this.code().trim();
    if (!code || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.request<RewardReceived>('/v1/vouchers/redeem', { method: 'POST', body: JSON.stringify({ code }) });
      this.lines.set(this.describe(res.granted));
      this.celebration.set(res.redemptionId);
      this.code.set('');
    } catch (e) {
      this.lines.set([]);
      this.error.set(this.messageFor(e));
    } finally {
      this.busy.set(false);
    }
  }

  private describe(g: RewardReceived['granted']): Line[] {
    const out: Line[] = [];
    if (g.coins) out.push({ kind: 'coins', text: $localize`:@@account.redeem.coins:+${g.coins}:n: monedas` });
    if (g.gems) out.push({ kind: 'gems', text: $localize`:@@account.redeem.gems:+${g.gems}:n: gemas` });
    if (g.proDays) {
      const until = g.proUntil ? this.dateFormat.format(new Date(g.proUntil)) : '';
      out.push({ kind: 'pro', text: $localize`:@@account.redeem.pro:+${g.proDays}:n: días de Pro (hasta el ${until}:date:)` });
    }
    for (const c of g.chests) out.push({ kind: 'chest', text: $localize`:@@account.redeem.chest:${c.qty}:n: × cofre ${c.type}:type:` });
    for (const a of g.accessories) {
      out.push({
        kind: 'accessory',
        text: a.alreadyOwned ? $localize`:@@account.redeem.accessoryOwned:${a.name}:name: (ya la tenías)` : $localize`:@@account.redeem.accessory:Prenda: ${a.name}:name:`,
      });
    }
    return out;
  }

  private messageFor(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.status === 409) return $localize`:@@account.redeem.already:Ya has canjeado este código.`;
      if (e.status === 429) return $localize`:@@auth.tooMany:Demasiados intentos. Espera unos minutos y vuelve a probar.`;
      if (e.status === 400 || e.status === 404) return $localize`:@@account.redeem.invalid:El código no es válido o ha caducado.`;
    }
    return e instanceof Error ? e.message : $localize`:@@auth.unexpected:Error inesperado`;
  }
}
