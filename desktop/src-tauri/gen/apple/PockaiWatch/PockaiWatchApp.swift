// La app de Pockai en el Apple Watch (spec 44): un vistazo y unos pocos gestos.
//
// Cuatro páginas, que se pasan girando la corona: cómo está la mascota, qué cuenta atrás hay en
// marcha, qué se puede hacer de un toque y qué lleva encima. Nada más: el juego entero está en el
// iPhone.
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
        // Cada página con su `NavigationStack`: sin él, watchOS no enseña el `navigationTitle` y
        // los cuatro títulos no se veían.
        TabView {
            NavigationStack { VitalsView() }
            NavigationStack { CountdownsView() }
            NavigationStack { ActionsView() }
            NavigationStack { WalletView() }
        }
        .tabViewStyle(.verticalPage)
        // Al volver a la app se pide un resumen fresco: es lo que despierta al iPhone.
        .onChange(of: phase) { _, new in
            if new == .active { store.refresh() }
        }
        // Un binding de verdad y no `.constant`: si el sistema cierra la alerta por su cuenta, el
        // aviso se limpia en lugar de volver a aparecer.
        .alert("Pockai", isPresented: Binding(get: { store.notice != nil }, set: { if !$0 { store.notice = nil } })) {
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
                    Header(pet: pet)
                    // Las cinco, en el orden en que se cuidan. La salud también: la pinta la esfera
                    // y es la que gobierna el botón de curar.
                    ForEach(pet.vitals, id: \.key) { vital in
                        StatGauge(key: vital.key, value: vital.value)
                    }
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

/// El Pockai, con su nombre, su nivel y su vínculo. El sprite es el de su especie y etapa, con la
/// cara que le toca por el ánimo, sobre un halo del color de su Flujo.
private struct Header: View {
    let pet: PockaiWristPet

    var body: some View {
        HStack(spacing: 8) {
            // El halo es un cuadrado redondeado y no un círculo: la lámina es cuadrada y lleva los
            // efectos del ánimo (las marcas de hambre, las Z de dormir) en las esquinas, que un
            // círculo recorta justo donde están.
            // Pasa los frames de la pose del ánimo (`AnimatedPockai`, en `WatchArt/`); con
            // *Reducir movimiento* o en segundo plano se queda en el primero.
            AnimatedPockai(pet: pet)
                .padding(2)
                .frame(width: 48, height: 48)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(PockaiWristArt.element(pet.element).opacity(0.22))
                )
                .accessibilityLabel("\(pet.name), \(pet.moodLabel)")

            VStack(alignment: .leading, spacing: 2) {
                Text(pet.name).font(.headline).lineLimit(1)
                Text("Nv. \(pet.level) · \(pet.moodLabel)").font(.caption2).foregroundStyle(.secondary)
                LevelBar(pet: pet)
            }
        }
    }
}

/// Lo que falta para el nivel siguiente. El reloj no calcula la curva: pinta lo que le mandan.
private struct LevelBar: View {
    let pet: PockaiWristPet

    var body: some View {
        if pet.xpNeeded > 0 {
            ProgressView(value: Double(min(pet.xp, pet.xpNeeded)), total: Double(pet.xpNeeded))
                .tint(PockaiWristArt.element(pet.element))
                .accessibilityLabel("Experiencia")
                .accessibilityValue("\(pet.xp) de \(pet.xpNeeded)")
        }
    }
}

/// Una constante con su icono. Pintada, no calculada: el valor es el que mandó el iPhone. Por
/// debajo del umbral crítico se tiñe, para que se vea sin leer el número.
private struct StatGauge: View {
    /// El mismo `vitals.criticalThreshold` de `balance.json`.
    private static let critical = 15

    let key: String
    let value: Int

