# Integración de un efecto

## Archivos
| Paso | Archivo | Qué |
|---|---|---|
| 1 | `shared/scene/src/effects/<nombre>.ts` | `EffectDef` con `lore`, `phases` y `reducedPhases`, `draw` y (si hay fundido) `opacity`. |
| 2 | `shared/scene/src/effects/index.ts` | Añadir a `EFFECTS` y exportarlo. |
| 3 | `shared/scene/src/effects/<nombre>.spec.ts` | Duración ≤2,5 s, ≤12 colores en los siete Flujos, dibujo quieto con `reduced`, vacío al final y lo propio del efecto. |
| 4 | `desktop/src/lib/<estado>.ts` + spec | Solo si hace falta un estado nuevo (patrón `visitTravel.ts`: presentador, transición solo con mascota en pantalla, temporizadores probados con fake timers). |
| 5 | `desktop/src/components/PetView.svelte` | Reproductor, `<EffectLayer>`, flags de bloqueo (que no pasee, hable, se arrastre ni se invoque) y clases CSS de la mascota. |
| 6 | Quien dispara | La pestaña, el socket o el store que llama al estado (`VisitTab.svelte` llama a `startTravel` y `endTravel`; `App.svelte` restaura y caduca). |
| 7 | `references/lore-effects.md` | Mover la idea de «pendientes» a «hechos». |

## Comprobaciones
```bash
node .claude/skills/pockai-effect-architect/scripts/check_effects.mjs <id>
npx tsx .claude/skills/pockai-effect-architect/scripts/effect_contact.ts <id>
npx tsx .claude/skills/pockai-effect-architect/scripts/effect_contact.ts <id> --reduced
cd shared/scene && npm test && npm run typecheck
cd desktop && npx svelte-check --threshold error   # filtra por tus archivos: el repo arrastra errores ajenos
```

## En la demo (`pockai-desktop-demo`, puerto 5175)
1. Entra con las credenciales de demo que ya trae el formulario.
2. Lanza el disparador. Para el portal: Social › Visitas › Iniciar visita, y después Terminar visita. Para lo que llega por socket, usa el gancho de desarrollo de `App.svelte` (solo existe con `import.meta.env.DEV`):
   ```js
   __pockaiFx.react('level_up', { level: 12 })          // cualquier pet:action de eventMap
   __pockaiFx.react('evolved', { stage: 'adult' })
   __pockaiFx.summon(600, 600)                          // invocación rápida en ese punto
   __pockaiFx.hatch('mythic', true, 'legendary')        // nace otra: rareza, shiny, garantía
   __pockaiFx.react('welcome_back', { tier: 'offended' })
   __pockaiFx.home(true) / __pockaiFx.home(false)       // entrar y salir de casa por el altar
   __pockaiFx.achievement('legendary')                  // logro por rango
   __pockaiFx.battle('lost')                            // arena: won | lost | draw
   __pockaiFx.clanGoal()                                // juramento de clan cumplido
   __pockaiFx.agent('open_url')                         // manitas: open_url | read_clipboard
   __pockaiFx.intelligence(600)                         // cruce de umbral del Despertar
   __pockaiFx.weather('rain')                           // rain | snow | clear
   __pockaiFx.gift('care')                              // gift | care
   __pockaiFx.react('sick' | 'cleaned' | 'slept')
   __pockaiFx.eggHatch('water')                         // huevo: tiembla, se agrieta con ese Flujo y estalla
   __pockaiFx.dailyMissions() / chest('mythic', 'legendary') / ritual() / raidVictory('fire')
   __pockaiFx.visitorJoin({ visitorId: 'u-9', visitorName: 'Marta', pet: { petId: 'p-9', nickname: 'Luna', speciesName: 'Axolunar', speciesId: 'axolunar', spriteRef: '' }, startedAt: new Date().toISOString() })
   __pockaiFx.visitorLeave('u-9')
   ```
   Si el panel del navegador está oculto, `requestAnimationFrame` se para y el efecto no avanza: enséñalo (`show_pane` preview) antes de capturar.
3. Captura las fases con `zoom` sobre la mascota, separadas de 0,4 a 0,6 s.
4. Comprueba con JS: el canvas `[data-effect]` desaparece al terminar y la mascota no tiene `.away` ni `.traveling`.
5. Mira que la consola esté sin errores.
6. Devuelve el viewport a `desktop` al acabar.
