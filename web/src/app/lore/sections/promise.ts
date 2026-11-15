import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-promise-section',
  template: `<section id="rarezas" class="band band--ink"><div class="band__inner">rarezas</div></section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromiseSection {}
