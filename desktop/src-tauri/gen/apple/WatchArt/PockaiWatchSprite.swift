// El Pockai de la muñeca, animado (spec 44).
//
// Las poses están horneadas frame a frame en `PockaiArt.xcassets` y sus duraciones vienen en
// `PockaiWatchFrames.swift`, los dos generados por `pnpm generate:watch-assets`. Aquí solo se pasan
// a tiempo: ni una regla de juego, como el resto del reloj.
//
// **Vive en `WatchArt/` y no en `Shared/`** a propósito: `Shared/` lo compilan los cuatro targets, y
// este fichero depende del catálogo y del manifiesto, que solo tienen los dos de watchOS (ver el
// comentario de `project.yml`).

import SwiftUI

/// El sprite de la mascota pasando los frames de su pose, en bucle.
///
/// Con *Reducir movimiento* se queda en el primer frame, y con la app en segundo plano tampoco
/// avanza: `TimelineView` solo pide frames mientras la escena está activa, y aun así se le corta el
/// paso para no gastar batería dibujando lo que nadie ve.
struct AnimatedPockai: View {
    let pet: PockaiWristPet

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var phase

    var body: some View {
        if animate, let clip = Clip(pet: pet) {
            // El paso es el frame más corto de la pose: con él, cada frame cae en su momento aunque
            // duren distinto. `.periodic` y no `.animation`: esto es pixel art, no hay que interpolar
            // nada entre frames y pedir cada refresco de pantalla solo gastaría batería.
            //
            // El ancla es `.now` y no una fecha fija lejana: `.periodic(from:)` va soltando
            // instantes desde ahí, y anclarlo al 2001 con pasos de 0,17 s son miles de millones de
            // ticks hasta el presente. Que `.now` cambie en cada redibujado da igual, porque solo
            // fija la fase de los avisos: el frame se calcula del reloj absoluto.
            //
            // Medido en el simulador: 59 avisos en 10 s, recorriendo los 6 índices por igual.
            TimelineView(.periodic(from: .now, by: clip.step)) { ctx in
                frame(clip.image(at: ctx.date))
            }
        } else {
            frame(PockaiWristArt.pockai(pet))
        }
    }

    private var animate: Bool {
        !reduceMotion && phase == .active
    }

    /// Siempre el mismo trato de la lámina, anime o no: así al pasar a segundo plano no da un salto.
    /// El tamaño lo pone quien la usa, como con cualquier `Image`.
    private func frame(_ image: Image) -> some View {
        image
            .resizable()
            .interpolation(.none)   // pixel art: ni un píxel interpolado
            .scaledToFit()
    }

    /// Una pose lista para pasar: sus láminas, lo que dura cada una y el paso del reloj.
    private struct Clip {
        let frames: [Image]
        let durations: [Int]
        let step: TimeInterval

        init?(pet: PockaiWristPet) {
            // La misma cadena de reservas que `PockaiWristArt.pockai`: la pose del ánimo, y si la
            // especie no la tiene, su reposo.
            let keys = [PockaiWristArt.pockaiKey(pet), "\(pet.speciesId)_\(pet.stage)_idle"]
            guard let key = keys.first(where: { PockaiWatchFrames.durations[$0] != nil }),
                  let ms = PockaiWatchFrames.durations[key], ms.count > 1
            else { return nil }   // una sola lámina no es una animación

            let art = ms.indices.compactMap { PockaiWristArt.pockaiFrame(key, $0) }
            guard art.count == ms.count else { return nil }   // falta arte: mejor quieto que a saltos

            frames = art
            durations = ms
            step = TimeInterval(max(1, ms.min() ?? 1)) / 1000
        }

        var cycleMs: Int { max(1, durations.reduce(0, +)) }

        /// El frame que toca en un instante dado, sacado del reloj absoluto. Sin contador y sin
        /// ancla propia: si el reloj deja de pedir frames con la muñeca baja, al volver retoma
        /// donde debería estar, y redibujar la vista no corta el bucle.
        func image(at date: Date) -> Image {
            let ms = Int((date.timeIntervalSince1970 * 1000).rounded())
            var left = ((ms % cycleMs) + cycleMs) % cycleMs
            for (i, ms) in durations.enumerated() {
                if left < ms { return frames[i] }
                left -= ms
            }
            return frames[frames.count - 1]
        }
    }
}
