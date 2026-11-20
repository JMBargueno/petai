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

/// La constante que peor está, que es lo que importa de un vistazo.
private func lowest(_ pet: PockaiPetGlance) -> (key: String, value: Int) {
    let stats = [
        ("hunger", pet.hunger), ("happiness", pet.happiness), ("energy", pet.energy),
        ("hygiene", pet.hygiene), ("health", pet.health),
    ]
    let worst = stats.min { $0.1 < $1.1 } ?? ("hunger", pet.hunger)
    return (worst.0, worst.1)
}

struct CircularView: View {
    let entry: PetEntry

    var body: some View {
        if let pet = entry.snapshot?.pet {
            let worst = lowest(pet)
            Gauge(value: Double(max(0, min(100, worst.value))), in: 0...100) {
                Image(systemName: PockaiWristSymbols.mood(pet.mood))
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .opacity(entry.stale ? 0.5 : 1)
        } else {
            Image(systemName: "pawprint.fill")
        }
    }
}

struct CornerView: View {
    let entry: PetEntry

    var body: some View {
        if let pet = entry.snapshot?.pet {
            let worst = lowest(pet)
            Image(systemName: PockaiWristSymbols.mood(pet.mood))
                .widgetLabel {
                    Gauge(value: Double(max(0, min(100, worst.value))), in: 0...100) {
                        Text(PockaiWristSymbols.statLabel(worst.key))
                    }
                }
                .opacity(entry.stale ? 0.5 : 1)
        } else {
            Image(systemName: "pawprint.fill")
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
                let worst = lowest(pet)
                Text("\(pet.name) · \(PockaiWristSymbols.statLabel(worst.key)) \(worst.value)")
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
                    Image(systemName: PockaiWristSymbols.mood(pet.mood))
                    Text(pet.name).font(.headline).lineLimit(1)
                }
                if let next = snapshot.surfaces.first(where: { $0.endsAtDate > entry.date }) {
                    Text(next.endsAtDate, style: .timer).font(.caption2)
                } else {
                    let worst = lowest(pet)
                    Text("\(PockaiWristSymbols.statLabel(worst.key)) \(worst.value) · \(pet.moodLabel)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .opacity(entry.stale ? 0.6 : 1)
        } else {
            HStack(spacing: 4) {
                Image(systemName: "pawprint.fill")
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
