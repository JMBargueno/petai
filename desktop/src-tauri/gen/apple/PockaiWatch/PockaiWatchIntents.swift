// «Oye Siri, dale de comer a mi Pockai» (spec 44).
//
// Un intent por acción, los mismos cuatro que se pueden pulsar con la mascota despierta. No hablan
// con el backend ni con el núcleo: mandan **la misma intención** que el botón por WatchConnectivity
// y el iPhone decide, igual que siempre. Aquí no hay ni una regla del juego.
//
// Lo que hace esto distinto de pulsar el botón, y es lo único delicado: **el sistema puede lanzar un
// intent con la app sin arrancar**, así que no hay `WCSession` activa ni resumen en pantalla. Por
// eso no se reutiliza `PockaiWatchStore` (que es `@MainActor` y vive con la vista): cada intent
// activa su propia sesión, **espera** a que termine de activarse y luego manda. Y lo que enseña lo
// lee del App Group, que es lo único que hay cuando la app está fría.

import AppIntents
import Foundation
import WatchConnectivity

// MARK: - El envío

/// Manda una intención del reloj al iPhone desde fuera de la vista, con la sesión recién activada.
///
/// Es un objeto de usar y tirar: se queda vivo mientras dura el envío (de ahí el `retener`), porque
/// `WCSession` guarda su delegado sin retenerlo.
private final class PockaiIntentSender: NSObject, WCSessionDelegate, @unchecked Sendable {
    private var continuacion: CheckedContinuation<Void, Never>?
    private static var retener: PockaiIntentSender?

    /// Qué pasó con la intención, para contárselo al usuario tal cual.
    enum Resultado {
        case hecho(String)
        case encolado
        case sinReloj
    }

    /// Activa la sesión y espera a que lo esté. Sin esto, un `sendMessage` desde una app fría se
    /// pierde: la sesión todavía no ha terminado de activarse.
    private func activar() async -> WCSession? {
        guard WCSession.isSupported() else { return nil }
        let session = WCSession.default
        if session.activationState == .activated { return session }
        Self.retener = self
        session.delegate = self
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            continuacion = c
            session.activate()
        }
        Self.retener = nil
        return session
    }

    func enviar(_ action: String) async -> Resultado {
        guard let session = await activar() else { return .sinReloj }
        let request = PockaiWristRequest(action: action)
        guard let body = try? JSONEncoder().encode(request), let text = String(data: body, encoding: .utf8) else {
            return .sinReloj
        }
        let payload = [PockaiWristKeys.requestField: text]

        // Sin alcance no se intenta: va a la cola del sistema, que sabe esperar, y el `requestId`
        // evita que se haga dos veces si se entrega repetida.
        guard session.isReachable else {
            session.transferUserInfo(payload)
            return .encolado
        }

        return await withCheckedContinuation { (c: CheckedContinuation<Resultado, Never>) in
            var contestado = false
            session.sendMessage(payload, replyHandler: { reply in
                guard !contestado else { return }
                contestado = true
                c.resume(returning: .hecho(Self.mensaje(de: reply)))
            }, errorHandler: { _ in
                guard !contestado else { return }
                contestado = true
                session.transferUserInfo(payload)
                c.resume(returning: .encolado)
            })
        }
    }

    /// Lo que conteste el iPhone: o el motivo por el que no se hizo, o cómo quedó la mascota.
    private static func mensaje(de reply: [String: Any]) -> String {
        guard let text = reply[PockaiWristKeys.resultField] as? String,
              let data = text.data(using: .utf8),
              let result = try? JSONDecoder().decode(PockaiWristResult.self, from: data)
        else { return "Hecho" }
        if let motivo = result.message { return motivo }
        guard let pet = result.latest?.pet else { return "Hecho" }
        return "\(pet.name): \(PockaiWristArt.statLabel(pet.lowest)) \(pet.lowestValue)"
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        continuacion?.resume()
        continuacion = nil
    }
}

