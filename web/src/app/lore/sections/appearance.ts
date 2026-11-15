import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-appearance',
  template: `<section id="apariencia" class="band band--sky"><div class="band__inner">apariencia</div></section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Appearance {}
