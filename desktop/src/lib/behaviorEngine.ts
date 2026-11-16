/**
 * Motor de comportamiento y estados dinámicos en el escritorio para Pockai.
 * Coordina transiciones orgánicas entre pasear, corretear (zoomies), espiar (peeking),
 * curiosear el cursor inactivo (stalking), caricias (petting) y chocar patita (high-five).
 */

export type BehaviorState =
  | 'idle'
  | 'wander'
  | 'zoomies'
  | 'stalking'
  | 'peeking'
  | 'petting'
  | 'high_five';

export interface CursorInfo {
  x: number;
  y: number;
  isMoving: boolean;
  idleDurationMs: number;
}

export interface PetGeometry {
  x: number;
  y: number;
  size: number;
  direction: number; // 1 o -1
}

export interface BehaviorConfig {
  pettingStrokeThreshold?: number; // Píxeles de frote acumulados para entrar en petting
  stalkingIdleTimeMs?: number;      // Tiempo quieto del cursor para despertar curiosidad (ej. 3000ms)
  zoomiesChance?: number;           // Probabilidad por ciclo de lanzar un sprint
  peekingChance?: number;           // Probabilidad de ir a asomarse al borde
  highFiveDurationMs?: number;      // Cuánto dura la invitación de chocar patita
}

const DEFAULT_BEHAVIOR_CONFIG: Required<BehaviorConfig> = {
  pettingStrokeThreshold: 110,
  stalkingIdleTimeMs: 3500,
  zoomiesChance: 0.12,
  peekingChance: 0.10,
  highFiveDurationMs: 6000,
};

export class BehaviorEngine {
  private state: BehaviorState = 'idle';
  private stateTimer = 0; // Segundos restantes en el estado actual
  private strokeAccumulator = 0;
  private strokeDecayTimer = 0;
  private highFiveTimer = 0;
  private config: Required<BehaviorConfig>;

  // Variables de navegación autónoma
  private targetX = 0;
  private peekSide: 'left' | 'right' = 'left';

  constructor(config: BehaviorConfig = {}) {
    this.config = { ...DEFAULT_BEHAVIOR_CONFIG, ...config };
  }

  getState(): BehaviorState {
    return this.state;
  }

  setState(newState: BehaviorState, durationSeconds = 3) {
    this.state = newState;
    this.stateTimer = durationSeconds;
  }

  /**
   * Registra movimiento del cursor sobre la mascota (frotar para acariciar).
   * Devuelve true si acaba de entrar en estado de caricia (petting).
   */
  recordStroke(strokeDelta: number): boolean {
    this.strokeAccumulator += strokeDelta;
    this.strokeDecayTimer = 0.8; // Se resetea si no hay más movimientos en 800ms

    if (this.strokeAccumulator >= this.config.pettingStrokeThreshold) {
      this.strokeAccumulator = 0;
      this.setState('petting', 2.5);
      return true;
    }
    return false;
  }

  /**
   * Inicia el evento "Choca esos cinco".
   */
  startHighFive(): boolean {
    if (this.state === 'petting') return false;
    this.setState('high_five', this.config.highFiveDurationMs / 1000);
    this.highFiveTimer = this.config.highFiveDurationMs / 1000;
    return true;
  }

  /**
   * Resuelve si el clic completó con éxito el chocar esos cinco.
   */
  completeHighFive(): boolean {
    if (this.state === 'high_five') {
      this.setState('idle', 1.5);
      this.highFiveTimer = 0;
      return true;
    }
    return false;
  }

  /**
   * Actualiza los temporizadores y evalúa posibles transiciones autónomas.
   */
  update(
    dt: number,
    cursor: CursorInfo,
    pet: PetGeometry,
    screenWidth: number
  ): { state: BehaviorState; targetX?: number; shouldTurnToCursor?: boolean } {
    // Decaimiento del acumulador de caricias
    if (this.strokeDecayTimer > 0) {
      this.strokeDecayTimer -= dt;
      if (this.strokeDecayTimer <= 0) {
        this.strokeAccumulator = Math.max(0, this.strokeAccumulator - 40);
      }
    }

    if (this.stateTimer > 0) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        // Al terminar el estado actual, vuelve a idle
        this.state = 'idle';
      }
    }

    // Si está en petting o high-five, no interrumpe con otros comportamientos
    if (this.state === 'petting' || this.state === 'high_five') {
      return { state: this.state };
    }

    // 1. Detección de cursor quieto cerca del suelo -> Stalking (curiosear)
    if (
      cursor.idleDurationMs >= this.config.stalkingIdleTimeMs &&
      this.state !== 'stalking' &&
      Math.abs(cursor.x - pet.x) > 90 &&
      Math.abs(cursor.x - pet.x) < 700
    ) {
      this.setState('stalking', 4.0);
      // Se aproxima hasta colocarse a unos 50px del cursor
      const offset = cursor.x > pet.x ? -55 : 55;
      this.targetX = Math.max(10, Math.min(screenWidth - pet.size - 10, cursor.x + offset));
      return { state: 'stalking', targetX: this.targetX };
    }

    // 2. Si está en Stalking, se mueve hacia el objetivo
    if (this.state === 'stalking') {
      // Si el cursor se vuelve a mover bruscamente, cancela el sigilo
      if (cursor.isMoving) {
        this.setState('idle', 1.0);
        return { state: 'idle' };
      }
      return { state: 'stalking', targetX: this.targetX };
    }

    // 3. Transiciones espontáneas desde Idle
    if (this.state === 'idle') {
      // ¿Debe orientarse a mirar el cursor si está a una distancia media?
      const distToCursor = Math.abs(cursor.x - (pet.x + pet.size / 2));
      const shouldTurn = distToCursor > 80 && distToCursor < 450;

      // Probabilidad de Zoomies (carrera a toda velocidad)
      if (Math.random() < this.config.zoomiesChance * dt) {
        this.setState('zoomies', 2.8);
        // Elige el extremo opuesto para correr
        this.targetX = pet.x < screenWidth / 2 ? screenWidth - pet.size - 30 : 30;
        return { state: 'zoomies', targetX: this.targetX };
      }

      // Probabilidad de Peeking (ir al borde a espiar)
      if (Math.random() < this.config.peekingChance * dt) {
        this.setState('peeking', 4.5);
        this.peekSide = pet.x < screenWidth / 2 ? 'left' : 'right';
        this.targetX = this.peekSide === 'left' ? -pet.size * 0.65 : screenWidth - pet.size * 0.35;
        return { state: 'peeking', targetX: this.targetX };
      }

      return { state: 'idle', shouldTurnToCursor: shouldTurn };
    }

    // 4. Zoomies y Peeking activos
    if (this.state === 'zoomies' || this.state === 'peeking') {
      return { state: this.state, targetX: this.targetX };
    }

    return { state: this.state };
  }
}