    var body: some View {
        // En una línea: icono, barra y número. El medidor con etiqueta debajo comía un tercio de
        // pantalla cada uno, y ahora son cinco.
        HStack(spacing: 6) {
            PockaiWristArt.stat(key)
                .font(.caption2)
                .frame(width: 14)
            Gauge(value: Double(max(0, min(100, value))), in: 0...100) { EmptyView() }
                .gaugeStyle(.accessoryLinearCapacity)
                .labelsHidden()
            Text("\(value)")
                .font(.caption2)
                .monospacedDigit()
                .frame(width: 24, alignment: .trailing)
        }
        .foregroundStyle(value <= Self.critical ? .red : .primary)
        .tint(value <= Self.critical ? .red : .accentColor)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(PockaiWristArt.statLabel(key))
        .accessibilityValue("\(value)")
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
                            HStack(alignment: .top, spacing: 6) {
                                PockaiWristArt.surface(surface.kind).font(.caption)
                                // `fixedSize` vertical: sin él el título se salía por la derecha en
                                // lugar de pasar a la segunda línea.
                                Text(surface.title)
                                    .font(.caption)
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
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
                    // El doble pinch hace lo primero que de verdad se puede hacer.
                    let shortcut = buttons.first(where: { $0.enabled })?.id
                    ForEach(buttons) { button in
                        ActionButton(button: button, primary: button.id == shortcut)
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
    /// Si este es el gesto rápido de la muñeca (doble pinch). Solo uno puede serlo.
    let primary: Bool

    var body: some View {
        Button {
            store.perform(button)
        } label: {
            HStack(spacing: 8) {
                icon
                VStack(alignment: .leading, spacing: 1) {
                    Text(button.label).font(.body)
                    // Con qué se hace, cuando gasta un objeto: lo eligió el núcleo, no el reloj.
                    if button.enabled, let item = button.itemName {
                        Text(item).font(.caption2).foregroundStyle(.secondary)
                    }
                    // Por qué está gris, dicho por el núcleo: «sin comida», «ya está limpia»…
                    if let why = button.disabledReason {
                        Text(why).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
        }
        .disabled(!button.enabled || store.sending != nil)
        .accessibilityHint(button.disabledReason ?? button.itemName ?? "")
        .primaryGesture(primary)
    }

    /// El objeto si lo hay (la manzana, el elixir); si no, el icono de la acción. Mientras se manda,
    /// el reloj enseña que está en camino y no toca los números.
    @ViewBuilder private var icon: some View {
        if store.sending == button.action {
            ProgressView().controlSize(.mini)
        } else if let art = PockaiWristArt.item(button.itemId), button.enabled {
            art.resizable().interpolation(.none).scaledToFit().frame(width: 22, height: 22)
        } else {
            PockaiWristArt.action(button.icon)
        }
    }
}

private extension View {
    /// El doble pinch de watchOS 11, que se queda en nada en los relojes que no lo tienen.
    ///
    /// Va en **un solo botón de toda la escena**: `TabView(.verticalPage)` mantiene vivas las cuatro
    /// páginas a la vez, y dos `.primaryAction` compitiendo dejan el comportamiento indefinido.
    @ViewBuilder func primaryGesture(_ on: Bool) -> some View {
        if #available(watchOS 11.0, *), on {
            self.handGestureShortcut(.primaryAction)
        } else {
            self
        }
    }
}

// MARK: - Página 4: qué lleva encima

/// Monedas y gemas. Es el vistazo que hoy obliga a sacar el teléfono, y no es más que leer dos
/// números del resumen.
struct WalletView: View {
    @EnvironmentObject private var store: PockaiWatchStore

    var body: some View {
        ScrollView {
            if let wallet = store.snapshot?.wallet {
                VStack(spacing: 10) {
                    Purse(icon: "coin", fallback: "circle.circle.fill", label: "Monedas", value: wallet.coins)
                    Purse(icon: "gem", fallback: "diamond.fill", label: "Gemas", value: wallet.gems)
                    Freshness()
                }
                .padding(.horizontal, 4)
                .padding(.top, 8)
            } else {
                Away()
            }
        }
        .navigationTitle("Monedero")
    }
}

private struct Purse: View {
    let icon: String
    let fallback: String
    let label: String
    let value: Int

    var body: some View {
        HStack(spacing: 8) {
            PockaiWristArt.ui(icon, fallback: fallback)
            Text(label).font(.caption)
            Spacer()
            Text("\(value)").font(.title3).monospacedDigit()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }
}

// MARK: - Sin nada que enseñar

/// Sin sesión, sin mascota o sin que haya llegado todavía el primer resumen. El reloj no puede
/// entrar a la cuenta ni hablar con el backend: lo único que sabe hacer es decirlo.
struct Away: View {
    @EnvironmentObject private var store: PockaiWatchStore

    var body: some View {
        VStack(spacing: 8) {
            PockaiWristArt.away.font(.title2)
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
