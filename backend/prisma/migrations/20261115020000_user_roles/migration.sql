-- AlterTable: rol de autorización (RBAC). Los usuarios existentes quedan como 'user'.
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';

-- Solo se admiten los roles conocidos (el schema usa String, no enum de Prisma).
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('superadmin', 'admin', 'moderator', 'user'));

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");
