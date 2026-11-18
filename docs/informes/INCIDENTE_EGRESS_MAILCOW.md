# PetAI — Incidente: egress TCP roto en la red `mailcow-smtp`

- **Fecha**: 16 de noviembre de 2026
- **Sistema afectado**: `petai-backend-1` (producción, `game-api.pockai.world`)
- **Impacto**: el backend no tenía salida a internet → `GET /v1/desktop/download/windows` y
  `/macos` devolvían 404 «Instalador no disponible» (el servicio de desktop-updates hacía
  `fetch('https://api.github.com')` y abortaba por timeout a los 8 s).
- **Estado**: **resuelto y verificado** el 16-11-2026. Fix persistida en
  `/etc/iptables/rules.v4` (la carga `netfilter-persistent` al boot).

## 1. Síntoma

Tras añadir `GITHUB_RELEASES_TOKEN` al `.env` prod (primera causa del 404: el servicio
devolvía `null` sin token) y recrear el backend, el 404 persistía. Desde dentro del
contenedor:

```
$ node -e "fetch('https://api.github.com',{signal:AbortSignal.timeout(8000)})"
# → fetch failed (timeout)
```

- DNS resolvía dentro del contenedor (20.250.119.72, etc.).
- Sin proxy de entorno.
- Conectando a IP fija (`https://140.82.121.5/` con `Host: api.github.com`) también timeout.
- **El host sí llegaba a todas las IPs de GitHub** (nc + curl 200 a 140.82.121.5,
  20.250.119.72 y 20.205.243.166).
- Un contenedor NUEVO en la misma red `mailcowdockerized_mailcow-network` (alpine:3 con
  `nc -w 4 140.82.121.5 443`) también fallaba → no era un problema del backend, sino de la red.
- Contraste: alpine en `webproxy` y en `petai_default` sin problema.

## 2. Camino del contenedor a internet

`petai-backend-1` cuelga de **dos** redes (`petai_default` y `mailcow-smtp` — esta última
para hablar con postfix por `SMTP_HOST=172.22.1.253`, ver `DEPLOY.md` §11 «Nota de ruta
SMTP»). Docker asigna:

- `eth0` → `mailcowdockerized_mailcow-network` (172.22.1.x) = **default route**
- `eth1` → `petai_default` (192.168.48.x)

Todo el egress del backend sale por el bridge `br-mailcow` (masqueradeo hacia la IP del
host) — por eso el egress de esa red es, en la práctica, el egress del backend.

## 3. Diagnóstico (evidencia)

1. **Nftables (filter)**: la cadena `FORWARD` acepta los bridges; existe una cadena
   `MAILCOW` (saltada desde `INPUT` y `FORWARD`) con dos reglas de aislamiento.
2. **Nftables (nat)**: `MASQUERADE` en los `br-*` con contadores activos.
3. **Contadores antes/después** de un test de alpine sobre la red mailcow:
   `accept +16`, `masquerade +10` → **los paquetes salen del host**.
4. **tcpdump en todas las interfaces** (`-ni any`, alpine:3 con `--cap-add=NET_ADMIN`,
   filtro `tcp port 443 and host 140.82.121.5`) capturando el test de alpine-sobre-mailcow:

   ```
   19:14:50.674837  br-mailcow  IP 172.22.1.15.44957 > 140.82.121.5.443: Flags [S]
   19:14:50.674946  eth0        IP 185.215.165.254.44957 > 140.82.121.5.443: Flags [S]   ← SYN masqueradeado, sale
   19:14:50.678525  eth0        IP 140.82.121.5.443 > 185.215.165.254.44957: Flags [S.]  ← SYN-ACK VUELVE al host
   19:14:51.684361  eth0        IP 140.82.121.5.443 > ...: Flags [S.]                     ← retransmisión
   19:14:51.692652  br-mailcow  IP 172.22.1.15.44957 > 140.82.121.5.443: Flags [S]        ← el contenedor reenvía su SYN
   ```

   El SYN-ACK **llega al host pero nunca al contenedor** (el contenedor, sin respuesta,
   retransmite el SYN). En `webproxy`, por contraste, el SYN-ACK aparece saliendo por el
   bridge (`? Out 140.82.121.5.443 > 172.25.0.10.53114`) y la conexión se completa.
