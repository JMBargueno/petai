import { TestBed } from '@angular/core/testing';
import { ArenaShowcase } from './arena-showcase';
import { ARENA_LEAGUES, COMBAT_STRATEGIES, ELEMENT_RELATIONS, SKILLS_CATALOG } from '../content';

describe('ArenaShowcase', () => {
  it('pinta los elementos, estrategias, habilidades y ligas', async () => {
    const fixture = TestBed.createComponent(ArenaShowcase);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    // Element selector buttons
    const elementButtons = el.querySelectorAll('.element-selector button');
    expect(elementButtons.length).toBe(ELEMENT_RELATIONS.length);

    // Strategies
    const strategyCards = el.querySelectorAll('.strategy-card');
    expect(strategyCards.length).toBe(COMBAT_STRATEGIES.length);

    // Total skills
    const skillCards = el.querySelectorAll('.skill-card');
    expect(skillCards.length).toBe(SKILLS_CATALOG.length);

    // Leagues
    const leagueItems = el.querySelectorAll('.league-item');
    expect(leagueItems.length).toBe(ARENA_LEAGUES.length);
  });

  it('permite filtrar habilidades por tipo de acción', async () => {
    const fixture = TestBed.createComponent(ArenaShowcase);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    const filterButtons = el.querySelectorAll('.skills-filter button');
    const attackBtn = Array.from(filterButtons).find((b) => b.textContent?.trim().includes('Ataque')) as HTMLButtonElement;
    expect(attackBtn).toBeDefined();

    attackBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const attackSkillsCount = SKILLS_CATALOG.filter((s) => s.kind === 'attack').length;
    const currentCards = el.querySelectorAll('.skill-card');
    expect(currentCards.length).toBe(attackSkillsCount);
  });
});
