# EAS Update para Sipply — estado y lo que falta

Objetivo: cambiar JS del app sin rebuild nativo de ~20 min y sin cable.
`eas update` publica un bundle nuevo; el app lo recoge al próximo arranque.

## Hecho (en el worktree `eas-update`, rama `eas-update`)

- `expo-updates@~57.0.19` instalado (`npx expo install`).
- `eas.json` creado con dos canales: `production` y `preview`.
- `app.json` → `"runtimeVersion": { "policy": "fingerprint" }`.

### Por qué `fingerprint` y no `appVersion`

`fingerprint` calcula un hash del proyecto NATIVO. Si cambia un módulo
nativo, un permiso, el Info.plist o el ícono, el hash cambia y los
binarios viejos dejan de recibir esos updates automáticamente.

Con `appVersion` el runtime sería solo `1.0.0`, y como aquí se hacen
builds nativos sin subir la versión, sería fácil empujar JS que espera
código nativo que el binario instalado no tiene → crash en arranque.
`fingerprint` hace ese error imposible en vez de dejarlo a la disciplina.

## Falta — 3 comandos que piden credenciales (los corre Jan)

    eas login
    eas init                # crea el proyecto EAS y escribe extra.eas.projectId
    eas update:configure    # escribe updates.url = https://u.expo.dev/<projectId>

`updates` está en `null` a propósito: su `url` lleva el projectId dentro,
y ese solo existe después de `eas init`. No se inventa a mano.

## Después: UN rebuild nativo, con cable

`expo-updates` trae código nativo, así que el binario que hay hoy en el
teléfono NO sabe buscar updates. Hace falta un build más:

    /tmp/drinkdex-build-lock.sh acquire "eas update setup"
    scripts/build-ios.sh device
    /tmp/drinkdex-build-lock.sh release

Ese es el último que necesita cable. De ahí en adelante:

    eas update --branch production --message "lo que cambió"

## Lo que un update OTA NO puede hacer

Solo JS y assets. Cualquier cosa nativa —módulo nuevo, permiso, plugin,
ícono, algo dentro de `ios/`— sigue necesitando rebuild + reinstalar.
El fingerprint lo detecta solo y no entrega el update a binarios viejos.

## Ojo: `npm install` se come el symlink de node_modules

El README de worktrees dice que `node_modules` es un symlink al checkout
principal. **`npm install` NO instala a través de un symlink**: lo
reemplaza por un directorio real. Este worktree ahora tiene 632 MB
propios.

Efecto bueno: el `node_modules` compartido quedó intacto, así que las
otras sesiones no se enteraron — si se hubiera instalado en el
compartido, el autolinking de Expo habría metido `expo-updates` en SUS
builds sin avisar.

Efecto malo: 632 MB en un disco con ~8 GB libres. Al hacer merge de esta
rama, borra el worktree para recuperarlos:

    git worktree remove ~/Projects/drinkdex-worktrees/eas-update
