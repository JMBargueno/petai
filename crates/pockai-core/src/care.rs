//! Avisos de cuidado en segundo plano: con la app cerrada, el sistema despierta al núcleo de vez en
//! cuando (WorkManager en Android), este pide las mascotas al servidor y dice si hace falta avisar.
//! La regla es la de siempre ([`pet_needs`]); la plataforma solo muestra la notificación y decide
//! cada cuánto como mucho.

use crate::notices::{pet_needs, Notice};
use crate::state::Slice;
use crate::Core;

impl Core {
    /// Pide las mascotas al servidor (quedan guardadas para el próximo arranque) y devuelve el aviso
    /// más urgente de la mascota activa, si lo hay. Sin sesión no pide nada.
    pub async fn care_check(&self) -> Result<Option<Notice>, String> {
        if !self.session_state().active {
            return Ok(None);
        }
        self.state_refresh(Slice::Pets).await?;
        Ok(self.state_snapshot().active_pet().and_then(|pet| pet_needs(pet).into_iter().next()))
    }
}

#[cfg(test)]
mod tests {
    use crate::{Core, CoreConfig, MemoryStore};

    #[tokio::test]
    async fn sin_sesion_no_pide_nada_ni_avisa() {
        let core = Core::new(CoreConfig::desktop("http://127.0.0.1:9", None), Box::new(MemoryStore::default()));
        assert_eq!(core.care_check().await, Ok(None));
    }
}
