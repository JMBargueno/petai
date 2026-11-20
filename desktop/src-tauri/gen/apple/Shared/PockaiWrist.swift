// Los tipos que comparten el iPhone y el Apple Watch (spec 44).
//
// El reloj no tiene núcleo: lo que pinta es este resumen, que el iPhone le manda por
// WatchConnectivity, y lo que hace es mandar una intención de vuelta. Como ActivityKit con sus
// atributos, los dos lados necesitan **el mismo tipo**, así que vive en `Shared/` y lo compilan los
// cuatro targets (app, widgets de iOS, reloj y sus complicaciones) en lugar de duplicarse.
//
// Los nombres de los campos son el contrato con `crates/pockai-core/src/wrist.rs`. Si allí cambia
// uno, se cae el test `el_json_lleva_los_nombres_que_espera_swift` y el de Swift sobre el fixture
// `crates/pockai-core/tests/fixtures/wrist-snapshot.json`.

import Foundation
import SwiftUI

// MARK: - Dónde vive esto

enum PockaiWristKeys {
    /// El App Group del reloj: la app del reloj y sus complicaciones. **No es el del iPhone**: un
    /// App Group no cruza de dispositivo, son dos aparatos.
    static let watchAppGroup = "group.com.petai.app.watchkitapp"

    /// Dónde queda el último resumen, para que la complicación lo lea sin levantar la app.
    static let snapshotKey = "pockai.wrist.snapshot"

    /// Las claves de los mensajes de WatchConnectivity.
    static let snapshotField = "snapshot"
    static let requestField = "request"
    static let resultField = "result"
    /// Lo manda el reloj al abrirse para pedir un resumen fresco: despierta al iPhone.
    static let refreshField = "refresh"
}

// MARK: - El resumen

/// Una cuenta atrás con hora de fin conocida (`Surface` en `surfaces.rs`). La misma que alimenta la
/// Live Activity del iPhone.
struct PockaiWristSurface: Codable, Equatable, Identifiable {
    let id: String
    let kind: String
    let title: String
    let body: String
    /// Milisegundos desde la época.
    let endsAt: Int64
    let staleAt: Int64

    var endsAtDate: Date { Date(timeIntervalSince1970: Double(endsAt) / 1000) }
}

/// La mascota activa vista desde la muñeca (`WristPet` en `wrist.rs`): el `PockaiPetGlance` que ya
/// comparten el widget de iOS y los avisos, más lo que solo el reloj necesita. Llega **plano** en el
/// JSON (Rust lo serializa con `#[serde(flatten)]`), así que aquí van todos los campos al mismo
/// nivel.
struct PockaiWristPet: Codable, Equatable {
    // Lo que viene de `PetGlance`.
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

    // Lo que solo mira el reloj.
    /// Con qué sprite se dibuja, junto con `stage`.
    let speciesId: String
    /// `baby`, `juvenile`, `adult` o `final`.
    let stage: String
    /// El Flujo de la especie, para teñir.
    let element: String
    let xp: Int
    let xpNeeded: Int
    let bonding: Int
    /// La constante que peor está. **La decide el núcleo**, no esta app.
    let lowest: String
    let lowestValue: Int

    /// Las cinco constantes en el orden en que se cuidan, para pintarlas sin repetir la lista.
    var vitals: [(key: String, value: Int)] {
        [("hunger", hunger), ("happiness", happiness), ("energy", energy), ("hygiene", hygiene), ("health", health)]
    }
}

/// Monedas y gemas (`WristWallet` en `wrist.rs`).
struct PockaiWristWallet: Codable, Equatable {
    let coins: Int
    let gems: Int
}

/// Un botón del reloj, ya decidido por el núcleo: si se puede pulsar y, si no, por qué.
struct PockaiWristButton: Codable, Equatable, Identifiable {
    /// `feed`, `clean`, `sleep`, `wake`, `heal` o `evolve`.
    let action: String
    let label: String
    let enabled: Bool
    /// El icono del set propio con el que se pinta. Viene como dato: aquí no se decide.
    let icon: String
    let disabledReason: String?
    /// Con qué se hace, cuando gasta un objeto (comer y curar). Lo eligió el núcleo.
    let itemId: String?
    let itemName: String?

