// Las complicaciones de la esfera y el widget del Smart Stack (spec 44).
//
// Este proceso **no puede hablar ni con el núcleo ni con el iPhone**: solo lee el último resumen que
// la app del reloj dejó en el App Group del reloj. Ninguna regla del juego vive aquí.
//
// La timeline se construye con las horas de fin que trae el resumen: una entrada ahora, una en cada
// cuenta atrás que termina y otra cuando las constantes dejan de ser de fiar. Así la esfera avanza
// sin que nadie la despierte, que es lo único que se puede hacer sin push.

import SwiftUI
import WidgetKit

// MARK: - De dónde salen los datos

struct PetEntry: TimelineEntry {
    let date: Date
    let snapshot: PockaiWristSnapshot?

    /// Si en este instante las constantes ya no son de fiar.
    var stale: Bool { snapshot.map { date >= $0.staleAtDate } ?? true }
}

struct PetProvider: TimelineProvider {
    private func load() -> PockaiWristSnapshot? {
        guard let store = UserDefaults(suiteName: PockaiWristKeys.watchAppGroup),
              let data = store.data(forKey: PockaiWristKeys.snapshotKey)
        else { return nil }
        return try? JSONDecoder().decode(PockaiWristSnapshot.self, from: data)
    }

    func placeholder(in context: Context) -> PetEntry {
        PetEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (PetEntry) -> Void) {
        completion(PetEntry(date: Date(), snapshot: load()))
    }

    /// Las entradas son los instantes en que lo que se ve cambia por sí solo: cuando termina una
    /// cuenta atrás y cuando el resumen caduca. Fuera de esos, quien refresca es la app del reloj con
    /// `WidgetCenter.reloadAllTimelines()` al recibir un resumen nuevo.
    func getTimeline(in context: Context, completion: @escaping (Timeline<PetEntry>) -> Void) {
        let snapshot = load()
        let now = Date()
        var moments: [Date] = [now]
        if let snapshot {
            moments += snapshot.surfaces.map(\.endsAtDate)
            moments.append(snapshot.staleAtDate)
        }
        let entries = moments
            .filter { $0 >= now }
            .sorted()
            .prefix(8)
            .map { PetEntry(date: $0, snapshot: snapshot) }

        completion(Timeline(entries: Array(entries), policy: .never))
    }
}

// MARK: - Las vistas

// Cuál es la constante que peor está **no se calcula aquí**: viene decidida en el resumen
// (`pet.lowest` y `pet.lowestValue`, de `wrist.rs`). Antes se recalculaba en Swift, que era una
// regla de juego viviendo en SwiftUI.

struct CircularView: View {
    let entry: PetEntry

    var body: some View {
        if let pet = entry.snapshot?.pet {
            Gauge(value: Double(max(0, min(100, pet.lowestValue))), in: 0...100) {
                PockaiWristArt.pockai(pet)
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .opacity(entry.stale ? 0.5 : 1)
            .accessibilityLabel(pet.name)
            .accessibilityValue("\(PockaiWristArt.statLabel(pet.lowest)) \(pet.lowestValue)")
        } else {
            PockaiWristArt.away
        }
    }
}

struct CornerView: View {
    let entry: PetEntry

    var body: some View {
        if let pet = entry.snapshot?.pet {
            PockaiWristArt.mood(pet.mood)
                .widgetLabel {
                    Gauge(value: Double(max(0, min(100, pet.lowestValue))), in: 0...100) {
                        Text(PockaiWristArt.statLabel(pet.lowest))
                    }
                }
                .opacity(entry.stale ? 0.5 : 1)
                .accessibilityLabel("\(pet.name): \(PockaiWristArt.statLabel(pet.lowest)) \(pet.lowestValue)")
        } else {
            PockaiWristArt.away
        }
    }
}

struct InlineView: View {
    let entry: PetEntry

    var body: some View {
        if let snapshot = entry.snapshot, let pet = snapshot.pet {
            if let next = snapshot.surfaces.first(where: { $0.endsAtDate > entry.date }) {
                Text("\(pet.name) · \(next.endsAtDate, style: .relative)")
            } else {
                Text("\(pet.name) · \(PockaiWristArt.statLabel(pet.lowest)) \(pet.lowestValue)")
            }
        } else {
            Text("Abre Pockai")
        }
    }
}

struct RectangularView: View {
    let entry: PetEntry

    var body: some View {
        if let snapshot = entry.snapshot, let pet = snapshot.pet {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    PockaiWristArt.pockai(pet).frame(width: 20, height: 20)
                    Text(pet.name).font(.headline).lineLimit(1)
                }
                if let next = snapshot.surfaces.first(where: { $0.endsAtDate > entry.date }) {
                    Text(next.endsAtDate, style: .timer).font(.caption2)
                } else {
                    Text("\(PockaiWristArt.statLabel(pet.lowest)) \(pet.lowestValue) · \(pet.moodLabel)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .opacity(entry.stale ? 0.6 : 1)
        } else {
            HStack(spacing: 4) {
                PockaiWristArt.away
                Text("Abre Pockai en el iPhone").font(.caption2)
            }
            .foregroundStyle(.secondary)
        }
    }
}

// MARK: - El widget

struct PockaiWatchComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PockaiWatchComplication", provider: PetProvider()) { entry in
            ComplicationBody(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Tu Pockai")
        .description("Cómo está tu Pockai y qué tiene en marcha.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryInline, .accessoryRectangular])
    }
}

/// Cada familia pinta lo que le cabe.
private struct ComplicationBody: View {
    @Environment(\.widgetFamily) private var family
    let entry: PetEntry

    var body: some View {
        switch family {
        case .accessoryCorner: CornerView(entry: entry)
        case .accessoryInline: InlineView(entry: entry)
        case .accessoryRectangular: RectangularView(entry: entry)
        default: CircularView(entry: entry)
        }
    }
}

@main
struct PockaiWatchComplicationsBundle: WidgetBundle {
    var body: some Widget {
        PockaiWatchComplication()
    }
}
