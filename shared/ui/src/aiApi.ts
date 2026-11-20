/**
 * Cómo leen y guardan la configuración de IA (`AiKeyForm`, `AiSettingsView`). Como el resto de
 * puertos, cada app lo rellena con lo suyo: el núcleo en Android, la API del escritorio en el
 * escritorio. La key nunca vuelve completa del servidor: solo `hasKey` y su máscara.
 */

export interface AiConfigView {
  configured: boolean;
  /** `managed` (la IA de Pockai) o `byok` (la clave del jugador). */
  mode: string;
  provider?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  hasKey?: boolean;
  keyMask?: string | null;
}

export interface AiConfigInput {
  mode: 'managed' | 'byok';
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export interface AiApi {
  getConfig(): Promise<AiConfigView>;
  saveConfig(cfg: AiConfigInput): Promise<AiConfigView>;
  testConfig(): Promise<{ ok: boolean; error?: string }>;
  /** Borra la clave y vuelve a la IA de Pockai. */
  deleteConfig(): Promise<unknown>;
  errorText(error: unknown, fallback: string): string;
}

/** La URL base sin `/chat/completions` ni barras finales, como la espera el servidor. */
export const cleanAiBaseUrl = (url: string) => url.trim().replace(/\/chat\/completions\/?$/i, '').replace(/\/+$/, '');
