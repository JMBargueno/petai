// La extensión que dibuja lo que se ve de Pockai fuera de la app: el widget de la pantalla de
// inicio y la Live Activity con su Dynamic Island (spec 43, fase 5).
//
// Este proceso **no puede llamar al núcleo ni alojar un webview**: solo lee el resumen que la app
// deja en el App Group (`PockaiPetGlance`) y el estado que ActivityKit le entrega. Ninguna regla
// del juego vive aquí.

import SwiftUI
import WidgetKit

#if canImport(ActivityKit)
import ActivityKit
#endif

private let appGroup = "group.com.petai.app"
private let widgetKey = "pockai.widget"

// MARK: - Widget de la pantalla de inicio

struct PetEntry: TimelineEntry {
    let date: Date
    let glance: PockaiPetGlance?
}

struct PetProvider: TimelineProvider {
    func placeholder(in context: Context) -> PetEntry {
        PetEntry(date: Date(), glance: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (PetEntry) -> Void) {
        completion(PetEntry(date: Date(), glance: PockaiPetGlance.load(appGroup: appGroup, key: widgetKey)))
    }

    /// Una sola entrada: lo que haya ahora. Quien la refresca es la app (al cambiar la mascota o en
    /// cada pasada en segundo plano) con `WidgetCenter.reloadAllTimelines()`, no un temporizador:
    /// sin push, adivinar cuándo cambia algo solo gastaría batería.
    func getTimeline(in context: Context, completion: @escaping (Timeline<PetEntry>) -> Void) {
        let entry = PetEntry(date: Date(), glance: PockaiPetGlance.load(appGroup: appGroup, key: widgetKey))
        completion(Timeline(entries: [entry], policy: .never))
    }
}

/// El icono del ánimo. Los mismos cinco estados que decide `care.rs`.
private func moodSymbol(_ mood: String) -> String {
    switch mood {
    case "sick": return "thermometer.medium"
    case "sleeping": return "moon.zzz.fill"
    case "hungry": return "fork.knife"
    case "sad": return "cloud.rain.fill"
    default: return "face.smiling.fill"
    }
}

struct PetWidgetView: View {
    let entry: PetEntry

    var body: some View {
        if let glance = entry.glance {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: moodSymbol(glance.mood))
                    Text(glance.name).font(.headline).lineLimit(1)
                    Spacer()
                    Text("Nv. \(glance.level)").font(.caption).foregroundStyle(.secondary)
                }
                Text(glance.moodLabel).font(.caption).foregroundStyle(.secondary)
                Grid(horizontalSpacing: 8, verticalSpacing: 4) {
                    GridRow {
                        Stat(symbol: "fork.knife", value: glance.hunger)
                        Stat(symbol: "face.smiling", value: glance.happiness)
                    }
                    GridRow {
                        Stat(symbol: "bolt.fill", value: glance.energy)
                        Stat(symbol: "drop.fill", value: glance.hygiene)
                    }
                }
            }
            .padding(12)
        } else {
            VStack(spacing: 6) {
                Image(systemName: "pawprint.fill").font(.title2)
                Text("Abre Pockai").font(.caption)
            }
            .foregroundStyle(.secondary)
        }
    }
}

/// Una constante con su icono y su barra.
private struct Stat: View {
    let symbol: String
    let value: Int

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbol).font(.caption2).frame(width: 12)
            ProgressView(value: Double(max(0, min(100, value))), total: 100)
                .progressViewStyle(.linear)
        }
    }
}

struct PetWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PockaiPetWidget", provider: PetProvider()) { entry in
            if #available(iOS 17.0, *) {
                PetWidgetView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
            } else {
                PetWidgetView(entry: entry).padding()
            }
        }
        .configurationDisplayName("Tu Pockai")
        .description("Cómo está tu Pockai, de un vistazo.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Live Activity y Dynamic Island

#if canImport(ActivityKit)
@available(iOS 16.2, *)
struct PockaiLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PockaiActivityAttributes.self) { context in
            // Pantalla de bloqueo y banner.
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Label(context.state.title, systemImage: symbol(context.attributes.kind))
                        .font(.headline)
                        .lineLimit(1)
                        // Que ceda el título, no el contador: si el reloj se queda sin sitio, iOS lo
                        // pinta como «4:--» en lugar de los minutos y segundos.
                        .layoutPriority(0)
                    Spacer(minLength: 0)
                    Text(timerInterval: Date()...context.state.endsAt, countsDown: true)
                        .monospacedDigit()
                        .font(.headline)
                        .multilineTextAlignment(.trailing)
                        .frame(minWidth: 72, alignment: .trailing)
                        .fixedSize()
                        .layoutPriority(1)
                }
                Text(context.state.body).font(.caption).foregroundStyle(.secondary)
                ProgressView(timerInterval: Date()...context.state.endsAt, countsDown: true)
                    .tint(.purple)
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.4))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: symbol(context.attributes.kind)).font(.title2)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date()...context.state.endsAt, countsDown: true)
                        .monospacedDigit()
                        .multilineTextAlignment(.trailing)
                        .frame(minWidth: 64, alignment: .trailing)
                        .fixedSize()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.state.title).font(.headline)
                        ProgressView(timerInterval: Date()...context.state.endsAt, countsDown: true)
                            .tint(.purple)
                    }
                }
            } compactLeading: {
                Image(systemName: symbol(context.attributes.kind))
            } compactTrailing: {
                Text(timerInterval: Date()...context.state.endsAt, countsDown: true)
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .frame(minWidth: 44, alignment: .trailing)
                    .fixedSize()
            } minimal: {
                Image(systemName: symbol(context.attributes.kind))
            }
        }
    }

    /// El icono de cada clase de superficie (`SurfaceKind` del núcleo).
    private func symbol(_ kind: String) -> String {
        switch kind {
        case "eggHatching": return "oval.portrait.fill"
        default: return "pawprint.fill"
        }
    }
}
#endif

// MARK: - Entrada de la extensión

@main
struct PockaiWidgetsBundle: WidgetBundle {
    var body: some Widget {
        PetWidget()
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            PockaiLiveActivity()
        }
        #endif
    }
}
