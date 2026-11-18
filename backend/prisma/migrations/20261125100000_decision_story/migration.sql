-- Aventura diaria (DecisionStoryGenerator): bucket diario de historias globales generadas por la IA
-- del sistema, votos de la comunidad por opción y la partida de cada usuario con sus respuestas.

-- CreateTable
CREATE TABLE "DecisionStory" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL,
    "scenes" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "seedId" TEXT,
    "rerunOfId" TEXT,
    "arcKey" TEXT,
    "arcChapter" INTEGER NOT NULL DEFAULT 0,
    "parentStoryId" TEXT,
    "closesArc" BOOLEAN NOT NULL DEFAULT false,
    "canon" JSONB,
    "canonSummary" TEXT,
    "closedAt" TIMESTAMP(3),
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionStoryTally" (
    "storyId" TEXT NOT NULL,
    "sceneIndex" INTEGER NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DecisionStoryTally_pkey" PRIMARY KEY ("storyId","sceneIndex","optionIndex")
);

-- CreateTable
CREATE TABLE "DecisionStoryPlay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "localDay" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "answers" INTEGER[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "outcome" TEXT,
    "score" DOUBLE PRECISION,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "coinsAwarded" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DecisionStoryPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisionStory_day_slot_key" ON "DecisionStory"("day", "slot");

-- CreateIndex
CREATE INDEX "DecisionStory_arcKey_arcChapter_idx" ON "DecisionStory"("arcKey", "arcChapter");

-- CreateIndex
CREATE INDEX "DecisionStory_source_day_idx" ON "DecisionStory"("source", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionStoryPlay_userId_storyId_key" ON "DecisionStoryPlay"("userId", "storyId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionStoryPlay_userId_localDay_ordinal_key" ON "DecisionStoryPlay"("userId", "localDay", "ordinal");

-- CreateIndex
CREATE INDEX "DecisionStoryPlay_userId_startedAt_idx" ON "DecisionStoryPlay"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "DecisionStoryTally" ADD CONSTRAINT "DecisionStoryTally_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "DecisionStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionStoryPlay" ADD CONSTRAINT "DecisionStoryPlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionStoryPlay" ADD CONSTRAINT "DecisionStoryPlay_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionStoryPlay" ADD CONSTRAINT "DecisionStoryPlay_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "DecisionStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
