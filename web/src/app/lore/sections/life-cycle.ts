import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-life-cycle',
  template: `<section id="ciclo" class="band band--white"><div class="band__inner">ciclo</div></section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifeCycle {}
