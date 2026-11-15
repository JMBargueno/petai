import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-elements',
  template: `<section id="elementos" class="band band--gray"><div class="band__inner">elementos</div></section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Elements {}
