/**
 * Fondo de las salas del hábitat: `painted` (modo híbrido, paisaje pintado detrás de la sala) o
 * `plain` (solo cielo). Es una preferencia de este equipo: se recuerda en localStorage y la
 * comparten todas las vistas de sala (Hábitat e Inicio).
 */
import { writable } from 'svelte/store';
import type { BackdropMode } from '@pockai/scene';

const KEY = 'petai_habitat_backdrop';

function read(): BackdropMode {
  try {
    return localStorage.getItem(KEY) === 'plain' ? 'plain' : 'painted';
  } catch {
    return 'painted';
  }
}

export const habitatBackdrop = writable<BackdropMode>(read());

habitatBackdrop.subscribe((mode) => {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* sin almacenamiento: la preferencia dura lo que la sesión */
  }
});
