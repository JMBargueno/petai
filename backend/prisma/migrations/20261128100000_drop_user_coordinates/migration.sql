-- La ubicación del usuario ya no se guarda en el servidor: cada app la lee del sistema y pide el
-- clima a Open-Meteo desde el propio dispositivo. Se borran las coordenadas que ya había.

-- AlterTable
ALTER TABLE "User" DROP COLUMN "latitude",
DROP COLUMN "longitude";
