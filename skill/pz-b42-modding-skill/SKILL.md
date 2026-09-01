---
name: pz-b42-modding-skill
description: Guía completa para crear mods de Project Zomboid Build 42 con el MCP pz-mcp-server (armas, items, texturas, iconos, poster, loot mundial, sonidos). Use when the user mentions Project Zomboid, PZ, B42, mods, armas o items nuevos, retexture, iconos, póster, loot, crafteo, o las tools generate_mod/generate_script/analyze_mod.
---

# Mods de Project Zomboid Build 42 (MCP pz-mcp-server)

## Flujo estándar de creación (siempre en este orden)

1. **Si el usuario es nuevo, pregúntale antes de generar**: nombre visible, fuerza vs vanilla, rareza del loot, idiomas. Ofrece la opción recomendada primero.
2. **Calibra stats contra vanilla B42** (tabla de abajo) — no inventes escalas.
3. **Genera con el tool MCP `generate_mod`** (params: items, models, recipes, worldLoot, languages, translations, outputPath, overwrite). outputPath sugerido: `C:/Users/<user>/Documents/Codigo/generated-mods/<ModId>`.
4. **Verifica con `analyze_mod`** — resultado esperado: Balance 100/100, sin issues.
5. **Instala** copiando la carpeta a `C:\Users\<user>\Zomboid\mods\<ModId>\`.
6. **CIERRA SIEMPRE con los comandos de prueba** (preferencia del usuario):
   ```lua
   getPlayer():getInventory():AddItem("<ModId>.<Item>")
   ```
   ```
   additem "NombreDeJugador" "<ModId>.<Item>" 1
   ```

## Reglas críticas (lecciones aprendidas — no negociables)

- **NUNCA escribir en la carpeta del juego** (`...\ProjectZomboid\`). Es solo lectura (para copiar assets vanilla como base). El mod es un paquete autocontenido: viaja completo al Workshop y el jugador descarga todo sin pegar nada.
- **mod.info: solo inglés/ASCII.** Los acentos (ó, á...) rompen la lectura del juego (encoding). Los acentos van SOLO en traducciones (`Translate/<IDIOMA>/ItemName.json`), que sí manejan UTF-8.
- **Texturas del modelo 3D:**
  - Tamaño SIEMPRE potencia de dos (128/256/512/1024) y mismas proporciones que la vanilla. Un tamaño inválido → el juego cae silenciosamente a la textura vanilla.
  - Partir SIEMPRE del PNG vanilla y pintar SOLO colores; no mover regiones ni recortar.
  - La textura es un **UV unwrap, no una ilustración**. Si el usuario pinta "una foto del arma", el mapeo falla → diagnosticar con textura de bandas de colores y corregir.
- **Tras una retexture, recordar SIEMPRE al usuario** que también puede personalizar `icon.png` (menú), `poster.png` (Workshop) y el icono de inventario `Item_<Icon>.png` — todo dentro del mod.
- **Sonidos custom**: OGG en `media/sound/` + bloque `sound` en `media/scripts/sounds/`:
  ```
  sound Nombre { category = Item, maxInstancesPerEmitter = 2, clip { file = media/sound/Nombre.ogg, distanceMax = 10, volume = 0.6 } }
  ```
- **Iconos automáticos**: `generate_mod` crea `icon.png` 256x256, `poster.png` 512x288 e `Item_<Icon>.png` 128x128 con silueta procedural (axe/blade según Categories). Reemplazables por arte propio con el MISMO nombre.
- **GUIA.md**: cada mod se genera con guía paso a paso dentro de la carpeta. Referirse a ella antes de improvisar instrucciones.

## Referencias vanilla B42 (parseadas del juego del usuario)

| Arma | MaxDamage/MinDamage | ConditionMax/LowerChance | Crit/CritDmg |
|---|---|---|---|
| Hacha 2 manos (Axe) | 2.0 / 0.8 | 13 / 35 | 20 / 5.0 |
| Katana | 8.0 / 8.0 | 10 / 15 | 35 / 6.0 |
| HuntingKnife | 1.2 / 0.6 | 10 / 15 | 50 / 3.0 |

- Cuchillos: `SubCategory = Stab`, `SwingAnim = Stab`, `TwoHandWeapon = false`, `AttachmentType = Knife`, sonidos `HuntingKnife*`.
- **B42 obligatorio**: `ItemType = base:<tipo>` (weapon/food/normal/clothing/weaponpart), `Categories` namespaced (`base:axe`, `base:longblade`, `base:smallblade`), `Tags` namespaced (`base:choptree`, `base:hasmetal`, `base:sharpenable`...). `Type = Weapon` ya no se usa en vanilla.
- **craftRecipe B42**: `time`, `category`, `inputs { item N [Base.X] mode:destroy }`, `outputs { item N <ModId>.<Item> }`, `itemMapper`. `mode:keep` para herramientas (ej. `tags[WeldingMask] mode:keep`).
- **Loot mundial**: `media/lua/server/Items/Distributions_<ModId>.lua` con:
  ```lua
  table.insert(ProceduralDistributions["list"]["MeleeWeapons"].items, "<ModId>.<Item>");
  table.insert(ProceduralDistributions["list"]["MeleeWeapons"].items, 1);
  ```
  Listas útiles: `MeleeWeapons(_Mid/_Late)`, `GunStoreKnives`, `ArmyBunkerLockers`, `SurvivalGear`, `PawnShopKnives`, `PoliceLockers`, `GunStoreDisplayCase`. Peso: 1 = común relativo, 0.01 = rarísimo.

## Herramientas MCP (repo: `C:\Users\Jlian\Documents\Codigo\pz-mcp-server`)

- `generate_mod` — paquete completo listo para copiar (incluye GUIA.md + comandos de prueba).
- `generate_script` — item/recipe/model individual (usar `category: "Weapon"` para template de arma).
- `validate_script` — validar sintaxis B42 (whitelist actualizada a B42).
- `analyze_mod` — reporte de estructura/balance.
- `parse_game_files` — reindexar DB (usar `forceReparse: true` tras cambios del parser).
- `search_vanilla` — buscar items/sonidos/craftrecipes indexados.
- **Si el MCP no está cargado como tool nativo en la sesión** (p. ej. opencode arrancó antes de la config), invocarlo por stdio JSON-RPC:
  ```
  líneas JSON-RPC | node C:\Users\Jlian\Documents\Codigo\pz-mcp-server\dist\index.js
  ```
  Secuencia: `initialize` → `notifications/initialized` → `tools/call`. Tras editar src: `npm run build` (tsc emite a pesar de errores de tipos preexistentes).

## Estructura B42 que genera el MCP

```
<ModId>/
├── mod.info                      (inglés ASCII)
└── 42.0/
    ├── mod.info                  (+ modversion, versionMin=42.0)
    ├── icon.png / poster.png     (generados)
    ├── media/scripts/items/Item_<ModId>.txt      (module <ModId> + imports Base)
    ├── media/scripts/models/<ModId>_models.txt   (module Base)
    ├── media/scripts/recipes/recipes_<modid>.txt (module Base, si hay)
    ├── media/lua/server/Items/Distributions_<ModId>.lua (si hay loot)
    ├── media/lua/shared/Translate/<IDIOMA>/ItemName.json
    └── media/textures/Item_<Icon>.png            (icono inventario)
```

OJO: mods B42 pueden usar carpetas versionadas `42`, `42.0`, etc. + `common/` para assets compartidos. El MCP soporta todas.
