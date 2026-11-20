// El estado de la app del reloj: lo que llegó del iPhone y lo que se le ha pedido (spec 44).
//
// Esto **no decide nada del juego**. No recalcula constantes, no proyecta el deterioro y no resuelve
// conflictos: guarda el último resumen que mandó el iPhone y manda intenciones. Lo único que calcula
// son las cuentas atrás, y eso es aritmética sobre una hora de fin absoluta.

import Foundation
import SwiftUI
import WatchConnectivity

#if canImport(WidgetKit)
import WidgetKit
#endif

@MainActor
final class PockaiWatchStore: NSObject, ObservableObject {
    /// El último resumen del iPhone, o `nil` si todavía no ha llegado ninguno.
    @Published private(set) var snapshot: PockaiWristSnapshot?
    /// La acción que se está mandando ahora mismo, para poner el botón en «enviando».
    @Published private(set) var sending: String?
    /// Las que se quedaron en la cola del sistema porque el iPhone no estaba a tiro.
    @Published private(set) var queued: Int = 0
    /// Lo último que hay que contarle al jugador (un error, o que quedó en cola).
    @Published var notice: String?
    /// Si se ha pedido el primer resumen y aún no ha llegado.
    @Published private(set) var waiting = true

    private let defaults = UserDefaults(suiteName: PockaiWristKeys.watchAppGroup)

    override init() {
        super.init()
        snapshot = loadStored()
        waiting = snapshot == nil
        activate()
    }

    private func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // MARK: - Pedir y recibir

    /// Pide un resumen fresco. Esto **despierta el proceso del iPhone**, así que es la única vía
    /// fiable de «refrescar ahora» sin push. Se llama al abrir la app y al volver a ella.
    func refresh() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        guard session.isReachable else {
            // Sin alcance no hay nada que pedir: lo que haya guardado es lo que hay.
            waiting = false
            return
        }
        session.sendMessage([PockaiWristKeys.refreshField: true], replyHandler: { [weak self] reply in
            Task { @MainActor in self?.apply(reply) }
        }, errorHandler: { [weak self] error in
            Task { @MainActor in
                self?.waiting = false
                NSLog("[pockai] el iPhone no contestó: \(error.localizedDescription)")
            }
        })
    }

    /// Guarda un resumen si es más nuevo que el que ya hay.
    ///
    /// WatchConnectivity no garantiza el orden de entrega, así que se compara `(rev, generatedAt)`:
    /// la revisión del estado primero y, a igualdad, la hora. Sin esto, un contexto que llega tarde
    /// podría devolver la pantalla a un estado anterior.
    private func accept(_ next: PockaiWristSnapshot) {
        waiting = false
        if let now = snapshot, (next.rev, next.generatedAt) < (now.rev, now.generatedAt) { return }
        snapshot = next
        store(next)
    }

    private func apply(_ message: [String: Any]) {
        if let text = message[PockaiWristKeys.snapshotField] as? String, let next = decode(text) {
            accept(next)
        }
        guard let text = message[PockaiWristKeys.resultField] as? String,
              let data = text.data(using: .utf8),
              let result = try? JSONDecoder().decode(PockaiWristResult.self, from: data)
        else { return }
        if let next = result.latest { accept(next) }
        if let message = result.message { notice = message }
    }

    private func decode(_ text: String) -> PockaiWristSnapshot? {
        guard let data = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(PockaiWristSnapshot.self, from: data)
    }

    // MARK: - Actuar

    /// Manda una intención al iPhone. Si no hay alcance, va a la cola del sistema, que la entrega
    /// cuando vuelva; el `requestId` evita que se haga dos veces.
    ///
    /// Lo que se ve **no se toca**: los números que pinta el reloj son los del iPhone, y hasta que
    /// no vuelva su respuesta siguen siendo los de antes.
    func perform(_ button: PockaiWristButton) {
        guard button.enabled, sending == nil, WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }

        let request = PockaiWristRequest(action: button.action)
        guard let body = try? JSONEncoder().encode(request), let text = String(data: body, encoding: .utf8) else { return }
        let payload = [PockaiWristKeys.requestField: text]

        guard session.isReachable else {
            session.transferUserInfo(payload)
            queued += 1
            notice = "Sin conexión con el iPhone: queda pendiente"
            return
        }

        sending = button.action
        session.sendMessage(payload, replyHandler: { [weak self] reply in
            Task { @MainActor in
                self?.sending = nil
                self?.apply(reply)
            }
        }, errorHandler: { [weak self] error in
            Task { @MainActor in
                self?.sending = nil
                // No se reintenta a mano: se deja en la cola del sistema, que sabe esperar.
                session.transferUserInfo(payload)
                self?.queued += 1
                self?.notice = "No llegó al iPhone: queda pendiente"
                NSLog("[pockai] no se pudo mandar la acción: \(error.localizedDescription)")
            }
        })
    }

    // MARK: - Lo que lee la complicación

    /// La complicación es otro proceso y no puede hablar con el iPhone: lee de aquí.
    private func store(_ snapshot: PockaiWristSnapshot) {
        guard let defaults, let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: PockaiWristKeys.snapshotKey)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    private func loadStored() -> PockaiWristSnapshot? {
        guard let data = defaults?.data(forKey: PockaiWristKeys.snapshotKey) else { return nil }
        return try? JSONDecoder().decode(PockaiWristSnapshot.self, from: data)
    }
}

// MARK: - WCSessionDelegate

extension PockaiWatchStore: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if let error { NSLog("[pockai] la sesión con el iPhone no se activó: \(error.localizedDescription)") }
        Task { @MainActor in self.refresh() }
    }

    /// El iPhone manda el resumen por aquí: «el último gana», que es justo lo que queremos.
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        Task { @MainActor in self.apply(context) }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        Task { @MainActor in self.apply(userInfo) }
    }

    /// Una intención que estaba en la cola ha salido ya hacia el iPhone.
    nonisolated func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?) {
        Task { @MainActor in
            if error == nil { self.queued = max(0, self.queued - 1) }
        }
    }
}
