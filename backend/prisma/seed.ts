import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Iniciando Seed de datos de juego PetAI ---');

  const readJson = (relPath: string) => {
    const fullPath = path.resolve(__dirname, '../../shared/game-data', relPath);
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

  // Usuario Demo preconfigurado
  console.log('Creando usuario demo...');
  const argon2 = await import('argon2');
  const demoEmail = 'demo@petai.local';
  const demoPassword = 'Password123!';
  const passwordHash = await argon2.hash(demoPassword, {
    type: argon2.argon2id,
  });

  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      passwordHash,
      coins: 500,
      gems: 25,
    },
    create: {
      email: demoEmail,
      passwordHash,
      displayName: 'Entrenador Demo',
      coins: 500,
      gems: 25,
      pityCounter: {
        create: {
          sinceSuperRare: 0,
          sinceLegendary: 0,
        },
      },
    },
  });

  // Huevo de bienvenida listo para eclosionar si no tiene mascotas ni huevos
  const existingEggs = await prisma.egg.findMany({ where: { userId: demoUser.id } });
  if (existingEggs.length === 0) {
    await prisma.egg.create({
      data: {
        userId: demoUser.id,
        eggType: 'starter',
        startedAt: new Date(),
        hatchesAt: new Date(), // Eclosión inmediata
      },
    });
  }

  // Añadir manzanas de prueba al inventario
  await prisma.inventoryItem.upsert({
    where: {
      userId_itemId: { userId: demoUser.id, itemId: 'apple' },
    },
    update: { qty: 5 },
    create: {
      userId: demoUser.id,
      itemId: 'apple',
      qty: 5,
    },
  });

  console.log('✓ Usuario demo creado/actualizado: demo@petai.local / Password123!');
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