/// Lo que todos los intents hacen igual.
private func realizar(_ action: String, hecho: String) async -> some IntentResult & ProvidesDialog {
    switch await PockaiIntentSender().enviar(action) {
    case .hecho(let detalle):
        return .result(dialog: IntentDialog("\(hecho). \(detalle)"))
    case .encolado:
        // No se miente: no está hecho, está en la cola del sistema hasta que el iPhone vuelva.
        return .result(dialog: IntentDialog("El iPhone no está a tiro: queda pendiente."))
    case .sinReloj:
        return .result(dialog: IntentDialog("Abre Pockai en el iPhone."))
    }
}

// MARK: - Los intents

struct FeedPockaiIntent: AppIntent {
    static var title: LocalizedStringResource = "Dar de comer"
    static var description = IntentDescription("Le da de comer a tu Pockai lo que el juego elija.")
    /// No abre la app: el sentido de pedírselo a Siri es no tener que mirar la pantalla.
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await realizar("feed", hecho: "Le he dado de comer")
    }
}

struct CleanPockaiIntent: AppIntent {
    static var title: LocalizedStringResource = "Bañar"
    static var description = IntentDescription("Baña a tu Pockai.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await realizar("clean", hecho: "Ya está limpio")
    }
}

struct PetPockaiIntent: AppIntent {
    static var title: LocalizedStringResource = "Acariciar"
    static var description = IntentDescription("Le hace un mimo a tu Pockai y sube el vínculo.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await realizar("pet", hecho: "Se deja mimar")
    }
}

struct SleepPockaiIntent: AppIntent {
    static var title: LocalizedStringResource = "Dormir"
    static var description = IntentDescription("Manda a dormir a tu Pockai.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await realizar("sleep", hecho: "A dormir")
    }
}

struct WakePockaiIntent: AppIntent {
    static var title: LocalizedStringResource = "Despertar"
    static var description = IntentDescription("Despierta a tu Pockai.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await realizar("wake", hecho: "Ya está despierto")
    }
}

struct HealPockaiIntent: AppIntent {
    static var title: LocalizedStringResource = "Curar"
    static var description = IntentDescription("Le da una medicina a tu Pockai.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await realizar("heal", hecho: "Curado")
    }
}

// MARK: - Los atajos

/// Para que salgan en Atajos y se puedan decir sin configurar nada. Las frases llevan
/// `.applicationName` porque Siri necesita saber a qué app se le está hablando.
struct PockaiWatchShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: FeedPockaiIntent(),
            phrases: ["Dale de comer en \(.applicationName)", "Alimenta a mi Pockai en \(.applicationName)"],
            shortTitle: "Dar de comer",
            systemImageName: "fork.knife"
        )
        AppShortcut(
            intent: CleanPockaiIntent(),
            phrases: ["Baña a mi Pockai en \(.applicationName)"],
            shortTitle: "Bañar",
            systemImageName: "drop.fill"
        )
        AppShortcut(
            intent: PetPockaiIntent(),
            phrases: ["Acaricia a mi Pockai en \(.applicationName)", "Hazle un mimo a mi Pockai en \(.applicationName)"],
            shortTitle: "Acariciar",
            systemImageName: "hand.raised.fill"
        )
        AppShortcut(
            intent: SleepPockaiIntent(),
            phrases: ["Manda a dormir a mi Pockai en \(.applicationName)"],
            shortTitle: "Dormir",
            systemImageName: "moon.fill"
        )
        AppShortcut(
            intent: WakePockaiIntent(),
            phrases: ["Despierta a mi Pockai en \(.applicationName)"],
            shortTitle: "Despertar",
            systemImageName: "sun.max.fill"
        )
        AppShortcut(
            intent: HealPockaiIntent(),
            phrases: ["Cura a mi Pockai en \(.applicationName)"],
            shortTitle: "Curar",
            systemImageName: "cross.case.fill"
        )
    }
}
