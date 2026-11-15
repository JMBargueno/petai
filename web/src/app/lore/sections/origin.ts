import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-origin',
  template: `<section id="origen" class="band band--white"><div class="band__inner">origen</div></section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Origin {}
