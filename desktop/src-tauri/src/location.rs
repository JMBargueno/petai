//! Ubicación del equipo con la API nativa del sistema (Windows.Devices.Geolocation en Windows,
//! CoreLocation en macOS).
//!
//! Todo se queda en el equipo: el frontend la usa solo para pedir el clima y la luz del sol del
//! lugar (Open-Meteo, con 2 decimales) y nunca la manda a nuestro servidor. Se pide precisión
//! aproximada: para el clima basta con saber la ciudad.
//!
//! Devuelve `None` si el usuario deniega el permiso, la ubicación está apagada, no hay forma de
//! obtenerla en esta plataforma o se agota el tiempo.

use serde::Serialize;
use std::time::Duration;

#[derive(Serialize, Clone, Copy, Debug)]
pub struct DeviceLocation {
    pub latitude: f64,
    pub longitude: f64,
    /// Radio de error en metros, si el sistema lo da.
    pub accuracy: Option<f64>,
}

/// Tiempo máximo para conseguir una posición (el permiso del sistema puede tardar en aceptarse).
const LOCATION_TIMEOUT: Duration = Duration::from_secs(15);

#[tauri::command]
pub async fn get_device_location(app: tauri::AppHandle) -> Option<DeviceLocation> {
    let _ = &app; // solo lo usa macOS (hilo principal)
    platform::locate(app).await.filter(|l| valid(l.latitude, l.longitude))
}

fn valid(lat: f64, lon: f64) -> bool {
    lat.is_finite() && lon.is_finite() && lat.abs() <= 90.0 && lon.abs() <= 180.0 && !(lat == 0.0 && lon == 0.0)
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{DeviceLocation, LOCATION_TIMEOUT};
    use windows::Devices::Geolocation::{GeolocationAccessStatus, Geolocator, PositionAccuracy};
    use windows::Foundation::TimeSpan;

    /// Una posición de hace menos de 10 min vale: el clima no cambia tan rápido.
    const MAX_AGE_100NS: i64 = 10 * 60 * 10_000_000;

    fn blocking() -> Option<DeviceLocation> {
        // `RequestAccessAsync` muestra el aviso de permiso de Windows la primera vez.
        let access = Geolocator::RequestAccessAsync().ok()?.join().ok()?;
        if access != GeolocationAccessStatus::Allowed {
            return None;
        }
        let locator = Geolocator::new().ok()?;
        let _ = locator.SetDesiredAccuracy(PositionAccuracy::Default);
        let timeout = TimeSpan { Duration: LOCATION_TIMEOUT.as_nanos() as i64 / 100 };
        let pos = locator
            .GetGeopositionAsyncWithAgeAndTimeout(TimeSpan { Duration: MAX_AGE_100NS }, timeout)
            .ok()?
            .join()
            .ok()?;
        let coord = pos.Coordinate().ok()?;
        let point = coord.Point().ok()?.Position().ok()?;
        Some(DeviceLocation {
            latitude: point.Latitude,
            longitude: point.Longitude,
            accuracy: coord.Accuracy().ok(),
        })
    }

    pub async fn locate(_app: tauri::AppHandle) -> Option<DeviceLocation> {
        // Las esperas WinRT bloquean: fuera del hilo principal y del runtime asíncrono.
        let task = tauri::async_runtime::spawn_blocking(blocking);
        tokio::time::timeout(LOCATION_TIMEOUT + std::time::Duration::from_secs(5), task)
            .await
            .ok()?
            .ok()?
    }
}

#[cfg(target_os = "macos")]
mod platform {
    //! CoreLocation exige crear `CLLocationManager` en un hilo con bucle de eventos: se crea en el
    //! hilo principal y se guarda allí (no es `Send`). Sin delegado: se arranca la actualización y
    //! se consulta la propiedad `location` hasta que llega una posición, se deniega el permiso o
    //! vence el tiempo. El permiso necesita `NSLocationUsageDescription` en `Info.plist`.
    use super::{DeviceLocation, LOCATION_TIMEOUT};
    use objc2::rc::Retained;
    use objc2_core_location::{CLAuthorizationStatus, CLLocationManager};
    use std::cell::RefCell;
    use std::time::{Duration, Instant};
    use tokio::sync::oneshot;

    thread_local! {
        static MANAGER: RefCell<Option<Retained<CLLocationManager>>> = const { RefCell::new(None) };
    }

    enum Poll {
        Found(DeviceLocation),
        Denied,
        Waiting,
    }

    /// Precisión pedida en metros (~ciudad): `kCLLocationAccuracyKilometer`.
    const ACCURACY_KM: f64 = 1000.0;

    #[allow(unused_unsafe)]
    fn start_on_main() {
        MANAGER.with(|cell| {
            let mut slot = cell.borrow_mut();
            let manager = slot.get_or_insert_with(|| unsafe { CLLocationManager::new() });
            unsafe {
                manager.setDesiredAccuracy(ACCURACY_KM);
                manager.requestWhenInUseAuthorization();
                manager.startUpdatingLocation();
            }
        });
    }

    #[allow(unused_unsafe)]
    fn poll_on_main() -> Poll {
        MANAGER.with(|cell| {
            let slot = cell.borrow();
            let Some(manager) = slot.as_ref() else { return Poll::Denied };
            let status = unsafe { manager.authorizationStatus() };
            if status == CLAuthorizationStatus::Denied || status == CLAuthorizationStatus::Restricted {
                return Poll::Denied;
            }
            match unsafe { manager.location() } {
                Some(loc) => {
                    let c = unsafe { loc.coordinate() };
                    let acc = unsafe { loc.horizontalAccuracy() };
                    Poll::Found(DeviceLocation {
                        latitude: c.latitude,
                        longitude: c.longitude,
                        accuracy: if acc >= 0.0 { Some(acc) } else { None },
                    })
                }
                None => Poll::Waiting,
            }
        })
    }

    #[allow(unused_unsafe)]
    fn stop_on_main() {
        MANAGER.with(|cell| {
            if let Some(manager) = cell.borrow().as_ref() {
                unsafe { manager.stopUpdatingLocation() };
            }
        });
    }

    async fn on_main<T: Send + 'static>(app: &tauri::AppHandle, f: fn() -> T) -> Option<T> {
        let (tx, rx) = oneshot::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(f());
        })
        .ok()?;
        rx.await.ok()
    }

    pub async fn locate(app: tauri::AppHandle) -> Option<DeviceLocation> {
        on_main(&app, start_on_main).await?;
        let deadline = Instant::now() + LOCATION_TIMEOUT;
        let result = loop {
            match on_main(&app, poll_on_main).await {
                Some(Poll::Found(loc)) => break Some(loc),
                Some(Poll::Denied) | None => break None,
                Some(Poll::Waiting) => {}
            }
            if Instant::now() >= deadline {
                break None;
            }
            tokio::time::sleep(Duration::from_millis(300)).await;
        };
        let _ = on_main(&app, stop_on_main).await;
        result
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod platform {
    use super::DeviceLocation;

    /// Sin API nativa en esta plataforma: la mascota sigue sin clima real.
    pub async fn locate(_app: tauri::AppHandle) -> Option<DeviceLocation> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::valid;

    #[test]
    fn descarta_coordenadas_imposibles() {
        assert!(valid(40.42, -3.7));
        assert!(!valid(f64::NAN, 0.0));
        assert!(!valid(91.0, 0.0));
        assert!(!valid(0.0, 181.0));
        // (0, 0) es lo que devuelven algunos proveedores cuando no saben nada.
        assert!(!valid(0.0, 0.0));
    }
}
