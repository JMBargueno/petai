package com.petai.app

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  /**
   * La UI elige su esquema (claro u oscuro) aunque el sistema diga otra cosa: los iconos de la barra
   * de estado y de navegación tienen que seguirla para leerse sobre el fondo del tema. La apariencia
   * (shared/ui/src/appearance.ts) llama a `PockaiSystemBars.setDark(...)` cada vez que cambia.
   */
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.addJavascriptInterface(SystemBarsBridge(), "PockaiSystemBars")
  }

  private inner class SystemBarsBridge {
    /** `dark`: el fondo de la app es oscuro, así que los iconos de las barras van claros. */
    @JavascriptInterface
    fun setDark(dark: Boolean) {
      runOnUiThread {
        val bars = WindowCompat.getInsetsController(window, window.decorView)
        bars.isAppearanceLightStatusBars = !dark
        bars.isAppearanceLightNavigationBars = !dark
      }
    }
  }
}
