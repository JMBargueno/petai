import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-awakening',
  template: `<section id="despertar" class="band band--sky"><div class="band__inner">despertar</div></section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Awakening {}
