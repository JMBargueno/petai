// Los avisos de cuidado con la app cerrada (spec 43, paso 4.8) y el snapshot que leen el widget y la
// Live Activity (fase 5).
//
// Aquí no hay ni una regla del juego: qué avisar, qué enseñar y qué actividades abrir o cerrar lo
// decide el núcleo en Rust (`care.rs` y `surfaces.rs`), y esto solo lo pinta. El equivalente en
// Android es `CareSync.kt` + `PockaiWidget.kt`, con WorkManager en lugar de BGTaskScheduler.
//
// El sistema concede estas pasadas cuando quiere: no son un temporizador. Por eso las superficies se
// diseñan sobre horas de fin conocidas (ver `surfaces.rs`), que siguen contando sin que nadie las
// despierte.

import BackgroundTasks
import Foundation
import UserNotifications

// MARK: - El núcleo, desde Swift

// Las funciones de `crates/tauri-plugin-pockai/src/ios.rs`. Se declaran con `@_silgen_name` para no
// depender de un bridging header, que es un fichero que genera Tauri y que `tauri ios init`
// sobrescribiría.
@_silgen_name("pockai_care_sync")
private func pockai_care_sync(_ dataDir: UnsafePointer<CChar>?, _ baseURL: UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>?

@_silgen_name("pockai_surfaces_poll")
private func pockai_surfaces_poll() -> UnsafeMutablePointer<CChar>?

@_silgen_name("pockai_widget_poll")
private func pockai_widget_poll() -> UnsafeMutablePointer<CChar>?

@_silgen_name("pockai_string_free")
private func pockai_string_free(_ ptr: UnsafeMutablePointer<CChar>?)

@_silgen_name("pockai_surfaces_set_callback")
private func pockai_surfaces_set_callback(_ callback: (@convention(c) () -> Void)?)

/// Llama al núcleo y devuelve lo que diga, ya liberado por nuestra parte.
private func coreString(_ call: () -> UnsafeMutablePointer<CChar>?) -> Data? {
    guard let ptr = call() else { return nil }
    defer { pockai_string_free(ptr) }
    return String(cString: ptr).data(using: .utf8)
}

// MARK: - Lo que devuelve el núcleo

/// El aviso de cuidado más urgente. Los mismos campos que `Notice` en el núcleo; solo se leen los
/// que hacen falta para la notificación.
private struct Notice: Decodable {
    let key: String
    let title: String
    let body: String
}

/// Una superficie viva (`Surface` en `surfaces.rs`). `endsAt` y `staleAt` son milisegundos.
struct Surface: Codable, Equatable {
    let id: String
    let kind: String
    let title: String
    let body: String
    let endsAt: Int64
    let staleAt: Int64

    var endsAtDate: Date { Date(timeIntervalSince1970: Double(endsAt) / 1000) }
    var staleAtDate: Date { Date(timeIntervalSince1970: Double(staleAt) / 1000) }
}

/// Las órdenes para las superficies (`SurfaceDiff`).
struct SurfaceDiff: Decodable {
    let start: [Surface]
    let update: [Surface]
    let end: [String]
}

/// Lo que devuelve una pasada en segundo plano.
private struct BackgroundSync: Decodable {
    let notice: Notice?
    /// El resumen de la mascota para el widget. Se guarda tal cual, sin mirarlo: lo pinta la
    /// extensión, que es otro proceso y no puede llamar al núcleo.
    let widget: AnyCodableBox?
    let surfaces: SurfaceDiff
}

/// Un trozo de JSON que solo se guarda y se vuelve a escribir, sin interpretarlo.
struct AnyCodableBox: Decodable {
    let raw: Data
    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer().decode(JSONValue.self)
        raw = try JSONEncoder().encode(value)
    }
}

/// JSON genérico, lo justo para guardar el resumen del widget sin conocer sus campos.
indirect enum JSONValue: Codable {
    case null, bool(Bool), number(Double), string(String), array([JSONValue]), object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
}

// MARK: - El trabajo en segundo plano

enum PockaiBackground {
    /// El identificador de la tarea. Tiene que estar también en `BGTaskSchedulerPermittedIdentifiers`
    /// del Info.plist, o el sistema no la deja registrar.
    static let taskIdentifier = "com.petai.app.care"

    /// El App Group que comparten la app y la extensión del widget.
    ///
    /// Va declarado en `entitlements.properties` de **project.yml**, no a mano en el `.entitlements`:
    /// `xcodegen` regenera ese fichero desde el proyecto y, si no está declarado ahí, lo deja vacío
    /// y los dos procesos se quedan cada uno con sus propios ajustes.
    static let appGroup = "group.com.petai.app"

    /// Los ajustes compartidos con la extensión, o `nil` si el App Group no está disponible.
    static func sharedDefaults() -> UserDefaults? {
        guard let store = UserDefaults(suiteName: appGroup) else {
            NSLog("[pockai] sin App Group (\(appGroup)): ¿compilación sin firmar? El widget de inicio no verá el resumen")
            return nil
        }
        return store
    }

    /// Dónde queda el resumen de la mascota para el widget.
    static let widgetKey = "pockai.widget"

    /// Cada cuánto, como poco, se pide otra pasada. El sistema concede menos de las que se piden.
    static let minimumInterval: TimeInterval = 30 * 60

    /// El último aviso que se mostró, para no repetirlo en cada pasada.
    private static let lastNoticeKey = "pockai.lastNotice"