5. Descartados: policy routing (`ip rule show` sin fwmark ni tablas blackhole),
   tabla `mangle` vacía, DNS/IPv6, RPF, y el propio nginx-proxy (sus tests previos de
   «egress FAIL» eran falsos: no lleva `wget` instalada, exit 127 = command not found).

## 4. Causa raíz

Regla de la cadena `MAILCOW` (creada para aislar la red de mailcow contra el resto):

```
iifname != "br-mailcow" oifname "br-mailcow" meta l4proto tcp drop
```

Dropea **todo** TCP que entra *hacia* `br-mailcow` desde cualquier otra interfaz —
incluido el **tráfico de retorno** de las conexiones salientes masqueradeadas (SYN-ACK,
datos de respuesta, FIN…). El aislamiento que buscaba era «nadie de fuera abre
conexiones nuevas hacia la red de mailcow», pero sin restricción de estado mataba también
el retorno de las salientes: cualquier contenedor de `mailcow-smtp` perdía todo egress TCP.

## 5. Fix

Añadir `ct state new` a la regla: solo se dropean las conexiones **nuevas** entrantes
(conserva el aislamiento); el retorno de conexiones establecidas pasa.

- Ruleset en vivo (16-11-2026):
  ```
  sudo nft 'replace rule ip filter MAILCOW handle 178 \
    iifname != "br-mailcow" oifname "br-mailcow" meta l4proto tcp ct state new \
    counter drop comment "mailcow isolation: solo conexiones nuevas"'
  ```
- Persistencia (16-11-2026): `/etc/iptables/rules.v4` (línea ~247), parcheada a:
  ```
  -A MAILCOW ! -i br-mailcow -o br-mailcow -p tcp -m state --state NEW \
    -m comment --comment "mailcow isolation: solo conexiones nuevas" -j DROP
  ```
  `netfilter-persistent` (habilitado) la carga al boot → la fix sobrevive a reinicios.
  (`rules.v6` no tenía reglas en la cadena `MAILCOW`; nada que parchear.)
- La otra regla de la cadena (drop por dport 3306/6379/8983/12345) queda como estaba:
  solo afecta a conexiones entrantes a esos puertos; el tráfico de retorno lleva puerto
  efímero como destino, así que no padece el mismo problema.

## 6. Verificación post-fix

| Test | Resultado |
|---|---|
| `alpine:3` en `mailcowdockerized_mailcow-network` → `wget https://api.github.com` | ✅ 200 |
| `docker exec petai-backend-1` → `fetch('https://api.github.com')` | ✅ 200 en 227 ms |
| `GET /v1/desktop/download/windows` (siguiendo el redirect) | ✅ 200, 8 556 242 B (`Pockai_0.15.0_x64-setup.exe`) |
| `GET /v1/desktop/download/macos` (siguiendo el redirect) | ✅ 200, 10 750 992 B |
| `GET /v1/health` (game-api.pockai.world) | ✅ 200 |
| Aislamiento mailcow | ✅ la regla sigue dropando conexiones nuevas entrantes |

## 7. Lecciones

1. **Reglas de aislamiento de red por interfaz necesitan `ct state new`** (o un salto a
   `ct state established,related accept` antes). Una DROP sin estado de conexión sobre
   tráfico forward masqueradeado corta todo egress de esa red.
2. **El egress del backend va por `mailcow-smtp`** (eth0/default route): cualquier regla
   que toque `br-mailcow` afecta directamente a la API. Si hay que tocar el firewall,
   comprobar el egress del backend y de un contenedor de prueba en esa red.
3. **Diagnóstico de «el contenedor no sale a internet»**: (a) comparar contra otra red de
   Docker que sí funciona; (b) `tcpdump -i any` sobre el flujo exacto y ver *dónde* muere
   (¿sale por eth0? ¿vuelve el SYN-ACK? ¿llega al bridge?); (c) `nft -a list ruleset` con
   contadores antes/después. Los contadores de `accept`/`masquerade` subiendo con la
   conexión muerta apuntan a una DROP aguas abajo en `FORWARD` (retorno), no a la ida.
4. **Persistir siempre en `/etc/iptables/rules.v4`** (netfilter-persistent): lo que se
   aplica con `nft` en vivo se pierde al reiniciar.
5. **Falsos negativos en tests de egress desde contenedores**: comprobar que la utilidad
   existe antes de concluir «fallo de red» (`wget`/`nc` no están en nginx:alpine ni en
   node:alpine; exit 127 = command not found, no timeout).
