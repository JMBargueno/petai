// Comprueba que los tipos Swift del reloj siguen entendiendo lo que escribe Rust (spec 44).
//
// No es un target de Xcode: es un programa suelto que se compila con los tipos compartidos y lee el
// fichero que genera el núcleo. Es lo único que impide que los dos lados del cable se separen sin
// que nadie se entere.
//
//   cd desktop/src-tauri/gen/apple
//   swiftc -O Shared/PockaiWrist.swift Tests/PockaiWristFixture.swift -o /tmp/pockai-wrist-fixture
//   /tmp/pockai-wrist-fixture ../../../../crates/pockai-core/tests/fixtures/wrist-snapshot.json
//
// Solo hace falta `PockaiWrist.swift`: desde que la mascota de la muñeca es su propio tipo, esto ya
// no arrastra `PockaiActivityAttributes.swift`, que no compila para macOS porque ActivityKit no
// existe ahí.
//
// El fichero se regenera desde Rust con:
//   cargo test -p pockai-core fixture_del_reloj -- --ignored

import Foundation

struct Fallo: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

/// Comprueba que los dos lados del cable usan **las mismas claves**, no solo que uno decodifica al
/// otro. Recorre el JSON que escribe Rust y el que vuelve a escribir Swift y señala la primera
/// diferencia, con la ruta donde está.
func comparar(rust: Any, swift: Any, donde: String) throws {
    if let rust = rust as? [String: Any] {
        guard let swift = swift as? [String: Any] else { throw Fallo("\(donde): Swift no escribió un objeto") }
        let faltan = Set(rust.keys).subtracting(swift.keys).sorted()
        let sobran = Set(swift.keys).subtracting(rust.keys).sorted()
        guard faltan.isEmpty else { throw Fallo("\(donde): Swift no declara \(faltan.joined(separator: ", "))") }
        guard sobran.isEmpty else { throw Fallo("\(donde): Swift escribe de más \(sobran.joined(separator: ", "))") }
        for clave in rust.keys.sorted() {
            try comparar(rust: rust[clave]!, swift: swift[clave]!, donde: "\(donde).\(clave)")
        }
    } else if let rust = rust as? [Any] {
        guard let swift = swift as? [Any], swift.count == rust.count else {
            throw Fallo("\(donde): la lista no tiene el mismo tamaño")
        }
        for (i, elemento) in rust.enumerated() {
            try comparar(rust: elemento, swift: swift[i], donde: "\(donde)[\(i)]")
        }
    }
    // Los valores sueltos no se comparan: de eso ya se encarga la ida y vuelta de los tipos.
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

            guard snapshot.buttons.contains(where: { $0.action == "heal" }) else { throw Fallo("falta el botón de curar") }
            guard snapshot.buttons.contains(where: { $0.action == "pet" }) else { throw Fallo("falta el botón de acariciar") }
            guard snapshot.buttons.allSatisfy({ !$0.icon.isEmpty }) else { throw Fallo("hay un botón sin icono") }
            guard snapshot.wallet != nil else { throw Fallo("el fixture tiene que traer el monedero") }
            guard !pet.speciesId.isEmpty, !pet.stage.isEmpty else { throw Fallo("falta con qué dibujar la mascota") }

            // Y que vuelve a salir igual.
            let ida = try JSONEncoder().encode(snapshot)
            let vuelta = try JSONDecoder().decode(PockaiWristSnapshot.self, from: ida)
            guard vuelta == snapshot else { throw Fallo("el resumen no sobrevive a ida y vuelta") }

            // La ida y vuelta de arriba **no basta**: `JSONDecoder` ignora en silencio las claves
            // que no conoce, así que un campo que Rust añade y Swift no declara pasaría en verde.
            // Esto compara los dos JSON clave a clave, que es lo único que de verdad protege el
            // contrato.
            try comparar(
                rust: try JSONSerialization.jsonObject(with: datos),
                swift: try JSONSerialization.jsonObject(with: ida),
                donde: "resumen"
            )

            print("ok: \(pet.name) nivel \(pet.level), \(snapshot.buttons.count) botones, \(snapshot.surfaces.count) cuenta(s) atrás")
        } catch {
            FileHandle.standardError.write("el fixture del reloj no cuadra con los tipos Swift: \(error)\n".data(using: .utf8)!)
            exit(1)
        }
    }
}