    /// Registra el manejador de la tarea. Tiene que correr antes de que la app acabe de arrancar.
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else { return task.setTaskCompleted(success: false) }
            run(task)
        }
    }

    /// Pide la siguiente pasada. Se llama al arrancar y al terminar cada una: una tarea solo se
    /// programa de una en una.
    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: minimumInterval)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // En el simulador, `BGTaskScheduler` suele rechazarlo: no es un fallo de la app.
            NSLog("[pockai] no se pudo programar la pasada de cuidados: \(error.localizedDescription)")
        }
    }

    private static func run(_ task: BGAppRefreshTask) {
        // La siguiente, ya: si la app no se abre, esta es la única ocasión de encadenarlas.
        schedule()

        let work = DispatchWorkItem {
            guard let sync = fetch() else { return task.setTaskCompleted(success: false) }
            apply(sync)
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = { work.cancel() }
        DispatchQueue.global(qos: .background).async(execute: work)
    }

    /// Una pasada: el núcleo pide las mascotas y dice qué hacer.
    private static func fetch() -> BackgroundSync? {
        guard let dataDir = dataDirectory(), let baseURL = backendURL() else { return nil }
        let json = dataDir.withCString { dir in
            baseURL.withCString { url in
                coreString { pockai_care_sync(dir, url) }
            }
        }
        guard let json else { return nil }
        return try? JSONDecoder().decode(BackgroundSync.self, from: json)
    }

    /// Enseña lo que el núcleo haya decidido: el aviso, el resumen del widget y las superficies.
    private static func apply(_ sync: BackgroundSync) {
        if let notice = sync.notice { show(notice) }
        saveWidget(sync.widget)
        PockaiSurfaces.apply(sync.surfaces)
        // Una de las pocas ocasiones al día en que el reloj puede enterarse de algo sin que el
        // jugador abra nada.
        PockaiWristLink.shared.push()
    }

    /// Una notificación local con el aviso, si no es el mismo que ya se mostró.
    private static func show(_ notice: Notice) {
        // El recordatorio de lo ya avisado puede vivir en los ajustes de la app: no lo lee nadie más.
        let store = sharedDefaults() ?? .standard
        guard store.string(forKey: lastNoticeKey) != notice.key else { return }
        store.set(notice.key, forKey: lastNoticeKey)

        let content = UNMutableNotificationContent()
        content.title = notice.title
        content.body = notice.body
        content.sound = .default
        let request = UNNotificationRequest(identifier: notice.key, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            if let error { NSLog("[pockai] no se pudo avisar: \(error.localizedDescription)") }
        }
    }

    /// Guarda el resumen en el App Group y pide a la extensión que se redibuje. `nil` lo borra (sin
    /// sesión o sin mascota, el widget vuelve a «Abre Pockai»).
    ///
    /// Si el resumen no ha cambiado no se pide el redibujado: esto se llama en cada cambio de estado
    /// (comer, bañar, un minijuego…) y WidgetKit limita cuántas veces al día atiende.
    static func saveWidget(_ widget: AnyCodableBox?) {
        // Este sí lo lee la extensión: sin App Group no hay nada que compartir.
        guard let store = sharedDefaults() else { return }
        let before = store.data(forKey: widgetKey)
        guard before != widget?.raw else { return }
        if let widget {
            store.set(widget.raw, forKey: widgetKey)
        } else {
            store.removeObject(forKey: widgetKey)
        }
        PockaiSurfaces.reloadWidgets()
    }

    /// La carpeta de datos de la app: la misma que usa el núcleo desde Tauri.
    private static func dataDirectory() -> String? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.path
    }

    /// La URL del backend con la que se compiló (`POCKAI_API_URL`, ver `build.rs`). En depuración,
    /// el backend local.
    private static func backendURL() -> String? {
        if let url = Bundle.main.object(forInfoDictionaryKey: "POCKAIApiUrl") as? String, !url.isEmpty {
            return url
        }
        #if DEBUG
        return "http://127.0.0.1:3000"
        #else
        return nil
        #endif
    }
}

/// Lo llama `PockaiBackgroundBootstrap.mm` antes de que arranque la app: `BGTaskScheduler` exige
/// registrar el manejador antes de que termine el arranque.
@_cdecl("pockai_background_register")
public func pockaiBackgroundRegister() {
    PockaiBackground.register()
    PockaiBackground.schedule()
    // El núcleo avisa por aquí cuando cambian los huevos con la app abierta, para que la Live
    // Activity no tenga que esperar a una pasada en segundo plano.
    pockai_surfaces_set_callback(pockaiSurfacesRefresh)
    // El enlace con el Apple Watch (spec 44). Se enciende aquí, antes de que arranque la app: cuando
    // el reloj manda algo, el sistema despierta el proceso y el delegado tiene que estar puesto.
    PockaiWristLink.shared.activate()
}

/// Repasa lo que se ve fuera de la app con el estado que el núcleo ya tiene: el resumen del widget
/// de la pantalla de inicio y las superficies vivas. Lo llama el núcleo desde su hilo, así que el
/// trabajo de UI se manda al principal.
private func pockaiSurfacesRefresh() {
    // El resumen del widget: `nil` lo borra (sin sesión o sin mascota).
    let widget = coreString { pockai_widget_poll() }.flatMap { data in
        try? JSONDecoder().decode(AnyCodableBox.self, from: data)
    }
    let diff = coreString { pockai_surfaces_poll() }.flatMap { data in
        try? JSONDecoder().decode(SurfaceDiff.self, from: data)
    }
    DispatchQueue.main.async {
        PockaiBackground.saveWidget(widget)
        if let diff { PockaiSurfaces.apply(diff) }
        // Lo mismo que cambia en el widget cambia en la muñeca. El núcleo decide si vale la pena
        // mandarlo: `pockai_wrist_push` devuelve nulo si no cambió nada que se vea.
        PockaiWristLink.shared.push()
    }
}
