import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parseEmails, promoteSuperadmins } from './promote-superadmin';

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
      // Los precios solo se fijan al crear el objeto: después se gestionan desde el panel de admin
      // y re-ejecutar el seed no debe pisarlos.
      update: {
        kind: food.kind,
        name: food.name,
        description: food.description,
        effects: food.effects,
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

  // Accesorios (spec 38): un Item de kind "accessory" por prenda. Las de logro van sin precio.
  const accessories = readJson('accessories.json').accessories;
  console.log(`Cargando ${accessories.length} accesorios...`);
  for (const acc of accessories) {
    const effects = { slot: acc.slot, rarity: acc.rarity, color: acc.color, unlock: acc.unlock.type };
    await prisma.item.upsert({
      where: { id: acc.id },
      // Igual que la comida: los precios solo se fijan al crear, para no pisar el panel de admin.
      // `kind` sí se actualiza: una prenda de logro pudo crearse antes como "cosmetic" genérico.
      update: {
        kind: 'accessory',
        name: acc.name,
        description: acc.description,
        effects,
      },
      create: {
        id: acc.id,
        kind: 'accessory',
        name: acc.name,
        description: acc.description,
        effects,
        priceCoins: acc.unlock.type === 'coins' ? acc.unlock.price : 0,
        priceGems: acc.unlock.type === 'gems' ? acc.unlock.price : 0,
      },
    });
  }

  // El usuario demo tiene una contraseña pública: jamás se crea en producción
  if (process.env.NODE_ENV === 'production') {
    console.log('✓ Catálogo cargado. Producción: no se crea el usuario demo.');
    return;
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
      // Nickname fijo: si ya lo tiene, reescribir el mismo valor no choca con el trigger de inmutabilidad.
      handle: 'entrenador_demo',
    },
    create: {
      email: demoEmail,
      passwordHash,
      displayName: 'Entrenador Demo',
      handle: 'entrenador_demo',
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
  // Bootstrap opcional de SuperAdmin(s) definidos en SUPERADMIN_EMAILS
  const superadmins = parseEmails(process.env.SUPERADMIN_EMAILS);
  if (superadmins.length) await promoteSuperadmins(prisma, superadmins);

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