    var id: String { action }
}

/// Lo que el iPhone le manda al reloj. Sin tokens y sin nada que identifique al usuario: viaja entre
/// dispositivos y se queda guardado en el reloj (hay un test en el núcleo que lo comprueba).
struct PockaiWristSnapshot: Codable, Equatable {
    /// La revisión del estado del núcleo. El reloj descarta un resumen con una `rev` menor que la
    /// que ya tiene: WatchConnectivity no garantiza el orden de entrega.
    let rev: UInt64
    let generatedAt: Int64
    let staleAt: Int64
    let signedIn: Bool
    let pet: PockaiWristPet?
    let wallet: PockaiWristWallet?
    let surfaces: [PockaiWristSurface]
    let buttons: [PockaiWristButton]

    var generatedAtDate: Date { Date(timeIntervalSince1970: Double(generatedAt) / 1000) }
    var staleAtDate: Date { Date(timeIntervalSince1970: Double(staleAt) / 1000) }

    /// Si las constantes vitales ya no son de fiar. Las cuentas atrás sí siguen valiendo: van con su
    /// hora de fin absoluta.
    func isStale(now: Date = Date()) -> Bool { now >= staleAtDate }

    /// La cuenta atrás que antes termina (la lista viene ordenada por el núcleo).
    var nextSurface: PockaiWristSurface? { surfaces.first }
}

// MARK: - Lo que manda el reloj

/// Una intención del reloj. El `requestId` evita actuar dos veces: la cola del sistema
/// (`transferUserInfo`) puede entregar el mismo mensaje otra vez tras un reinicio.
struct PockaiWristRequest: Codable, Equatable {
    let requestId: String
    /// `feed`, `clean`, `sleep`, `wake`, `heal` o `evolve`.
    let action: String
    /// Cuándo lo pulsó el jugador, en milisegundos desde la época. El núcleo descarta lo que llega
    /// muy tarde.
    let issuedAt: Int64

    init(action: String, requestId: String = UUID().uuidString, issuedAt: Date = Date()) {
        self.requestId = requestId
        self.action = action
        self.issuedAt = Int64(issuedAt.timeIntervalSince1970 * 1000)
    }
}

/// Lo que responde el iPhone: o se hizo, o no se hizo y dice por qué. En los dos casos viene un
/// resumen, así que el reloj nunca se queda con la pantalla a medias.
struct PockaiWristResult: Decodable {
    let ok: PockaiWristSnapshot?
    let message: String?
    let snapshot: PockaiWristSnapshot?

    /// El resumen que toca pintar, venga como venga la respuesta.
    var latest: PockaiWristSnapshot? { ok ?? snapshot }
}

// MARK: - La complicación

/// Lo mínimo para la esfera (`WristComplication` en `wrist.rs`).
struct PockaiWristComplication: Codable, Equatable {
    let name: String?
    let mood: String?
    /// `hunger`, `happiness`, `energy`, `hygiene` o `health`.
    let lowest: String?
    let lowestValue: Int?
    let endsAt: Int64?
    let staleAt: Int64

    var endsAtDate: Date? { endsAt.map { Date(timeIntervalSince1970: Double($0) / 1000) } }
}

// MARK: - El arte

/// Con qué se dibuja el reloj: el **set de iconos propio** de la casa
/// (`shared/ui/src/icons`, horneado al catálogo por `scripts/generate-watch-assets.ts`) y los
/// sprites de pixel art de los Pockais.
///
/// Todo pasa por aquí, y todo tiene reserva: si una lámina no se horneó, cae al símbolo del sistema
/// que había antes, de modo que el reloj nunca se queda en blanco. Los nombres con barra son
/// carpetas con «provides-namespace» en el catálogo.
///
/// Aquí **no se decide nada**: qué icono lleva un botón lo manda el núcleo en `WristButton.icon`.
enum PockaiWristArt {
    /// Si el catálogo trae esta lámina. Las extensiones y la app llevan copias del mismo catálogo.
    private static func hay(_ name: String) -> Bool {
        #if canImport(UIKit)
        return UIImage(named: name) != nil
        #else
        return false
        #endif
    }

