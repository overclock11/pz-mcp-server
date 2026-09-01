import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { ScriptGenerator } from './ScriptGenerator.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { Canvas, drawWeapon, shapeFromCategories } from '../utils/PngGenerator.js';

export interface ModItemSpec {
  name: string;
  properties?: Record<string, any>;
}

export interface ModModelSpec {
  name: string;
  mesh: string;
  texture?: string;
  scale?: number;
  worldOffset?: string;
  worldRotate?: string;
}

export interface ModRecipeSpec {
  name: string;
  [key: string]: any;
}

export interface LootEntry {
  distribution: string;
  weight: number;
}

export interface GenerateModOptions {
  modId: string;
  modName: string;
  description?: string;
  author?: string;
  version?: string;
  gameVersion?: string;
  outputPath: string;
  overwrite?: boolean;
  items: ModItemSpec[];
  models?: ModModelSpec[];
  recipes?: ModRecipeSpec[];
  worldLoot?: LootEntry[];
  languages?: string[];
  translations?: Record<string, Record<string, string>>;
}

export interface GeneratedModResult {
  outputPath: string;
  files: string[];
  modId: string;
  itemIds: string[];
}

// 1x1 transparent PNG placeholder (fallback only)
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function renderWeaponArt(shape: 'axe' | 'blade', width: number, height: number, withBackground: boolean): Buffer {
  const canvas = new Canvas(width, height);
  if (withBackground) {
    canvas.gradientV('#2b323b', '#12151a');
    canvas.ring(width / 2, height / 2, Math.min(width, height) * 0.46, Math.max(2, width / 100), '#3d4652');
    canvas.fillRect(0, height - Math.max(4, height / 18), width, Math.max(4, height / 18), '#c9a227', 140);
  }
  drawWeapon(canvas, shape, width / 2, height / 2, Math.min(width, height) * 0.52);
  return canvas.toPng();
}

export class ModProjectGenerator {
  private scriptGenerator: ScriptGenerator;

  constructor(db: DatabaseManager) {
    this.scriptGenerator = new ScriptGenerator(db);
  }

  async generateMod(options: GenerateModOptions): Promise<GeneratedModResult> {
    const gameVersion = options.gameVersion || '42.0';
    const root = options.outputPath;

    if (existsSync(root) && !options.overwrite) {
      throw new Error(`Target folder already exists: ${root} (pass overwrite=true to replace files)`);
    }

    const files: string[] = [];
    const write = (relPath: string, content: string | Buffer): void => {
      const absPath = join(root, relPath);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content);
      files.push(relPath);
    };

    // ---- mod.info (root + versioned folder) ----
    const baseInfoLines = [
      `name=${options.modName}`,
      `icon=icon.png`,
      `poster=poster.png`,
      `id=${options.modId}`,
      `description=${options.description || `Generated mod: ${options.modName}`}`,
      `author=${options.author || 'pz-mcp-server'}`,
    ];
    write('mod.info', baseInfoLines.join('\n') + '\n');
    write(
      join(gameVersion, 'mod.info'),
      [...baseInfoLines, `modversion=${options.version || '1.0.0'}`, `versionMin=${gameVersion}`].join('\n') + '\n'
    );

    // ---- item scripts (single module block, module = modId, imports Base) ----
    const itemChunks: string[] = [];
    for (const item of options.items) {
      itemChunks.push(await this.scriptGenerator.generateScriptUnwrapped('item', item.name, item.properties || {}));
    }
    if (itemChunks.length > 0) {
      const content = this.wrapModule(options.modId, itemChunks.join('\n\n'));
      write(join(gameVersion, 'media', 'scripts', 'items', `Item_${options.modId}.txt`), content);
    }

    // ---- model definitions (module Base) ----
    if (options.models && options.models.length > 0) {
      const modelChunks: string[] = [];
      for (const model of options.models) {
        modelChunks.push(await this.scriptGenerator.generateScriptUnwrapped('model', model.name, model as any));
      }
      const content = this.wrapModule('Base', modelChunks.join('\n\n'));
      write(join(gameVersion, 'media', 'scripts', 'models', `${options.modId}_models.txt`), content);
    }

