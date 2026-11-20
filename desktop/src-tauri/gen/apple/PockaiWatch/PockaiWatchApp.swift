// La app de Pockai en el Apple Watch (spec 44): un vistazo y tres gestos.
//
// Tres páginas, que se pasan girando la corona: cómo está la mascota, qué cuenta atrás hay en marcha
// y qué se puede hacer de un toque. Nada más: el juego entero está en el iPhone.
//
// Aquí no hay ninguna regla. Qué constantes enseñar, qué botones y si están grises lo decide el
// núcleo en Rust (`wrist.rs`) y llega en el resumen.

import SwiftUI

@main
struct PockaiWatchApp: App {
    @StateObject private var store = PockaiWatchStore()

    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var store: PockaiWatchStore
    @Environment(\.scenePhase) private var phase

    var body: some View {
        TabView {
            VitalsView()
            CountdownsView()
            ActionsView()
        }
        .tabViewStyle(.verticalPage)
        // Al volver a la app se pide un resumen fresco: es lo que despierta al iPhone.
        .onChange(of: phase) { _, new in
            if new == .active { store.refresh() }
        }
        .alert("Pockai", isPresented: .constant(store.notice != nil)) {
            Button("Vale") { store.notice = nil }
        } message: {
            Text(store.notice ?? "")
        }
    }
}

// MARK: - Página 1: cómo está

struct VitalsView: View {
    @EnvironmentObject private var store: PockaiWatchStore

    var body: some View {
        ScrollView {
            if let pet = store.snapshot?.pet {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: PockaiWristSymbols.mood(pet.mood))
                        Text(pet.name).font(.headline).lineLimit(1)
                        Spacer()
                        Text("Nv. \(pet.level)").font(.caption2).foregroundStyle(.secondary)
                    }
                    Text(pet.moodLabel).font(.caption).foregroundStyle(.secondary)

                    StatGauge(key: "hunger", value: pet.hunger)
                    StatGauge(key: "happiness", value: pet.happiness)
                    StatGauge(key: "energy", value: pet.energy)
                    StatGauge(key: "hygiene", value: pet.hygiene)

                    Freshness()
                }
                .padding(.horizontal, 4)
            } else {
                Away()
            }
        }
        .navigationTitle("Pockai")
    }
}

/// Una constante con su icono. Pintada, no calculada: el valor es el que mandó el iPhone.
private struct StatGauge: View {
    let key: String
    let value: Int

    var body: some View {
        Gauge(value: Double(max(0, min(100, value))), in: 0...100) {
            Image(systemName: PockaiWristSymbols.stat(key))
        } currentValueLabel: {
            Text("\(value)")
        }
        .gaugeStyle(.accessoryLinearCapacity)
    }
}

/// Hasta cuándo se puede confiar en lo que se enseña. El reloj no proyecta el deterioro: si el dato
/// se ha quedado viejo, lo dice en lugar de inventárselo.
private struct Freshness: View {
    @EnvironmentObject private var store: PockaiWatchStore

    var body: some View {
        if let snapshot = store.snapshot {
            HStack(spacing: 4) {
                if snapshot.isStale() {
                    Image(systemName: "clock.badge.exclamationmark")
                    Text("Visto \(snapshot.generatedAtDate, style: .time)")
                } else {
                    Text("Al día")
                }
                if store.queued > 0 {
                    Spacer()
                    Image(systemName: "arrow.up.circle")
                    Text("\(store.queued)")
                }
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Página 2: qué hay en marcha

struct CountdownsView: View {
    @EnvironmentObject private var store: PockaiWatchStore

    var body: some View {
        ScrollView {
            let surfaces = store.snapshot?.surfaces ?? []
            if surfaces.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "hourglass").font(.title3)
                    Text("Nada en marcha").font(.caption)
                }
                .foregroundStyle(.secondary)
                .padding(.top, 24)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(surfaces) { surface in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                Image(systemName: PockaiWristSymbols.surface(surface.kind))
                                Text(surface.title).font(.caption).lineLimit(2)
                            }
                            // La cuenta atrás la pinta el sistema: sigue corriendo con todo
                            // suspendido y sin que nadie despierte al reloj.
                            ProgressView(timerInterval: Date()...surface.endsAtDate, countsDown: true)
                                .labelsHidden()
                            Text(surface.endsAtDate, style: .relative).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 4)
            }
        }
        .navigationTitle("En marcha")
    }
}

// MARK: - Página 3: qué se puede hacer

struct ActionsView: View {
    @EnvironmentObject private var store: PockaiWatchStore

    var body: some View {
        ScrollView {
            let buttons = store.snapshot?.buttons ?? []
            if buttons.isEmpty {
                Away()
            } else {
                VStack(spacing: 6) {
                    ForEach(buttons) { button in
                        ActionButton(button: button)
                    }
                }
                .padding(.horizontal, 4)
            }
        }
        .navigationTitle("Cuidar")
    }
}

private struct ActionButton: View {
    @EnvironmentObject private var store: PockaiWatchStore
    let button: PockaiWristButton

    var body: some View {
        Button {
            store.perform(button)
        } label: {
            HStack(spacing: 8) {
                if store.sending == button.action {
                    ProgressView().controlSize(.mini)
                } else {
                    Image(systemName: PockaiWristSymbols.action(button.action))
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(button.label).font(.body)
                    // Por qué está gris, dicho por el núcleo: «sin comida», «ya está limpia»…
                    if let why = button.disabledReason {
                        Text(why).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
        }
        .disabled(!button.enabled || store.sending != nil)
    }
}

// MARK: - Sin nada que enseñar

/// Sin sesión, sin mascota o sin que haya llegado todavía el primer resumen. El reloj no puede
/// entrar a la cuenta ni hablar con el backend: lo único que sabe hacer es decirlo.
struct Away: View {
    @EnvironmentObject private var store: PockaiWatchStore

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "pawprint.fill").font(.title2)
            if store.waiting {
                ProgressView()
                Text("Buscando el iPhone…").font(.caption2)
            } else {
                Text("Abre Pockai en el iPhone").font(.caption).multilineTextAlignment(.center)
            }
        }
        .foregroundStyle(.secondary)
        .padding(.top, 20)
    }
}
