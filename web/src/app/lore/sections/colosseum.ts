import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-colosseum',
  template: `<section id="coliseo" class="band band--ink"><div class="band__inner">coliseo</div></section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Colosseum {}
