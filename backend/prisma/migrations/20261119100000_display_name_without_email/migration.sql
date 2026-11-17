-- El registro antiguo ponía como nombre visible la parte local del correo, que se mostraba a amigos y
-- clanes. Se sustituye por el nickname (o por un nombre genérico si la cuenta aún no lo tiene).
UPDATE "User"
SET "displayName" = COALESCE("handle", 'Entrenador')
WHERE "displayName" = LEFT(SPLIT_PART("email", '@', 1), 50);
