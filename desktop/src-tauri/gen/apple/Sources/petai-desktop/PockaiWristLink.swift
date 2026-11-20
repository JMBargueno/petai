// El puente con el Apple Watch, en el proceso del iPhone (spec 44).
//
// El reloj no habla con el backend: el iPhone le manda un resumen y él le devuelve intenciones.
// Aquí no hay ni una regla del juego. Qué enseñar lo decide `wrist.rs` en el núcleo (`pockai_wrist_push`,
// `pockai_wrist_snapshot`) y qué hacer con un botón también (`pockai_wrist_perform`): esto solo mueve
// JSON de un lado a otro.
//
// Por qué el delegado vive aquí y no en el webview: cuando el reloj manda un mensaje, el sistema
// despierta **el proceso**, y el webview puede no estar vivo. El núcleo en Rust sí lo está, igual que
// con el `BGAppRefreshTask` de `PockaiBackground.swift`.

import Foundation

#if canImport(WatchConnectivity)
import WatchConnectivity
#endif

// Las funciones de `crates/tauri-plugin-pockai/src/ios.rs`. Con `@_silgen_name` para no depender del
// bridging header, que es un fichero que `tauri ios init` sobrescribiría.
@_silgen_name("pockai_wrist_push")
private func pockai_wrist_push() -> UnsafeMutablePointer<CChar>?

@_silgen_name("pockai_wrist_snapshot")
private func pockai_wrist_snapshot() -> UnsafeMutablePointer<CChar>?

@_silgen_name("pockai_wrist_perform")
private func pockai_wrist_perform(_ request: UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>?

@_silgen_name("pockai_wrist_forget")
private func pockai_wrist_forget()

@_silgen_name("pockai_string_free")
private func pockai_wrist_string_free(_ ptr: UnsafeMutablePointer<CChar>?)

/// Llama al núcleo y devuelve lo que diga, ya liberado por nuestra parte.
private func wristCoreString(_ call: () -> UnsafeMutablePointer<CChar>?) -> Data? {
    guard let ptr = call() else { return nil }
    defer { pockai_wrist_string_free(ptr) }
    return String(cString: ptr).data(using: .utf8)
}

#if canImport(WatchConnectivity)

/// El enlace con el reloj. Uno por proceso: `WCSession` es un singleton del sistema.
final class PockaiWristLink: NSObject, WCSessionDelegate {
    static let shared = PockaiWristLink()

    private override init() { super.init() }

    /// Enciende la sesión. Si el aparato no puede emparejarse con un reloj (un iPad, por ejemplo) no
    /// hace nada: no es un error.
    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.delegate !== self else { return }
        session.delegate = self
        session.activate()
    }

    /// Le manda al reloj el resumen de ahora, **si cambió algo que se vea**. Lo decide el núcleo:
    /// `pockai_wrist_push` devuelve nulo cuando no hay nada nuevo.
    ///
    /// Se llama en cada cambio de estado con la app abierta (desde `pockaiSurfacesRefresh`) y en cada
    /// pasada en segundo plano. Sin reloj emparejado no cuesta nada: el contexto se queda guardado y
    /// el sistema lo entrega cuando aparezca uno.
    func push() {
        guard WCSession.isSupported() else { return }
        guard let data = wristCoreString({ pockai_wrist_push() }) else { return }
        send(snapshot: data, complication: true)
    }

    /// Manda el resumen de ahora sin preguntar si cambió. Para cuando el reloj lo pide él.
    private func pushNow() -> Data? {
        wristCoreString { pockai_wrist_snapshot() }
    }

    /// El contexto de aplicación es «el último gana»: si el reloj está apagado, el sistema guarda
    /// este y entrega solo este. Es justo lo que queremos de un resumen.
    private func send(snapshot: Data, complication: Bool) {
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        guard let text = String(data: snapshot, encoding: .utf8) else { return }

        do {
            try session.updateApplicationContext([PockaiWristKeys.snapshotField: text])
        } catch {
            NSLog("[pockai] no se pudo mandar el resumen al reloj: \(error.localizedDescription)")
        }

        // La complicación, aparte y con cuentagotas: el presupuesto diario es corto. Y aunque hay
        // informes de que esto no refresca las complicaciones de WidgetKit, el reloj no depende de
        // ello: se redibuja al recibir el contexto.
        guard complication, session.isComplicationEnabled, session.remainingComplicationUserInfoTransfers > 0 else { return }
        session.transferCurrentComplicationUserInfo([PockaiWristKeys.snapshotField: text])
    }

    // MARK: - Lo que llega del reloj

    /// El reloj pide un resumen fresco (acaba de abrirse), o manda una intención. Las dos cosas
    /// despiertan este proceso, así que aquí el núcleo está vivo aunque la app estuviera cerrada.
    private func handle(_ message: [String: Any]) -> [String: Any] {
        if message[PockaiWristKeys.refreshField] != nil {
            // Si el reloj no tenía nada guardado, el siguiente contexto tiene que salir sí o sí.
            pockai_wrist_forget()
            guard let data = pushNow(), let text = String(data: data, encoding: .utf8) else { return [:] }
            return [PockaiWristKeys.snapshotField: text]
        }

        guard let body = message[PockaiWristKeys.requestField] as? String else { return [:] }
        let result = body.withCString { pointer in
            wristCoreString { pockai_wrist_perform(pointer) }
        }
        guard let result, let text = String(data: result, encoding: .utf8) else { return [:] }

        // Lo que acaba de pasar también cambia lo que ve la complicación.
        push()
        return [PockaiWristKeys.resultField: text]
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if let error { NSLog("[pockai] la sesión con el reloj no se activó: \(error.localizedDescription)") }
        guard state == .activated else { return }
        push()
    }

    /// Un mensaje con respuesta: el reloj está esperando, así que se contesta siempre.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        replyHandler(handle(message))
    }

    /// Un mensaje sin respuesta.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        _ = handle(message)
    }

    /// La cola fiable: lo que el reloj mandó sin tener alcance. Puede entregar lo mismo dos veces,
    /// y de eso se encarga el `requestId` en el núcleo.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        _ = handle(userInfo)
    }

    /// El reloj se ha emparejado, o se ha cambiado de reloj: el nuevo no tiene nada guardado.
    func sessionWatchStateDidChange(_ session: WCSession) {
        pockai_wrist_forget()
        push()
    }

    // Obligatorios en iOS: al cambiar de reloj hay que reactivar la sesión.
    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }
}

#else

/// Sin WatchConnectivity (una plataforma que no la tiene) el enlace no hace nada.
enum PockaiWristLink {
    static let shared = PockaiWristLink.self
    static func activate() {}
    static func push() {}
}

#endif
