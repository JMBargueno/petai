/**
 * Puerto del chat con la mascota: lo que necesita la conversación, sin saber cómo llega. El
 * escritorio decide dentro de `chatStream` si el turno va al servidor o a un motor local (Hermes,
 * CLI), y ejecuta las herramientas del equipo en `runClientTool`; Android va siempre al núcleo.
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  notice?: boolean;
  /** Razonamiento del modelo, aparte de la respuesta; se enseña plegado al terminar. */
  thinking?: string;
  thinkingOpen?: boolean;
}

export interface ChatModeration {
  message: string;
  hideUserMessage: boolean;
}

export interface ChatStreamHandlers {
  onDelta(delta: string): void;
  onModerated(m: ChatModeration): void;
  onTool(): void;
  onAction(a: { id: string; summary: string }): void;
}

/** Fin de un turno: el mensaje final y, si la hay, la reacción de la mascota (spec 36). */
export type ChatDone = { message: { content: string; thinking?: string | null }; behavior?: any } | { moderated: true };

/** Respuesta al confirmar una acción: si `clientSide`, la ejecuta la app (`runClientTool`). */
export interface ConfirmedAction {
  clientSide?: boolean;
  tool?: string;
  args?: any;
}

export interface ChatApi {
  getChatHistory(petId: string): Promise<ChatMessage[]>;
  chatStream(petId: string, text: string, handlers: ChatStreamHandlers, signal: AbortSignal): Promise<ChatDone>;
  getPendingActions(petId: string): Promise<{ id: string; summary: string }[]>;
  confirmAction(petId: string, actionId: string): Promise<ConfirmedAction>;
  rejectAction(petId: string, actionId: string): Promise<unknown>;
  /**
   * Ejecuta en el equipo una acción confirmada que es de la app (abrir una web, el portapapeles…).
   * Devuelve la nota para la tarjeta y, si procede, un mensaje que se manda a continuación.
   */
  runClientTool?(res: ConfirmedAction): Promise<{ note: string; followUp?: string }>;
  listReminders(): Promise<{ id: string; text: string; dueAt: string }[]>;
  deleteReminder(id: string): Promise<unknown>;
  getMemories(petId: string): Promise<any>;
  forgetMemory(petId: string, memoryId: string): Promise<unknown>;
  forgetAllMemories(petId: string): Promise<unknown>;
  /** Un error, en una frase para el jugador. */
  errorText(e: unknown, fallback?: string): string;
}
