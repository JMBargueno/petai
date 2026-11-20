// Comprueba que los tipos Swift del reloj siguen entendiendo lo que escribe Rust (spec 44).
//
// No es un target de Xcode: es un programa suelto que se compila con los tipos compartidos y lee el
// fichero que genera el núcleo. Es lo único que impide que los dos lados del cable se separen sin
// que nadie se entere.
//
//   cd desktop/src-tauri/gen/apple
//   swiftc -O Shared/PockaiWrist.swift Shared/PockaiActivityAttributes.swift Tests/PockaiWristFixture.swift \
//     -o /tmp/pockai-wrist-fixture && /tmp/pockai-wrist-fixture ../../../../crates/pockai-core/tests/fixtures/wrist-snapshot.json
//
// El fichero se regenera desde Rust con:
//   cargo test -p pockai-core fixture_del_reloj -- --ignored

import Foundation

struct Fallo: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

@main
struct PockaiWristFixture {
    static func main() {

        let ruta = CommandLine.arguments.count > 1
            ? CommandLine.arguments[1]
            : "crates/pockai-core/tests/fixtures/wrist-snapshot.json"

        guard let datos = FileManager.default.contents(atPath: ruta) else {
            FileHandle.standardError.write("no se pudo leer \(ruta)\n".data(using: .utf8)!)
            exit(1)
        }

        do {
            let snapshot = try JSONDecoder().decode(PockaiWristSnapshot.self, from: datos)
            guard let pet = snapshot.pet else { throw Fallo("el fixture tiene que traer mascota") }
            guard snapshot.signedIn else { throw Fallo("el fixture tiene que traer sesión") }
            guard !snapshot.buttons.isEmpty else { throw Fallo("el fixture tiene que traer botones") }
            guard !snapshot.surfaces.isEmpty else { throw Fallo("el fixture tiene que traer una cuenta atrás") }
            guard snapshot.buttons.contains(where: { $0.action == "feed" }) else { throw Fallo("falta el botón de comer") }
            guard snapshot.nextSurface?.kind == "eggHatching" else { throw Fallo("la cuenta atrás no es la del huevo") }

            // Y que vuelve a salir igual: si Swift se dejara un campo, esto lo caza.
            let ida = try JSONEncoder().encode(snapshot)
            let vuelta = try JSONDecoder().decode(PockaiWristSnapshot.self, from: ida)
            guard vuelta == snapshot else { throw Fallo("el resumen no sobrevive a ida y vuelta") }

            print("ok: \(pet.name) nivel \(pet.level), \(snapshot.buttons.count) botones, \(snapshot.surfaces.count) cuenta(s) atrás")
        } catch {
            FileHandle.standardError.write("el fixture del reloj no cuadra con los tipos Swift: \(error)\n".data(using: .utf8)!)
            exit(1)
        }
    }
}
