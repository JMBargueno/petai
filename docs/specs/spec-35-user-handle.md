# Spec: Nickname público e inmutable (@handle)

## ID
35 — Identidad social del jugador.

## Resumen
Al crear la cuenta cada jugador elige un **nickname único** al estilo `@jmbargueno`. El nickname **no se puede cambiar nunca**. El nombre (`displayName`), en cambio, sí se puede cambiar. El nickname es lo que usan las funciones sociales para encontrar a alguien:

- añadir amigos;
- invitar a un clan;
- mostrar quién te visita o te saluda con su pockai;
- buscar a un jugador (`GET /users/by-handle/:handle`).

Las funciones sociales **ya no buscan por email**. Así no se filtran correos ni se puede comprobar si una dirección está registrada.

En código el campo se llama `handle` (`User.handle`) para no confundirlo con `Pet.nickname`. En la interfaz se llama "nickname".

## Reglas
- Entre 3 y 20 caracteres: letras `a-z`, dígitos, `_` y `.`.
- Empieza por una letra. No puede tener `..` ni terminar en punto.
- No distingue mayúsculas: se guarda en minúsculas y sin la `@` inicial, y se muestra como `@nick`. La API acepta el valor con o sin `@`.
- Hay **palabras reservadas** (`admin`, `pockai`, `soporte`, `moderador`, `root`, …). Están en `RESERVED_HANDLES`, en `backend/src/common/user-handle.ts`.
- Es **único**: índice `User_handle_key`.
- Es **inmutable**: se fija una sola vez. Lo garantiza un trigger de la base de datos (`User_handle_immutable`), que rechaza cambiarlo o vaciarlo incluso desde el panel o un script. Reescribir el mismo valor sí se permite, para que los upserts del seed funcionen.

La regla de formato existe en tres sitios que deben mantenerse iguales:
- el backend (`user-handle.ts`);
- el `CHECK` `User_handle_format_check` de la migración `20261117000000_user_handle`;
- los clientes (`desktop/src/lib/handle.ts` y `mobile/.../data/Handle.kt`).

## API
- `GET /auth/handle-available?handle=x` es público, con un límite de `AUTH_HANDLE_CHECK_MAX_PER_MINUTE` peticiones por IP (60 por defecto). Devuelve `{ handle, available, reason? }`.
- `POST /auth/register` acepta `handle` (opcional en la API para no romper las apps antiguas). Las apps actuales lo exigen en el formulario. Errores:
  - nickname en uso → 409 "Ese nickname ya está en uso";
  - formato no válido o palabra reservada → 400.
- `POST /me/handle { handle }` fija el nickname de una cuenta que aún no lo tiene. Si la cuenta ya tenía uno o el nickname está en uso, devuelve 409. Lleva `@AllowUnverified()`.
- `PATCH /me` con `handle` → 400 "El nickname no se puede cambiar".
- `GET /users/by-handle/:handle` (con sesión) devuelve `{ id, handle, displayName, title, accountXp }`, o 404.
- `POST /coop/friends { handle | targetUserId }` y `POST /clans/:id/invite { handle | userId }`. Si se envía `email` → 400 "Ahora se busca a los jugadores por su @nickname. Actualiza la app".
- Las siguientes respuestas incluyen el nickname:
  - el usuario de la sesión, en `user.handle`;
  - `GET /me`;
  - los amigos, en `otherHandle`;
  - los miembros y el líder del clan, en `handle`;
  - los visitantes del hábitat y `habitat:visitor_joined`, en `visitorHandle`;
  - el panel (`/admin/users`, que también busca por nickname).

## Cuentas existentes
La migración deja `handle = NULL`. Las apps detectan `handle === null` en `/me` (un `null` explícito; si el campo no llega no se pide nada) y muestran la pantalla obligatoria **"Elige tu nickname"**, con confirmación porque es para siempre. Si la cuenta también tiene que verificar el correo, primero se pide la verificación.

El flag `HANDLE_REQUIRED=true` hace que el servidor responda 403 `{ code: "HANDLE_REQUIRED" }` a las cuentas sin nickname, salvo en las rutas `@AllowUnverified()`. Así se obliga también a quien usa una versión antigua de la app. El despliegue sigue el mismo orden que la verificación de correo (ver `docs/DEPLOY.md` §11).
