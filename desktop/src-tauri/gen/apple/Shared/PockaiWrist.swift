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

/// Un botón del reloj, ya decidido por el núcleo: si se puede pulsar y, si no, por qué.
struct PockaiWristButton: Codable, Equatable, Identifiable {
    /// `feed`, `clean`, `sleep` o `wake`.
    let action: String
    let label: String
    let enabled: Bool
    let disabledReason: String?

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
    let pet: PockaiPetGlance?
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
    /// `feed`, `clean`, `sleep` o `wake`.
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

// MARK: - Iconos

/// Los símbolos del sistema con los que se pintan el ánimo y las constantes. Los mismos que el
/// widget de la pantalla de inicio de iOS, para que la muñeca y el teléfono no hablen idiomas
/// distintos. Sin sprites: una extensión no puede alojar un webview y hornear láminas para el reloj
/// sería trabajo de más (ver la desviación del paso 5.5).
enum PockaiWristSymbols {
    static func mood(_ mood: String?) -> String {
        switch mood {
        case "sick": return "thermometer.medium"
        case "sleeping": return "moon.zzz.fill"
        case "hungry": return "fork.knife"
        case "sad": return "cloud.rain.fill"
        default: return "face.smiling.fill"
        }
    }

    static func stat(_ key: String) -> String {
        switch key {
        case "hunger": return "fork.knife"
        case "happiness": return "face.smiling"
        case "energy": return "bolt.fill"
        case "hygiene": return "drop.fill"
        case "health": return "cross.case.fill"
        default: return "circle"
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

    static func action(_ action: String) -> String {
        switch action {
        case "feed": return "fork.knife"
        case "clean": return "drop.fill"
        case "sleep": return "moon.fill"
        case "wake": return "sun.max.fill"
        default: return "hand.tap.fill"
        }
    }

    static func surface(_ kind: String) -> String {
        switch kind {
        case "eggHatching": return "egg.fill"
        default: return "hourglass"
        }
    }
}
