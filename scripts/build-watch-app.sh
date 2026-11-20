#!/usr/bin/env bash
# Compila la app del Apple Watch y la mete dentro de la app de iPhone (spec 44 §7).
#
#   scripts/build-watch-app.sh [--device] [--configuration debug|release]
#
# El reloj **no sale del `tauri ios build`**: ese comando llama a xcodebuild con un
# `-sdk iphonesimulator` global que pisa el SDKROOT de los targets de watchOS y los compila contra
# iOS («'accessoryCorner' is unavailable in iOS»). Por eso el reloj se compila aparte, aquí.
#
# Y hace falta copiarlo dentro del `.app` del iPhone: sin ese paso el iPhone ve `appInstalled: NO`
# en `WCSession`, no entrega el contexto, y el reloj se queda en «Abre Pockai en el iPhone» para
# siempre.
#
# El orden es: primero `tauri ios build`, luego esto.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$PWD
APPLE=$ROOT/desktop/src-tauri/gen/apple

SDK=watchsimulator
ARCH=arm64
CONFIG=debug
while [[ $# -gt 0 ]]; do
  case $1 in
    --device) SDK=watchos; shift ;;
    --configuration) CONFIG=$2; shift 2 ;;
    *) echo "uso: $0 [--device] [--configuration debug|release]" >&2; exit 2 ;;
  esac
done

BUILD=${POCKAI_WATCH_BUILD_DIR:-$(mktemp -d)/pockai-watch}

echo "==> Compilando PockaiWatch ($CONFIG, $SDK)"
xcodebuild -project "$APPLE/petai-desktop.xcodeproj" \
  -target PockaiWatch -configuration "$CONFIG" -sdk "$SDK" -arch "$ARCH" \
  SYMROOT="$BUILD" build >/dev/null

WATCH_APP=$BUILD/$CONFIG-$SDK/PockaiWatch.app
[[ -d $WATCH_APP ]] || { echo "no se generó $WATCH_APP" >&2; exit 1; }

# El `.app` del iPhone que dejó `tauri ios build`. Se coge el más reciente, que es el de la última
# compilación; si hay varios (simulador y dispositivo), manda la fecha.
HOST=$(find "$APPLE/build" -maxdepth 3 -name 'Pockai.app' -type d -print0 2>/dev/null \
  | xargs -0 ls -dt 2>/dev/null | head -1 || true)
if [[ -z ${HOST:-} ]]; then
  echo "no encuentro la app de iPhone. Compílala antes:" >&2
  echo "  pnpm --filter petai-desktop exec tauri ios build --debug --target aarch64-sim" >&2
  exit 1
fi

echo "==> Metiéndolo en $(basename "$(dirname "$HOST")")/$(basename "$HOST")"
rm -rf "$HOST/Watch"
mkdir -p "$HOST/Watch"
cp -R "$WATCH_APP" "$HOST/Watch/"

echo "✓ $HOST/Watch/PockaiWatch.app"
echo
echo "Para instalarlo en el simulador emparejado:"
echo "  xcrun simctl install <iPhone> \"$HOST\""
