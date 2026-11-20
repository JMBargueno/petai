// GENERADO por .claude/skills/pockai-ui-icons-architect/scripts/build_icons.mjs. No editar a mano.
import petOutline from './pet.outline.svg?raw';
import petDuo from './pet.duo.svg?raw';
import playOutline from './play.outline.svg?raw';
import playDuo from './play.duo.svg?raw';
import chatOutline from './chat.outline.svg?raw';
import chatDuo from './chat.duo.svg?raw';
import socialOutline from './social.outline.svg?raw';
import socialDuo from './social.duo.svg?raw';
import progressOutline from './progress.outline.svg?raw';
import progressDuo from './progress.duo.svg?raw';
import shopOutline from './shop.outline.svg?raw';
import shopDuo from './shop.duo.svg?raw';
import settingsOutline from './settings.outline.svg?raw';
import settingsDuo from './settings.duo.svg?raw';
import homeOutline from './home.outline.svg?raw';
import homeDuo from './home.duo.svg?raw';
import backpackOutline from './backpack.outline.svg?raw';
import backpackDuo from './backpack.duo.svg?raw';
import hatchOutline from './hatch.outline.svg?raw';
import hatchDuo from './hatch.duo.svg?raw';
import bondingOutline from './bonding.outline.svg?raw';
import bondingDuo from './bonding.duo.svg?raw';
import mindOutline from './mind.outline.svg?raw';
import mindDuo from './mind.duo.svg?raw';
import habitatOutline from './habitat.outline.svg?raw';
import habitatDuo from './habitat.duo.svg?raw';
import wardrobeOutline from './wardrobe.outline.svg?raw';
import wardrobeDuo from './wardrobe.duo.svg?raw';
import skillsOutline from './skills.outline.svg?raw';
import skillsDuo from './skills.duo.svg?raw';
import agentOutline from './agent.outline.svg?raw';
import agentDuo from './agent.duo.svg?raw';
import feedOutline from './feed.outline.svg?raw';
import feedDuo from './feed.duo.svg?raw';
import gamesOutline from './games.outline.svg?raw';
import gamesDuo from './games.duo.svg?raw';
import arenaOutline from './arena.outline.svg?raw';
import arenaDuo from './arena.duo.svg?raw';
import raidOutline from './raid.outline.svg?raw';
import raidDuo from './raid.duo.svg?raw';
import tournamentOutline from './tournament.outline.svg?raw';
import tournamentDuo from './tournament.duo.svg?raw';
import trainingOutline from './training.outline.svg?raw';
import trainingDuo from './training.duo.svg?raw';
import cookingOutline from './cooking.outline.svg?raw';
import cookingDuo from './cooking.duo.svg?raw';
import adventureOutline from './adventure.outline.svg?raw';
import adventureDuo from './adventure.duo.svg?raw';
import profileOutline from './profile.outline.svg?raw';
import profileDuo from './profile.duo.svg?raw';
import friendsOutline from './friends.outline.svg?raw';
import friendsDuo from './friends.duo.svg?raw';
import clansOutline from './clans.outline.svg?raw';
import clansDuo from './clans.duo.svg?raw';
import visitsOutline from './visits.outline.svg?raw';
import visitsDuo from './visits.duo.svg?raw';
import missionsOutline from './missions.outline.svg?raw';
import missionsDuo from './missions.duo.svg?raw';
import seasonsOutline from './seasons.outline.svg?raw';
import seasonsDuo from './seasons.duo.svg?raw';
import storeOutline from './store.outline.svg?raw';
import storeDuo from './store.duo.svg?raw';
import chestsOutline from './chests.outline.svg?raw';
import chestsDuo from './chests.duo.svg?raw';
import accountOutline from './account.outline.svg?raw';
import accountDuo from './account.duo.svg?raw';
import notificationsOutline from './notifications.outline.svg?raw';
import notificationsDuo from './notifications.duo.svg?raw';
import soundOutline from './sound.outline.svg?raw';
import soundDuo from './sound.duo.svg?raw';
import desktopOutline from './desktop.outline.svg?raw';
import desktopDuo from './desktop.duo.svg?raw';
import aboutOutline from './about.outline.svg?raw';
import aboutDuo from './about.duo.svg?raw';

export interface UiIconPair { outline: string; duo: string }

/** Set de iconos de interfaz: outline (inactivo) y duotone (activo). Nombres: ver icon-defs.mjs. */
export const UI_ICONS: Record<string, UiIconPair> = {
  'pet': { outline: petOutline, duo: petDuo },
  'play': { outline: playOutline, duo: playDuo },
  'chat': { outline: chatOutline, duo: chatDuo },
  'social': { outline: socialOutline, duo: socialDuo },
  'progress': { outline: progressOutline, duo: progressDuo },
  'shop': { outline: shopOutline, duo: shopDuo },
  'settings': { outline: settingsOutline, duo: settingsDuo },
  'home': { outline: homeOutline, duo: homeDuo },
  'backpack': { outline: backpackOutline, duo: backpackDuo },
  'hatch': { outline: hatchOutline, duo: hatchDuo },
  'bonding': { outline: bondingOutline, duo: bondingDuo },
  'mind': { outline: mindOutline, duo: mindDuo },
  'habitat': { outline: habitatOutline, duo: habitatDuo },
  'wardrobe': { outline: wardrobeOutline, duo: wardrobeDuo },
  'skills': { outline: skillsOutline, duo: skillsDuo },
  'agent': { outline: agentOutline, duo: agentDuo },
  'feed': { outline: feedOutline, duo: feedDuo },
  'games': { outline: gamesOutline, duo: gamesDuo },
  'arena': { outline: arenaOutline, duo: arenaDuo },
  'raid': { outline: raidOutline, duo: raidDuo },
  'tournament': { outline: tournamentOutline, duo: tournamentDuo },
  'training': { outline: trainingOutline, duo: trainingDuo },
  'cooking': { outline: cookingOutline, duo: cookingDuo },
  'adventure': { outline: adventureOutline, duo: adventureDuo },
  'profile': { outline: profileOutline, duo: profileDuo },
  'friends': { outline: friendsOutline, duo: friendsDuo },
  'clans': { outline: clansOutline, duo: clansDuo },
  'visits': { outline: visitsOutline, duo: visitsDuo },
  'missions': { outline: missionsOutline, duo: missionsDuo },
  'seasons': { outline: seasonsOutline, duo: seasonsDuo },
  'store': { outline: storeOutline, duo: storeDuo },
  'chests': { outline: chestsOutline, duo: chestsDuo },
  'account': { outline: accountOutline, duo: accountDuo },
  'notifications': { outline: notificationsOutline, duo: notificationsDuo },
  'sound': { outline: soundOutline, duo: soundDuo },
  'desktop': { outline: desktopOutline, duo: desktopDuo },
  'about': { outline: aboutOutline, duo: aboutDuo },
};

/** SVG de un icono en la variante pedida, o undefined si el set no lo tiene. */
export function uiIconSvg(name: string, active = false): string | undefined {
  const pair = UI_ICONS[name];
  return pair ? (active ? pair.duo : pair.outline) : undefined;
}
