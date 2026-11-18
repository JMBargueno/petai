# Integración de un efecto

## Archivos
| Paso | Archivo | Qué |
|---|---|---|
| 1 | `desktop/src/lib/effects/<nombre>.ts` | `EffectDef` con `lore`, `phases` y `reducedPhases`, `draw` y (si hay fundido) `opacity`. |
| 2 | `desktop/src/lib/effects/index.ts` | Añadir a `EFFECTS` y exportarlo. |
| 3 | `desktop/src/lib/effects/<nombre>.spec.ts` | Duración ≤2,5 s, ≤12 colores en los siete Flujos, dibujo quieto con `reduced`, vacío al final y lo propio del efecto. |
| 4 | `desktop/src/lib/<estado>.ts` + spec | Solo si hace falta un estado nuevo (patrón `visitTravel.ts`: presentador, transición solo con mascota en pantalla, temporizadores probados con fake timers). |
| 5 | `desktop/src/components/PetView.svelte` | Reproductor, `<EffectLayer>`, flags de bloqueo (que no pasee, hable, se arrastre ni se invoque) y clases CSS de la mascota. |
| 6 | Quien dispara | La pestaña, el socket o el store que llama al estado (`VisitTab.svelte` llama a `startTravel` y `endTravel`; `App.svelte` restaura y caduca). |
| 7 | `references/lore-effects.md` | Mover la idea de «pendientes» a «hechos». |

## Comprobaciones
```bash
node .claude/skills/pockai-effect-architect/scripts/check_effects.mjs <id>
npx tsx .claude/skills/pockai-effect-architect/scripts/effect_contact.ts <id>
npx tsx .claude/skills/pockai-effect-architect/scripts/effect_contact.ts <id> --reduced
cd desktop && npx vitest run src/lib/effects
cd desktop && npx svelte-check --threshold error   # filtra por tus archivos: el repo arrastra errores ajenos
```

## En la demo (`pockai-desktop-demo`, puerto 5175)
1. Entra con las credenciales de demo que ya trae el formulario.
2. Lanza el disparador. Para el portal: Social › Visitas › Iniciar visita, y después Terminar visita.
3. Captura las fases con `zoom` sobre la mascota, separadas de 0,4 a 0,6 s.
4. Comprueba con JS: el canvas `[data-effect]` desaparece al terminar y la mascota no tiene `.away` ni `.traveling`.
5. Mira que la consola esté sin errores.
6. Devuelve el viewport a `desktop` al acabar.