    /// Un icono del set propio, teñible como un símbolo del sistema, con su reserva.
    static func ui(_ name: String, fallback: String) -> Image {
        hay("ui/\(name)") ? Image("ui/\(name)").renderingMode(.template) : Image(systemName: fallback)
    }

    /// El sprite de la mascota, con la cara que le toca por su ánimo. Pixel art: sin interpolar.
    static func pockai(_ pet: PockaiWristPet) -> Image {
        let pose = moodPose(pet.mood)
        for name in ["pockai/\(pet.speciesId)_\(pet.stage)_\(pose)", "pockai/\(pet.speciesId)_\(pet.stage)_idle"] {
            if hay(name) { return Image(name).renderingMode(.original) }
        }
        return mood(pet.mood)
    }

    /// El `mood` que decide `care.rs` y la animación que le corresponde en la hoja de la especie.
    static func moodPose(_ mood: String) -> String {
        switch mood {
        case "sick": return "sick"
        case "sleeping": return "sleep"
        case "hungry": return "hungry"
        case "sad": return "sad"
        default: return "idle"
        }
    }

    /// El ánimo cuando no hay sprite que valga (una familia de complicación diminuta, por ejemplo).
    static func mood(_ mood: String?) -> Image {
        switch mood {
        case "sick": return ui("health", fallback: "thermometer.medium")
        case "sleeping": return ui("sleep", fallback: "moon.zzz.fill")
        case "hungry": return ui("hunger", fallback: "fork.knife")
        case "sad": return ui("happiness", fallback: "cloud.rain.fill")
        default: return ui("pet", fallback: "face.smiling.fill")
        }
    }

    /// El icono de una constante vital.
    static func stat(_ key: String) -> Image {
        switch key {
        case "hunger": return ui("hunger", fallback: "fork.knife")
        case "happiness": return ui("happiness", fallback: "face.smiling")
        case "energy": return ui("energy", fallback: "bolt.fill")
        case "hygiene": return ui("hygiene", fallback: "drop.fill")
        case "health": return ui("health", fallback: "cross.case.fill")
        default: return Image(systemName: "circle")
        }
    }

    static func statLabel(_ key: String) -> String {
        switch key {
        case "hunger": return "Hambre"
        case "happiness": return "Ánimo"
        case "energy": return "Energía"
        case "hygiene": return "Aseo"
        case "health": return "Salud"
        default: return key
        }
    }

    /// El icono de un botón. El nombre lo manda el núcleo; aquí solo se busca y se da su reserva.
    static func action(_ icon: String) -> Image {
        let fallbacks = [
            "feed": "fork.knife", "clean": "drop.fill", "sleep": "moon.fill",
            "wake": "sun.max.fill", "heal": "cross.case.fill", "evolve": "sparkles",
        ]
        return ui(icon, fallback: fallbacks[icon] ?? "hand.tap.fill")
    }

    /// El objeto con el que se hace la acción (una manzana, un elixir). Pixel art de 32 px.
    static func item(_ id: String?) -> Image? {
        guard let id, hay("item/\(id)") else { return nil }
        return Image("item/\(id)").renderingMode(.original)
    }

    /// El icono de una cuenta atrás. El huevo es el mismo `hatch` de la subsección de Eclosión: dos
    /// huevos casi iguales en el set no ayudarían a nadie.
    ///
    /// La reserva **no** es `egg.fill`, que no existe en watchOS y dejaba el hueco en blanco.
    static func surface(_ kind: String) -> Image {
        switch kind {
        case "eggHatching": return ui("hatch", fallback: "oval.fill")
        default: return Image(systemName: "hourglass")
        }
    }

    /// Cuando no hay nada que enseñar.
    static var away: Image { ui("pet", fallback: "pawprint.fill") }

    /// El color del Flujo de la especie, del catálogo; si falta, el acento de la app.
    static func element(_ element: String) -> Color {
        #if canImport(UIKit)
        if UIColor(named: "element/\(element)") != nil { return Color("element/\(element)") }
        #endif
        return .accentColor
    }
}
