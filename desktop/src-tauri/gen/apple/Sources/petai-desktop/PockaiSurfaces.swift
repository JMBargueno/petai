// Las superficies vivas en iOS: Live Activity (con su Dynamic Island) y el widget de la pantalla de
// inicio (spec 43, fase 5).
//
// Esto solo obedece: qué actividades abrir, actualizar o cerrar lo decide `surfaces.rs` en el núcleo
// y llega ya masticado en un `SurfaceDiff`. Aquí no hay ni un umbral ni una regla.
//
// **Sin push**: el backend no registra tokens de APNs, así que las actividades se piden con
// `pushType: nil` y la vista cuenta sola con `Text(timerInterval:)`. `staleDate` le dice al sistema
// cuándo dejar de fiarse de lo que enseña.

import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

#if canImport(WidgetKit)
import WidgetKit
#endif

enum PockaiSurfaces {
    /// Aplica las órdenes del núcleo. Lo que no se pueda (versión de iOS antigua, actividades
    /// desactivadas por el usuario) simplemente no se hace: no es un error de la app.
    static func apply(_ diff: SurfaceDiff) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            Task { await applyActivities(diff) }
        }
        #endif
        reloadWidgets()
    }

    /// Pide a la extensión que vuelva a dibujar el widget de la pantalla de inicio.
    static func reloadWidgets() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private static func applyActivities(_ diff: SurfaceDiff) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let live = Activity<PockaiActivityAttributes>.activities

        for id in diff.end {
            if let activity = live.first(where: { $0.attributes.surfaceID == id }) {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
        for surface in diff.update {
            if let activity = live.first(where: { $0.attributes.surfaceID == surface.id }) {
                let state = PockaiActivityAttributes.ContentState(title: surface.title, body: surface.body, endsAt: surface.endsAtDate)
                await activity.update(ActivityContent(state: state, staleDate: surface.staleAtDate))
            }
        }
        for surface in diff.start where !live.contains(where: { $0.attributes.surfaceID == surface.id }) {
            let attributes = PockaiActivityAttributes(surfaceID: surface.id, kind: surface.kind)
            let state = PockaiActivityAttributes.ContentState(title: surface.title, body: surface.body, endsAt: surface.endsAtDate)
            do {
                _ = try Activity.request(
                    attributes: attributes,
                    content: ActivityContent(state: state, staleDate: surface.staleAtDate),
                    pushType: nil
                )
            } catch {
                NSLog("[pockai] no se pudo abrir la actividad \(surface.id): \(error.localizedDescription)")
            }
        }
    }
    #endif
}