    // ---- craftRecipes (module Base) ----
    if (options.recipes && options.recipes.length > 0) {
      const recipeChunks: string[] = [];
      for (const recipe of options.recipes) {
        recipeChunks.push(await this.scriptGenerator.generateScriptUnwrapped('recipe', recipe.name, recipe));
      }
      const content = this.wrapModule('Base', recipeChunks.join('\n\n'));
      write(join(gameVersion, 'media', 'scripts', 'recipes', `recipes_${options.modId.toLowerCase()}.txt`), content);
    }

    // ---- world loot distribution (server Lua) ----
    if (options.worldLoot && options.worldLoot.length > 0) {
      const targetItem = `${options.modId}.${options.items[0].name}`;
      const lootLines: string[] = [
        `-- World loot distribution for ${options.modId} (generated by pz-mcp-server)`,
        `-- Item: ${targetItem} | List reference: pzwiki.net/wiki/Procedural_distributions`,
        '',
      ];
      for (const loot of options.worldLoot) {
        lootLines.push(`table.insert(ProceduralDistributions["list"]["${loot.distribution}"].items, "${targetItem}");`);
        lootLines.push(`table.insert(ProceduralDistributions["list"]["${loot.distribution}"].items, ${loot.weight});`);
        lootLines.push('');
      }
      write(join(gameVersion, 'media', 'lua', 'server', 'Items', `Distributions_${options.modId}.lua`), lootLines.join('\n'));
    }

    // ---- translations (ItemName.json per language) ----
    const languages = options.languages && options.languages.length > 0 ? options.languages : ['EN'];
    for (const lang of languages) {
      const custom = options.translations?.[lang];
      const entries: Record<string, string> = {};
      for (const item of options.items) {
        const key = `${options.modId}.${item.name}`;
        entries[key] = custom?.[key] || custom?.[item.name] || item.properties?.DisplayName || item.name;
      }
      write(join(gameVersion, 'media', 'lua', 'shared', 'Translate', lang, 'ItemName.json'), JSON.stringify(entries, null, 4) + '\n');
    }

    // ---- inventory icon names (Item_<Icon>.png) ----
    const iconNames = new Set<string>();
    for (const item of options.items) {
      const icon = item.properties?.Icon;
      if (typeof icon === 'string' && icon.trim()) {
        iconNames.add(icon.trim());
      }
      const iconsForTexture = item.properties?.IconsForTexture;
      if (typeof iconsForTexture === 'string') {
        iconsForTexture.split(';').map(s => s.trim()).filter(Boolean).forEach(n => iconNames.add(n));
      }
    }

    // ---- generated art: mod icon, poster and inventory icons ----
    const shape = shapeFromCategories(options.items[0]?.properties?.Categories);
    write(join(gameVersion, 'icon.png'), renderWeaponArt(shape, 256, 256, true));
    write(join(gameVersion, 'poster.png'), renderWeaponArt(shape, 512, 288, true));
    for (const iconName of iconNames) {
      write(join(gameVersion, 'media', 'textures', `Item_${iconName}.png`), renderWeaponArt(shape, 128, 128, false));
    }

    // ---- step-by-step guide ----
    const guide = this.buildGuide(options, files, gameVersion, iconNames);
    write('GUIA.md', guide);

