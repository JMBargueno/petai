-- Nickname público del jugador (@handle): único, en minúsculas, sin '@' e inmutable.
-- Las cuentas existentes quedan con NULL y lo eligen al entrar (POST /v1/me/handle).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "handle" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- Formato (mismo criterio que src/common/user-handle.ts): 3-20 caracteres a-z, 0-9, '_' y '.',
-- empieza por letra, sin '..' y sin punto final. Las palabras reservadas solo se validan en la API.
ALTER TABLE "User" ADD CONSTRAINT "User_handle_format_check" CHECK (
  "handle" IS NULL
  OR ("handle" ~ '^[a-z][a-z0-9_.]{2,19}$' AND "handle" NOT LIKE '%..%' AND "handle" NOT LIKE '%.')
);

-- Inmutabilidad: una vez fijado, el nickname no se puede cambiar ni vaciar (ni desde la API, ni desde
-- el panel, ni por un bug). Asignarlo por primera vez (NULL → valor) o reescribir el mismo valor sí se permite.
CREATE OR REPLACE FUNCTION "user_handle_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."handle" IS NOT NULL AND NEW."handle" IS DISTINCT FROM OLD."handle" THEN
    RAISE EXCEPTION 'El nickname no se puede cambiar una vez fijado' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_handle_immutable"
  BEFORE UPDATE OF "handle" ON "User"
  FOR EACH ROW EXECUTE FUNCTION "user_handle_immutable"();
