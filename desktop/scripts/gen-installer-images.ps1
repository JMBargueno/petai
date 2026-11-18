# Genera las imágenes del asistente NSIS (Windows) a partir del logo de Pockai.
#
#   powershell -ExecutionPolicy Bypass -File desktop/scripts/gen-installer-images.ps1
#
# Salida (BMP 24 bits, formato que exige Modern UI 2 de NSIS):
#   src-tauri/icons/installer/sidebar.bmp  164x314  pantallas de bienvenida / fin
#   src-tauri/icons/installer/header.bmp   150x57   cabecera de las páginas interiores
#
# Usa System.Drawing (incluido en Windows), sin dependencias extra.
# Regenerar solo si cambia icons/icon.png o la paleta de marca.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$tauriDir = Join-Path $PSScriptRoot '..\src-tauri' | Resolve-Path
$logoPath = Join-Path $tauriDir 'icons\icon.png'
$outDir = Join-Path $tauriDir 'icons\installer'
New-Item -ItemType Directory -Force $outDir | Out-Null

# Paleta (desktop/src/styles/tokens.css)
$sunburst = [System.Drawing.ColorTranslator]::FromHtml('#ffd731')
$ink = [System.Drawing.ColorTranslator]::FromHtml('#0b0a14')
$white = [System.Drawing.Color]::White

$logo = [System.Drawing.Image]::FromFile($logoPath)

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  return @($bmp, $g)
}

function Get-Font([float]$size) {
  foreach ($name in @('Segoe UI Black', 'Segoe UI', 'Arial')) {
    $f = New-Object System.Drawing.Font $name, $size, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    if ($f.Name -eq $name) { return $f }
    $f.Dispose()
  }
  throw 'No hay fuente disponible'
}

# --- Sidebar 164x314 -------------------------------------------------------
$bmp, $g = New-Canvas 164 314
$g.Clear($sunburst)
# Banda de tinta inferior, como base de la composición
$g.FillRectangle((New-Object System.Drawing.SolidBrush $ink), 0, 296, 164, 18)
$logoSize = 112
$g.DrawImage($logo, [int]((164 - $logoSize) / 2), 64, $logoSize, $logoSize)
$font = Get-Font 30
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$g.DrawString('Pockai', $font, (New-Object System.Drawing.SolidBrush $ink), (New-Object System.Drawing.RectangleF 0, 190, 164, 40), $fmt)
$small = New-Object System.Drawing.Font 'Segoe UI', 10, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('Tu mascota virtual inteligente', $small, (New-Object System.Drawing.SolidBrush $ink), (New-Object System.Drawing.RectangleF 0, 228, 164, 20), $fmt)
$g.Dispose()
$bmp.Save((Join-Path $outDir 'sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Dispose()

# --- Header 150x57 ---------------------------------------------------------
$bmp, $g = New-Canvas 150 57
$g.Clear($white)
$logoSize = 41
$g.DrawImage($logo, 150 - $logoSize - 8, [int]((57 - $logoSize) / 2), $logoSize, $logoSize)
$g.Dispose()
$bmp.Save((Join-Path $outDir 'header.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Dispose()

$logo.Dispose()
Write-Host "Imagenes generadas en $outDir"
