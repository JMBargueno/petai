// Los tipos que comparten la app y la extensión del widget.
//
// ActivityKit exige **el mismo tipo en los dos procesos**: la app pide la actividad y la extensión
// la dibuja, y si los `ActivityAttributes` no coinciden, la actividad no aparece. Por eso este
// fichero está en `Shared/` y lo compilan los dos targets, en lugar de duplicarlo.

import Foundation

#if canImport(ActivityKit)
import ActivityKit

/// Una actividad viva de Pockai. Lo fijo va en los atributos; lo que cambia, en el estado.
struct PockaiActivityAttributes: ActivityAttributes {
    /// Lo que cambia mientras la actividad está abierta.
    struct ContentState: Codable, Hashable {
        let title: String
        let body: String
        /// Cuándo termina. La vista cuenta sola con esto (`Text(timerInterval:)`), así que la cuenta
        /// atrás sigue avanzando con la app suspendida y sin push.
        let endsAt: Date
    }

    /// El `Surface.id` del núcleo (`egg:<id>`). Es la clave para actualizar o cerrar la actividad.
    let surfaceID: String
    /// El `SurfaceKind` del núcleo, en texto (`eggHatching`). Decide el icono.
    let kind: String
}
#endif

/// El resumen de la mascota que el núcleo deja en el App Group para el widget de la pantalla de
/// inicio (`PetGlance` en `care.rs`). La extensión no puede llamar al núcleo: solo lee esto.
struct PockaiPetGlance: Codable, Equatable {
    let name: String
    let level: Int
    /// `sick`, `sleeping`, `hungry`, `sad` o `happy`.
    let mood: String
    let moodLabel: String
    let hunger: Int
    let happiness: Int
    let energy: Int
    let hygiene: Int
    let health: Int

    /// Lo que la app dejó guardado, o `nil` si no hay sesión o no hay mascota.
    static func load(appGroup: String, key: String) -> PockaiPetGlance? {
        guard let store = UserDefaults(suiteName: appGroup), let data = store.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(PockaiPetGlance.self, from: data)
    }
}
