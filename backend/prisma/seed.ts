import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Iniciando Seed de datos de juego PetAI ---');

  const readJson = (relPath: string) => {
    const fullPath = path.resolve(__dirname, '../../../shared/game-data', relPath);
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  };

  const species = readJson('species.json');
  const patterns = readJson('patterns.json');
  const foods = readJson('foods.json');

  console.log(`Cargando ${species.length} especies...`);
  for (const sp of species) {
    await prisma.species.upsert({
      where: { id: sp.id },
      update: {
        name: sp.name,
        description: sp.description,
        element: sp.element,
        rarity: sp.rarity,
        baseStats: sp.baseStats,
        favoriteFood: sp.favoriteFood,
        spriteKey: sp.spriteKey,
        defaultPalette: sp.defaultPalette,
      },
      create: {
        id: sp.id,
        name: sp.name,
        description: sp.description,
        element: sp.element,
        rarity: sp.rarity,
        baseStats: sp.baseStats,
        favoriteFood: sp.favoriteFood,
        spriteKey: sp.spriteKey,
        defaultPalette: sp.defaultPalette,
      },
    });
  }

  console.log(`Cargando ${patterns.length} patrones...`);
  for (const pat of patterns) {
    await prisma.pattern.upsert({
      where: { id: pat.id },
      update: {
        name: pat.name,
        description: pat.description,
        minRarity: pat.minRarity,
      },
      create: {
        id: pat.id,
        name: pat.name,
        description: pat.description,
        minRarity: pat.minRarity,
      },
    });
  }

  console.log(`Cargando ${foods.length} alimentos/medicinas...`);
  for (const food of foods) {
    await prisma.item.upsert({
      where: { id: food.id },
      update: {
        kind: food.kind,
        name: food.name,
        description: food.description,
        effects: food.effects,
        priceCoins: food.priceCoins,
        priceGems: food.priceGems,
      },
      create: {
        id: food.id,
        kind: food.kind,
        name: food.name,
        description: food.description,
        effects: food.effects,
        priceCoins: food.priceCoins,
        priceGems: food.priceGems,
      },
    });
  }

  console.log('✓ Seed completado con éxito.');
}

main()
  .catch((e) => {
    console.error('Error durante seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
