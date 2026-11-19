-- Disponibilidad de los objetos (shop / drop / hidden) y tope diario de drops de actividades (spec 41).

-- AlterTable
ALTER TABLE "Item" ADD COLUMN "availability" TEXT NOT NULL DEFAULT 'shop';

-- CreateTable
CREATE TABLE "DailyItemDrop" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyItemDrop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyItemDrop_userId_itemId_day_key" ON "DailyItemDrop"("userId", "itemId", "day");

-- AddForeignKey
ALTER TABLE "DailyItemDrop" ADD CONSTRAINT "DailyItemDrop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