    return {
      outputPath: root,
      files,
      modId: options.modId,
      itemIds: options.items.map(item => `${options.modId}.${item.name}`),
    };
  }

  private buildGuide(
    options: GenerateModOptions,
    files: string[],
    gameVersion: string,
    iconNames: Set<string>
  ): string {
    const gvDir = join(gameVersion, 'media');
    const lines: string[] = [];

    lines.push(`# Guía del mod: ${options.modName} (${options.modId})`);
    lines.push('');
    lines.push(`Mod generado por pz-mcp-server para Project Zomboid **Build ${gameVersion}**. Sigue los pasos en orden — al terminar el Paso 1 ya puedes probarlo en el juego.`);
    lines.push('');
    lines.push(`> **REGLA DE ORO**: TODAS las rutas de esta guía están DENTRO de la carpeta del mod (\`${options.modId}\\\`).`);
    lines.push(`> **NUNCA** copies, edites ni borres archivos en la carpeta de instalación del juego (\`...\\ProjectZomboid\\\`).`);
    lines.push(`> El mod es un paquete autocontenido: viaja completo al Workshop y el jugador lo descarga entero sin pegar nada a mano.`);
    lines.push('');

    // What was generated
    lines.push(`## Qué se generó`);
    lines.push('');
    lines.push('| Archivo | Para qué sirve |');
    lines.push('|---|---|');
    lines.push(`| \`mod.info\` | Metadatos del mod (nombre, id) — lo lee el menú de Mods |`);
    lines.push(`| \`${gameVersion}/mod.info\` | Igual, + versión mínima del juego |`);
    for (const file of files) {
      if (file.includes('scripts') && file.includes('Item_')) lines.push(`| \`${file}\` | Script del item (stats, daño, sonidos) |`);
      else if (file.includes('_models')) lines.push(`| \`${file}\` | Definición del modelo 3D |`);
      else if (file.includes('recipes')) lines.push(`| \`${file}\` | Receta de crafteo (craftRecipe) |`);
      else if (file.includes('Distributions')) lines.push(`| \`${file}\` | Distribución de loot mundial (dónde aparece el item) |`);
      else if (file.includes('Translate')) lines.push(`| \`${file}\` | Nombre visible del item en el juego |`);
      else if (file.endsWith('icon.png')) lines.push(`| \`${file}\` | Icono del mod — **GENERADO automáticamente** (silueta del arma), reemplazable |`);
      else if (file.endsWith('poster.png')) lines.push(`| \`${file}\` | Póster de Workshop — **GENERADO automáticamente**, reemplazable |`);
      else if (file.includes('textures')) lines.push(`| \`${file}\` | Icono de inventario — **GENERADO automáticamente** (128x128), reemplazable |`);
    }
    lines.push('');

    // Step 1 — test now
    lines.push(`## Paso 1 — Probar el mod YA (2 minutos, sin arte)`);
    lines.push('');
    lines.push(`1. Copia la carpeta completa \`${options.modId}\` a tu carpeta de mods:`);
    lines.push(`   `);
    lines.push(`   \`\`\``);
    lines.push(`   C:\\Users\\<tu-usuario>\\Zomboid\\mods\\${options.modId}`);
    lines.push(`   \`\`\``);
    lines.push(`2. Abre Project Zomboid → **Mods** → activa **${options.modName}**`);
    lines.push(`3. Entra a una partida (o crea una nueva)`);
    lines.push(`4. Para ver el item al instante: activa el **modo debug** (en el menú de Mods marca "Debug" antes de cargar, o añade \`-debug\` al lanzar el juego) y usa el **spawner de items** (clic derecho en el suelo → Objects → Item Spy / lista de items) buscando "${options.items[0]?.name || 'tu item'}"`);
    lines.push(`5. Verás el item con icono placeholder (cuadrado transparente) y stats completos. **Ya funciona.**`);
    lines.push('');
    lines.push(`### Spawn instantáneo desde la consola (con debug activo)`);
    lines.push('');
    lines.push(`Abre la consola con la tecla \` \`\` (backtick, bajo ESC) y escribe:`);
    lines.push('');
    lines.push('```');
    for (const item of options.items) {
      lines.push(`additem "TuNombreDeJugador" "${options.modId}.${item.name}" 1`);
    }
    lines.push('```');
    lines.push('');
    lines.push(`O desde la **consola Lua** (panel debug → "Lua console"):`);
    lines.push('');
    lines.push('```lua');
    for (const item of options.items) {
      lines.push(`getPlayer():getInventory():AddItem("${options.modId}.${item.name}")`);
    }
    lines.push('```');
    lines.push('');
    lines.push(`- \`additem\` acepta cantidad como último argumento; \`AddItem\` agrega 1 por llamada (usa un loop para más).`);
    lines.push(`- Si el item no aparece, revisa el log \`C:\\Users\\<tu-usuario>\\Zomboid\\console.txt\` tras lanzar el juego.`);
    lines.push('');

    // Step 2 — icons
    lines.push(`## Paso 2 — Iconos de inventario (obligatorio para que se vea bien)`);
    lines.push('');
    lines.push(`Cada item necesita UN PNG cuadrado (64x64 o 128x128, fondo transparente) con este nombre EXACTO:`);
    lines.push('');
    lines.push('| Item | Reemplaza este archivo (dentro del mod) |');
    lines.push('|---|---|');
    for (const iconName of iconNames) {
      lines.push(`| ${iconName} | \`${options.modId}\\${gvDir}\\textures\\Item_${iconName}.png\` |`);
    }
    lines.push('');
    lines.push(`- Puedes renderizar tu modelo 3D desde Blender (cámara frontal, fondo transparente) o dibujarlo a mano.`);
    lines.push(`- Truco: copia el PNG vanilla SOLO como base de edición (ej. \`D:\\...\\ProjectZomboid\\media\\textures\\Item_HandAxe.png\` — solo lectura) y guarda el resultado en la ruta de arriba, dentro del mod.`);
    lines.push(`- También reemplaza \`${options.modId}\\${gameVersion}\\icon.png\` (icono del menú) y \`${options.modId}\\${gameVersion}\\poster.png\` (póster para Workshop).`);
    lines.push('');

    // Step 3 — 3D model
    lines.push(`## Paso 3 — Modelo 3D (OPCIONAL — el mod ya funciona sin esto)`);
    lines.push('');
    if (options.models && options.models.length > 0) {
      lines.push(`Estado actual: los bloques \`model\` reutilizan meshes vanilla, así que **ya se ve en 3D sin trabajo extra**:`);
      lines.push('');
      lines.push('| Modelo | Mesh vanilla usado |');
      lines.push('|---|---|');
      for (const model of options.models) {
        lines.push(`| ${model.name} | \`${model.mesh}\` (scale ${model.scale ?? 1.0}) |`);
      }
      lines.push('');
      lines.push(`Para usar un modelo PROPIO (todo DENTRO de la carpeta del mod):`);
      lines.push(`1. Modela en **Blender** (escala real en metros; un hacha ≈ 0.5-0.7 m; origen del objeto en la base del mango)`);
      lines.push(`2. Exporta **FBX** a: \`${options.modId}\\${gvDir}\\models_X\\weapons\\1handed\\<Nombre>.fbx\``);
      lines.push(`3. Exporta la textura PNG a: \`${options.modId}\\${gvDir}\\textures\\weapons\\1handed\\<Nombre>.png\``);
      lines.push(`4. Edita el bloque en \`${options.modId}\\${files.find(f => f.includes('_models')) || join(gameVersion, 'media', 'scripts', 'models')}\`:`);
      lines.push('   ```');
      for (const model of options.models) {
        lines.push(`   model ${model.name}`);
        lines.push(`   {`);
        lines.push(`       mesh = weapons/1handed/<Nombre>,      ← cambia aquí`);
        lines.push(`       texture = weapons/1handed/<Nombre>,   ← y aquí`);
        lines.push(`       scale = ${model.scale ?? 1.0},`);
        lines.push(`       ...`);
      }
      lines.push('   ```');
      lines.push(`5. \`worldOffset\` / \`worldRotate\` controlan cómo se ve tirado en el suelo — ajusta a ojo si queda flotando.`);
    } else {
      lines.push(`Este mod no definió bloques \`model\`. El item usará el sprite/mesh que el juego asocie a \`WeaponSprite\`.`);
    }
    lines.push('');

    // Running step counter for the remaining sections
    let nextStep = 4;

    // Step — retexture (identity without modeling)
    if (options.models && options.models.length > 0) {
      lines.push(`## Paso ${nextStep} — Retexture: cambia el look SIN modelar (recomendado)`);
      nextStep++;
      lines.push('');
      lines.push(`El mesh vanilla tiene sus UVs listas — puedes darle identidad propia solo cambiando la textura:`);
      lines.push('');
      lines.push(`1. Localiza la textura vanilla del mesh que usas (SOLO lectura):`);
      lines.push(`   \`...\\ProjectZomboid\\media\\textures\\<ruta del mesh>.png\` — ej. \`weapons\\2handed\\FireAxe.png\``);
      lines.push(`2. Edítala en GIMP/Photoshop: colores, metal, desgaste, runas — lo que defina tu arma`);
      lines.push(`3. Guarda el resultado DENTRO del mod: \`${options.modId}\\${gvDir}\\textures\\<misma-ruta>\\<TuTextura>.png\``);
      lines.push(`4. Cambia la línea \`texture\` del bloque model (en \`${options.modId}\\${files.find(f => f.includes('_models')) || 'models'}\`):`);
      lines.push('   ```');
      lines.push(`   texture = <ruta-del-mesh>,        ← original (se ve vanilla)`);
      lines.push(`   texture = <ruta-del-mesh>/<TuTextura>,  ← tu versión`);
      lines.push('   ```');
      lines.push(`Nota: las texturas vanilla son chicas (32x64 típico) — respeta las proporciones de las UVs, no hace falta más resolución.`);
      lines.push('');
    }

    // Step — custom sounds
    lines.push(`## Paso ${nextStep} — Sonidos propios (opcional)`);
    nextStep++;
    lines.push('');
    lines.push(`Los items usan sonidos vanilla compartidos (\`AxeHit\`, \`MacheteSwing\`...). Para que TU arma suene única:`);
    lines.push('');
    lines.push(`1. Prepara tus efectos en **OGG** (Audacity exporta OGG gratis): golpe, swing, rotura, caída al suelo`);
    lines.push(`2. Guárdalos en: \`${options.modId}\\${gvDir}\\media\\sound\\<TuSonido>.ogg\``);
    lines.push(`3. Crea \`${options.modId}\\${gvDir}\\media\\scripts\\sounds\\sounds_${options.modId.toLowerCase()}.txt\` con este formato:`);
    lines.push('   ```');
    lines.push(`   module ${options.modId}`);
    lines.push(`   {`);
    lines.push(`       sound ${options.modId}Hit`);
    lines.push(`       {`);
    lines.push(`           category = Item,`);
    lines.push(`           maxInstancesPerEmitter = 2,`);
    lines.push(`           clip`);
    lines.push(`           {`);
    lines.push(`               file = media/sound/${options.modId}Hit.ogg,`);
    lines.push(`               distanceMax = 10,`);
    lines.push(`               volume = 0.6,`);
    lines.push(`           }`);
    lines.push(`       }`);
    lines.push(`   }`);
    lines.push('   ```');
    lines.push(`4. En el script del item, cambia las referencias: \`HitSound = ${options.modId}Hit,\` (y SwingSound, BreakSound, DropSound...)`);
    lines.push('');

    // Step — recipes
    if (options.recipes && options.recipes.length > 0) {
      lines.push(`## Paso ${nextStep} — Receta de crafteo`);
      nextStep++;
      lines.push('');
      lines.push(`| Receta | Categoría en el menú de crafteo | Ingredientes |`);
      lines.push(`|---|---|---|`);
      for (const recipe of options.recipes) {
        const ingredients = Array.isArray(recipe.ingredients)
          ? recipe.ingredients.map((i: any) => typeof i === 'string' ? i : i.item).join(', ')
          : '-';
        lines.push(`| ${recipe.name} | ${recipe.category || 'Survival'} | ${ingredients} |`);
      }
      lines.push('');
      lines.push(`La receta ya está operativa. Para cambiarla, edita \`recipes_${options.modId.toLowerCase()}.txt\` — respeta la sintaxis B42 (\`mode:keep\`, \`flags[...]\`, \`tags[...]\`).`);
      lines.push('');
    }

    // Step — world loot
    if (options.worldLoot && options.worldLoot.length > 0) {
      lines.push(`## Paso ${nextStep} — Loot mundial (dónde encontrarlo)`);
      nextStep++;
      lines.push('');
      lines.push(`El item **NO se craftea** — aparece en el mundo por distribución de loot. Archivo: \`media/lua/server/Items/Distributions_${options.modId}.lua\``);
      lines.push('');
      lines.push(`| Contenedor/zona (distribución) | Peso (mayor = más común) |`);
      lines.push(`|---|---|`);
      for (const loot of options.worldLoot) {
        lines.push(`| ${loot.distribution} | ${loot.weight} |`);
      }
      lines.push('');
      lines.push(`- Los pesos son relativos: \`2\` es el doble de frecuente que \`1\`. Valores como \`0.01\` son rarezas extremas.`);
      lines.push(`- Lista completa de distribuciones válidas: pzwiki.net/wiki/Procedural_distributions`);
      lines.push(`- El loot se genera en mapas NUEVOS o zonas no exploradas; en partidas ya exploradas los contenedores no se re-llenan.`);
      lines.push('');
    }

    // Step — translations
    lines.push(`## Paso ${nextStep} — Nombre visible (traducciones)`);
    lines.push('');
    lines.push(`El nombre que muestra el juego viene de \`ItemName.json\`, NO del script. Edítalo para cambiar el nombre sin tocar nada más:`);
    lines.push('');
    lines.push('```json');
    lines.push(`// ${gvDir}\\lua\\shared\\Translate\\ES\\ItemName.json`);
    for (const item of options.items) {
      lines.push(`"${options.modId}.${item.name}": "${item.properties?.DisplayName || item.name}"`);
    }
    lines.push('```');
    lines.push('');

    // Master customization table
    lines.push(`## Superficies de identidad — todo lo que puedes personalizar`);
    lines.push('');
    lines.push(`Tu arma NO tiene por qué verse como algo vanilla. Lista completa, de más a menos impacto:`);
    lines.push('');
    lines.push(`| # | Superficie | Qué cambia para el jugador | Dónde (dentro del mod) | Herramienta |`);
    lines.push(`|---|---|---|---|---|`);
    lines.push(`| 1 | **Modelo 3D propio** | Silueta única en mano y suelo | \`${gvDir}\\models_X\\weapons\\...\\<Nombre>.fbx\` + línea \`mesh\` | Blender (export FBX) |`);
    lines.push(`| 2 | **Textura del modelo** | Acabado/colores propios sin modelar | \`${gvDir}\\textures\\weapons\\...\\<TuTextura>.png\` + línea \`texture\` | GIMP/Photoshop sobre UV vanilla |`);
    lines.push(`| 3 | **Icono de inventario** | Lo que ves en la bolsa (128x128 PNG con transparencia) | \`${gvDir}\\textures\\Item_<Icon>.png\` | Render de Blender o edición |`);
    lines.push(`| 4 | **Sonidos propios** | Golpe, swing, rotura únicos | \`${gvDir}\\media\\sound\\*.ogg\` + bloque \`sound\` en scripts/sounds | Audacity (OGG) |`);
    lines.push(`| 5 | **Nombre localizado** | Nombre en cada idioma | \`${gvDir}\\lua\\shared\\Translate\\<IDIOMA>\\ItemName.json\` | Editor de texto |`);
    lines.push(`| 6 | **Tooltip del item** | Descripción al pasar el cursor | Propiedad \`Tooltip = "texto",\` en el script del item | Editor de texto |`);
    lines.push(`| 7 | **Icono del mod** | Cómo se ve en el menú de Mods | \`${gameVersion}\\icon.png\` | Cualquier editor |`);
    lines.push(`| 8 | **Póster de Workshop** | Página de Steam Workshop | \`${gameVersion}\\poster.png\` (+ capturas al subir) | Cualquier editor |`);
    lines.push(`| 9 | **Stats y tags** | Feel de combate (daño, knockdown, qué puede cortar) | \`${gvDir}\\scripts\\items\\...\` | Este MCP (\`generate_script\`) |`);
    lines.push('');
    lines.push(`**Mínimo viable con identidad propia** (sin Blender): pasos 2 + 3 + 5 — una tarde de edición de imágenes y tu arma ya no se parece a ninguna vanilla.`);
    lines.push('');

    // Step — edit stats
    const firstItem = options.items[0];
    const firstProps = firstItem?.properties || {};
    lines.push(`## Editar los stats del arma`);
    lines.push('');
    lines.push(`Todo el comportamiento vive en UN archivo: \`${options.modId}\\${gvDir}\\scripts\\items\\Item_${options.modId}.txt\`. Edítalo con cualquier editor de texto y respeta el formato \`Propiedad = valor,\` (con coma al final).`);
    lines.push('');
    lines.push(`### Valores actuales de tu item vs referencia vanilla B42`);
    lines.push('');
    lines.push(`| Propiedad | Tu item | Referencia vanilla |`);
    lines.push(`|---|---|---|`);
    const statRows: Array<[string, string]> = [
      ['MaxDamage', 'hacha 2 manos: 2.0 · katana: 8.0'],
      ['MinDamage', 'hacha 2 manos: 0.8 · katana: 8.0'],
      ['ConditionMax', 'hacha 2 manos: 13 · katana: 10'],
      ['ConditionLowerChanceOneIn', 'hacha 2 manos: 35 · katana: 15'],
      ['CriticalChance', 'hacha 2 manos: 20 · katana: 35'],
      ['CritDmgMultiplier', 'hacha 2 manos: 5.0 · katana: 6.0'],
      ['Weight', 'hacha 2 manos: ~3.0'],
      ['TreeDamage', 'hacha 2 manos: 35'],
      ['DoorDamage', 'hacha 2 manos: 35'],
    ];
    for (const [prop, ref] of statRows) {
      const current = firstProps[prop] !== undefined ? String(firstProps[prop]) : '—';
      lines.push(`| ${prop} | ${current} | ${ref} |`);
    }
    lines.push('');
    lines.push(`### Cómo ajustar`);
    lines.push('');
    lines.push(`1. Abre \`Item_${options.modId}.txt\` y cambia el número — ej. \`MaxDamage = 3.0,\``);
    lines.push(`2. Si subes MaxDamage muy por encima de MinDamage, revisa que \`MinDamage\` no quede mayor que \`MaxDamage\``);
    lines.push(`3. Valida el resultado con el MCP: \`validate_script\` (pegando el contenido del archivo) — debe dar ✅ Válido`);
    lines.push(`4. Los stats se recargan al **iniciar el juego** (o nueva partida) — no hace falta nada más`);
    lines.push('');
    lines.push(`Reglas rápidas de balance B42: \`ConditionLowerChanceOneIn\` más alto = más durable (degrada 1 de cada N golpes); \`KnockdownMod\` > 2 derriba zombis con frecuencia; \`TreeDamage\` alto = tala rápido.`);
    lines.push('');

    // Common errors
    lines.push(`## Errores comunes y solución`);
    lines.push('');
    lines.push(`| Síntoma | Causa | Solución |`);
    lines.push(`|---|---|---|`);
    lines.push(`| El mod no aparece en el menú de Mods | Falta \`mod.info\` o carpetas mal anidadas | La ruta debe ser \`mods\\${options.modId}\\mod.info\` (sin carpeta extra) |`);
    lines.push(`| Item invisible al tirarlo al suelo | \`model\`/\`mesh\` mal referenciado | Verifica la ruta del mesh (sin extensión) o usa un mesh vanilla |`);
    lines.push(`| Icono cuadrado negro/magenta | Falta \`Item_<Icon>.png\` o el nombre no coincide EXACTO | El PNG debe llamarse igual que el \`Icon\` del script |`);
    lines.push(`| El item no aparece en el spawner | Script con error de sintaxis | Revisa comas y llaves en \`Item_${options.modId}.txt\`; valida con \`validate_script\` del MCP |`);
    lines.push(`| Receta no aparece en el menú | Categoría/etiquetas incorrectas | Revisa \`category\` y \`tags\` del craftRecipe |`);
    lines.push('');

    // Checklist
    lines.push(`## Checklist final`);
    lines.push('');
    lines.push(`- [ ] Mod copiado a \`Zomboid\\mods\\\` y activado en el menú`);
    lines.push(`- [ ] Item probado en juego (modo debug)`);
    lines.push(`- [ ] \`Item_*.png\` de cada item reemplazados por arte real`);
    lines.push(`- [ ] \`icon.png\` y \`poster.png\` reemplazados`);
    if (options.models && options.models.length > 0) {
      lines.push(`- [ ] (Opcional) Modelo 3D propio en \`models_X\``);
    }
    lines.push(`- [ ] Nombres revisados en \`ItemName.json\``);
    lines.push('');

    return lines.join('\n');
  }

  private wrapModule(moduleName: string, content: string): string {
    const lines: string[] = [`module ${moduleName}`, '{'];
    if (moduleName !== 'Base') {
      lines.push('    imports', '    {', '        Base,', '    }', '');
    }
    lines.push(content, '}');
    return lines.join('\n');
  }
}
