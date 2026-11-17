/**
 * El panel usa el mismo cliente y la misma sesión que la web pública (shared/auth/api.ts):
 * quien entra en la web con una cuenta de equipo ya está dentro del panel.
 */
export {
  API_BASE_URL,
  ApiClient as AdminApi,
  ApiError,
  SESSION_KEY,
  SESSION_STORAGE,
  type SessionUser,
  type UserSession as AdminSession,
} from '../shared/auth/api';
