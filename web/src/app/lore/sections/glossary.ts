import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-glossary',
  template: `<section id="glosario" class="band band--gray"><div class="band__inner">glosario</div></section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Glossary {}
