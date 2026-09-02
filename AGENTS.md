# AGENTS.md — pz-mcp-server

MCP server para desarrollo de mods de Project Zomboid **Build 42**. Genera mods completos (estructura B42, items, modelos, craftRecipes, loot, traducciones, iconos procedurales) listos para copiar a `Zomboid\mods\` o subir al Workshop.

## Build y prueba

- `npm install && npm run build` — tsc emite a `dist/` **a pesar de errores de tipos preexistentes** (no intentar "arreglar" los ~80 errores TS del código original como bloqueante; solo corregir errores nuevos que rompan runtime).
- Probar el servidor vía stdio JSON-RPC (así lo hace opencode):
  ```
  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}} | node dist\index.js
  ```
  Secuencia: initialize → notifications/initialized → tools/call.
- DB SQLite: `data/pz_database.db` **relativa al cwd del proceso**. El juego se auto-detecta leyendo `libraryfolders.vdf` de Steam (actualmente en `I:\SteamLibrary\steamapps\common\ProjectZomboid`; la vieja ruta `D:\SteamLibrary` ya no existe).
- Tras cambios al parser: `parse_game_files` con `forceReparse: true`.

## Convenciones del proyecto

- **Sin scripts lifecycle en package.json** (preinstall/postinstall) — decisión de seguridad deliberada.
- Dependencia activa: `better-sqlite3` v12 (prebuilds para Node 24). `sqlite3` fue removido (no se usaba).
- El MCP está alineado a **B42**, no B41: `ItemType = base:<tipo>` (no `Type`), `craftRecipe` (no `recipe`), valores namespaced (`base:axe`), whitelists de ValidationEngine actualizadas a B42.
- `getTemplate`: categoría primero (`Weapon` → melee_weapon); tipo genérico `item` sin categoría → `tool_item`. Claves de control del generador (`category`, `weaponType`, `similar`) NO se emiten al script.
- Colisiones de casing entre template y specs: gana el spec (ej. `MaxHitCount` vs `MaxHitcount`).
- `checkReference` prueba id exacto, sin prefijo de módulo y con `Base.`; sprites se validan contra ids/nombres de items.
- Palabra reservada SQLite `references` SIEMPRE entrecomillada en SQL.

## Generación de mods (ModProjectGenerator)

- Estructura: raíz `mod.info` + carpeta versionada `42.0/` (+ `common/` y otras versiones soportadas por el parser vía regex `^\d+(\.\d+)*$`).
- Iconos generados proceduralmente con `src/generators/services/PngGenerator.ts` (encoder PNG puro, sin deps): icon 256x256, poster 512x288, `Item_<Icon>.png` 128x128 con silueta axe/blade según `Categories`.
- `GUIA.md` dinámica por mod: pasos (probar en 2 min, iconos, retexture, sonidos, loot, stats con tabla vs vanilla, errores comunes, checklist). Numeración de pasos con contador `nextStep` (cuidado con TDZ si se agregan secciones).
- Result incluye `modId` e `itemIds` → la respuesta del tool imprime comandos `additem` y Lua `AddItem` con IDs reales. **Siempre cerrar ayuda de mods con el comando de prueba (preferencia del usuario).**
- `worldLoot` → `media/lua/server/Items/Distributions_<ModId>.lua` (patrón `table.insert(ProceduralDistributions...)`, probado en el mod Tactical Axe del workshop).
- `overwrite: true` reescribe archivos propios pero NUNCA borra archivos ajenos (p. ej. texturas custom del usuario).
- **Regla "PNG vanilla SIEMPRE"** (`ModProjectGenerator`): si una textura base vanilla es resoluble, se copia SIEMPRE al mod. Si un item usa `WeaponSprite` vanilla sin bloque `model` propio, se clona el bloque vanilla completo renombrado al item (mesh + attachments `Bip01_Prop2`/`world` intactos — sin esto el arma se sostiene mal) y el `WeaponSprite` del item se parchea al nuevo modelo. La textura se copia RENOMBRADA (`weapons/2handed/<Modelo>.png`, nunca con el nombre vanilla) y la línea `texture` apunta a la copia → el usuario pinta y sobreescribe ese archivo sin tocar scripts, y solo su arma cambia de look (no todas las hachas del juego). Caso sin bloque vanilla (mesh custom) → fallback al generador de specs.
- Props de armas B42: verificar casing contra vanilla antes de emitir (vanilla usa `MinimumSwingtime`, NO `MinimumSwingTime`; craftRecipe no lleva `name =` interno).
- Instalar un mod = `Remove-Item` del destino + `Copy-Item -Recurse`. `Copy-Item -Recurse` sobre un destino que YA existe ANIDA la carpeta (`mods\Stormbreaker\Stormbreaker\...`) y el juego lee la copia vieja de la raíz.
- Regenerar con `overwrite: true` SOBREESCRIBE la textura base copiada de vanilla — si el usuario ya la pintó, respaldarla antes (pendiente: skip si el archivo ya existe y fue modificado).
- Validador: `parseValue` acepta números negativos/científicos; whitelist incluye props de identidad (`Icon`, `WeaponSprite`, `IdleAnim`, `SplatSize`, `ScaleWorldIcon`) y craftRecipe (`time`, `category`). `MetalValue` hasta 200 (vanilla Axe usa 120).

## Reglas de contenido (B42, verificadas contra la instalación del usuario)

- mod.info: solo ASCII/inglés (acentos rompen la lectura). Acentos solo en `Translate/<IDIOMA>/ItemName.json`.
- Stats de referencia vanilla: hacha 2 manos 2.0/0.8 (Cond 13/35), katana 8.0 (Cond 10/15, Crit 35/6.0), HuntingKnife 1.2/0.6 (Cond 10/15, Crit 50/3.0, Stab).
- Sonidos custom: OGG en `media/sound/` + bloque `sound { category = Item, clip { file, distanceMax, volume } }`.
- **craftRecipe inputs: ids SIEMPRE entre corchetes** (`item 4 [Base.MetalBar] mode:destroy,`); `tags[...]` sin corchetes; outputs SIN corchetes (`item 1 ModId.Item,`). Un id pelado en inputs = `CraftRecipe error` al cargar scripts = el juego queda colgado en "iniciar partida" y `console.txt` muestra `ScriptBucket.LoadScripts> Exception thrown`. Diagnosticar SIEMPRE con `Zomboid\console.txt` (últimas ~200 líneas, buscar `removing script due to load error`).
- **PENDIENTE → RESUELTO (bug del generador de recetas)**: el abort de `CraftRecipe.Load` (CraftRecipe.java:524) en `ForgeStormbreaker` era la propiedad suelta `CanBeDoneFromFloor = TRUE` — es un **TAG de bancada**, no una propiedad (pzwiki: "The crafting bench tag is mandatory"). Aislado con probes (mini-mods de una sola construcción, un arranque del juego identifica el culpable en console.txt). El generador ahora emite `Tags = AnySurfaceCraft` y migra cualquier `CanBeDoneFromFloor` de spec a tag. Diagnóstico: inputs `[Base.X] mode:destroy` ✅, drainable `[Base.BlowTorch]` sin mode ✅, `tags[...] mode:keep` ✅, output cross-module pelado ✅, `SkillRequired`/`xpAward`/`timedAction` ✅.
- Texturas: potencia de dos, mismas proporciones que vanilla, partir del PNG vanilla, pintar solo colores (UV unwrap ≠ ilustración).
- Nunca escribir en la carpeta del juego — el mod es autocontenido.

## Estado conocido

- Mod de ejemplo del usuario: `C:\Users\Jlian\Documents\Codigo\generated-mods\` (Stormbreaker, LeonsKnife) e instalados en `C:\Users\Jlian\Zomboid\mods\`.
- Skill: única fuente de verdad es la copia del repo `skill/pz-b42-modding-skill/SKILL.md`. opencode la carga vía `skills.paths` en `~/.config/opencode/opencode.jsonc` apuntando a `<repo>\skill`. NO existe copia en `~/.config/opencode/skill/` — no crearla. El README.md indica cómo la instala un usuario nuevo (copiar a su `~/.config/opencode/skill/`).
