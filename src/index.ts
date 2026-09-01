#!/usr/bin/env node

/**
 * Project Zomboid MCP Server
 * A comprehensive MCP server for Project Zomboid mod development
 * Author: MiniMax Agent
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { pathToFileURL } from "url";
import { DatabaseManager } from "./database/DatabaseManager.js";
import { ProjectZomboidParser } from "./parsers/ProjectZomboidParser.js";
import { ModAnalyzer } from "./analyzers/ModAnalyzer.js";
import { ScriptGenerator } from "./generators/ScriptGenerator.js";
import { ValidationEngine } from "./validation/ValidationEngine.js";
import { PathManager } from "./utils/PathManager.js";
import { ModProjectGenerator } from "./generators/ModProjectGenerator.js";
import { join } from "path";

const server = new Server(
  {
    name: "pz-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize core components
let dbManager: DatabaseManager;
let parser: ProjectZomboidParser;
let analyzer: ModAnalyzer;
let generator: ScriptGenerator;
let validator: ValidationEngine;
let pathManager: PathManager;
let modGenerator: ModProjectGenerator;

async function initializeServer() {
  try {
    // Initialize path manager for PZ installation detection
    pathManager = new PathManager();
    
    // Initialize database
    dbManager = new DatabaseManager();
    await dbManager.initialize();
    
    // Initialize parser with database
    parser = new ProjectZomboidParser(dbManager);
    
    // Initialize other components
    analyzer = new ModAnalyzer(dbManager, parser);
    generator = new ScriptGenerator(dbManager);
    validator = new ValidationEngine(dbManager);
    modGenerator = new ModProjectGenerator(dbManager);
    
    console.error("🎮 Project Zomboid MCP Server initialized successfully");
  } catch (error) {
    console.error("❌ Failed to initialize server:", error);
    process.exit(1);
  }
}

// Schema definitions for tool inputs
const SearchVanillaSchema = z.object({
  query: z.string().describe("Search query for vanilla game content"),
  type: z.enum(["item", "recipe", "sound", "vehicle", "all"]).optional().describe("Filter by content type"),
  category: z.string().optional().describe("Filter by item category"),
  limit: z.number().min(1).max(100).default(20).describe("Maximum number of results"),
});

const GenerateScriptSchema = z.object({
  type: z.enum(["item", "recipe", "model", "evolvedrecipe", "fixing", "sound", "vehicle"]).describe("Type of script to generate"),
  name: z.string().describe("Name of the item/recipe/etc to generate"),
  properties: z.record(z.any()).optional().default({}).describe("Properties and specifications for the generated content"),
  module: z.string().default("Base").describe("Module name to use"),
});

const ValidateScriptSchema = z.object({
  content: z.string().describe("Script content to validate"),
  type: z.enum(["item", "recipe", "evolvedrecipe", "fixing", "sound", "vehicle"]).optional().describe("Expected script type"),
  strict: z.boolean().default(false).describe("Enable strict validation mode"),
});

const CheckReferencesSchema = z.object({
  references: z.array(z.string()).describe("List of references to validate"),
  type: z.enum(["item", "sound", "sprite", "all"]).default("all").describe("Type of references to check"),
});

const AnalyzeModSchema = z.object({
  modPath: z.string().describe("Path to mod directory"),
  checkBalance: z.boolean().default(true).describe("Perform balance analysis"),
  checkCompatibility: z.boolean().default(true).describe("Check compatibility with vanilla"),
  generateReport: z.boolean().default(true).describe("Generate detailed analysis report"),
});

const ParseGameFilesSchema = z.object({
  gamePath: z.string().optional().describe("Path to Project Zomboid installation (auto-detected if not provided)"),
  forceReparse: z.boolean().default(false).describe("Force re-parsing even if data exists"),
});

const GenerateModSchema = z.object({
  modId: z.string().regex(/^[A-Za-z]\w*$/, "Mod id must be alphanumeric (no spaces)").describe("Mod id used in scripts/folders, e.g. SpecialAxe"),
  modName: z.string().describe("Display name, e.g. Special Axe"),
  description: z.string().optional().describe("mod.info description"),
  author: z.string().optional().describe("Author name"),
  version: z.string().default("1.0.0").describe("Mod version"),
  gameVersion: z.string().default("42.0").describe("Target build for the versioned folder"),
  outputPath: z.string().optional().describe("Where to create the mod folder (default: ./generated-mods/<modId>)"),
  overwrite: z.boolean().default(false).describe("Allow writing into an existing folder"),
  items: z.array(z.object({
    name: z.string().describe("Item script name, e.g. SpecialAxe"),
    properties: z.record(z.any()).optional().default({}).describe("Item properties; use category:'Weapon' for weapon template"),
  })).min(1).describe("Items to generate"),
  models: z.array(z.object({
    name: z.string().describe("Model name"),
    mesh: z.string().describe("Mesh path relative to models_X, e.g. weapons/1handed/HandAxe"),
    texture: z.string().optional().describe("Texture path (defaults to mesh path)"),
    scale: z.number().optional().describe("Model scale (default 1.0)"),
    worldOffset: z.string().optional().describe("World attachment offset 'x y z'"),
    worldRotate: z.string().optional().describe("World attachment rotate 'x y z'"),
  })).optional().describe("Model definitions to include"),
  recipes: z.array(z.object({
    name: z.string().describe("craftRecipe name (no spaces)"),
  }).passthrough()).optional().describe("craftRecipe specs: ingredients, result, time, category, SkillRequired, xpAward, timedAction..."),
  worldLoot: z.array(z.object({
    distribution: z.string().describe("Procedural distribution list name, e.g. MeleeWeapons, SurvivalGear, GunStoreDisplayCase (see pzwiki.net/wiki/Procedural_distributions)"),
    weight: z.number().min(0.0001).describe("Relative loot weight (1 = common, 0.01 = very rare)"),
  })).optional().describe("Adds the first item to world loot — NO craftRecipe is generated for it"),
  languages: z.array(z.string()).default(["EN"]).describe("Translation folders to generate"),
  translations: z.record(z.record(z.string())).optional().describe("Custom translations per language, e.g. { ES: { SpecialAxe: 'Hacha Especial' } }"),
});

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_vanilla",
        description: "Search vanilla Project Zomboid content (items, recipes, sounds, vehicles) with intelligent matching",
        inputSchema: SearchVanillaSchema,
      },
      {
        name: "generate_script",
        description: "Generate balanced Project Zomboid Build 42 scripts (items, craftRecipes, sounds, vehicles) using templates and game data patterns",
        inputSchema: GenerateScriptSchema,
      },
      {
        name: "validate_script",
        description: "Validate Project Zomboid Build 42 script syntax and references with detailed error reporting",
        inputSchema: ValidateScriptSchema,
      },
      {
        name: "check_references",
        description: "Validate item, sound, and sprite references against game database",
        inputSchema: CheckReferencesSchema,
      },
      {
        name: "analyze_mod",
        description: "Comprehensive analysis of mod directory including balance, compatibility, and structure validation",
        inputSchema: AnalyzeModSchema,
      },
      {
        name: "parse_game_files",
        description: "Parse and index Project Zomboid game files to populate the database",
        inputSchema: ParseGameFilesSchema,
      },
      {
        name: "generate_mod",
        description: "Generate a complete Build 42 mod folder ready to copy into Zomboid/mods: mod.info, item scripts, models, craftRecipes, translations and placeholder icons",
        inputSchema: GenerateModSchema,
      },
    ],
  };
});

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "search_vanilla": {
        const { query, type, category, limit } = SearchVanillaSchema.parse(args);
        const results = await dbManager.searchContent(query, { type, category, limit });
        
        return {
          content: [
            {
              type: "text",
              text: `Found ${results.length} results for "${query}":\n\n${formatSearchResults(results)}`,
            },
          ],
        };
      }

      case "generate_script": {
        const { type, name, properties, module } = GenerateScriptSchema.parse(args);
        const script = await generator.generateScript(type, name, properties, module);
        
        return {
          content: [
            {
              type: "text",
              text: `Generated ${type} script for "${name}":\n\n\`\`\`\n${script}\n\`\`\``,
            },
          ],
        };
      }

      case "validate_script": {
        const { content, type, strict } = ValidateScriptSchema.parse(args);
        const validation = await validator.validateScript(content, type, strict);
        
        return {
          content: [
            {
              type: "text",
              text: formatValidationResults(validation),
            },
          ],
        };
      }

      case "check_references": {
        const { references, type } = CheckReferencesSchema.parse(args);
        const results = await validator.checkReferences(references, type);
        
        return {
          content: [
            {
              type: "text",
              text: formatReferenceResults(results),
            },
          ],
        };
      }

      case "analyze_mod": {
        const { modPath, checkBalance, checkCompatibility, generateReport } = AnalyzeModSchema.parse(args);
        const analysis = await analyzer.analyzeMod(modPath, {
          checkBalance,
          checkCompatibility,
          generateReport,
        });
        
        return {
          content: [
            {
              type: "text",
              text: formatModAnalysis(analysis),
            },
          ],
        };
      }

      case "parse_game_files": {
        const { gamePath, forceReparse } = ParseGameFilesSchema.parse(args);
        const detectedPath = gamePath || await pathManager.detectProjectZomboidPath();
        
        if (!detectedPath) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Could not detect Project Zomboid installation. Please provide the game path manually."
          );
        }

        const results = await parser.parseGameFiles(detectedPath, forceReparse);
        
        return {
          content: [
            {
              type: "text",
              text: `Successfully parsed Project Zomboid files from: ${detectedPath}\n\n${formatParseResults(results)}`,
            },
          ],
        };
      }

      case "generate_mod": {
        const modArgs = GenerateModSchema.parse(args);
        const targetPath = modArgs.outputPath || join(process.cwd(), "generated-mods", modArgs.modId);
        const result = await modGenerator.generateMod({ ...modArgs, outputPath: targetPath });

        return {
          content: [
            {
              type: "text",
              text: formatGeneratedMod(result),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error}`);
  }
});

// Utility functions for formatting output
function formatSearchResults(results: any[]): string {
  return results.map(result => {
    const type = result.type || "unknown";
    const name = result.name || result.id;
    const description = result.displayName || result.description || "";
    
    let output = `**${name}** (${type})`;
    if (description) output += ` - ${description}`;
    
    if (result.properties) {
      const props = Object.entries(result.properties)
        .filter(([key, value]) => value !== null && value !== undefined)
        .slice(0, 5) // Limit to first 5 properties
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      if (props) output += `\n  Properties: ${props}`;
    }
    
    return output;
  }).join('\n\n');
}

function formatValidationResults(validation: any): string {
  let output = `## Validation Results\n\n`;
  
  if (validation.isValid) {
    output += `✅ **Valid** - Script passed all validation checks\n\n`;
  } else {
    output += `❌ **Invalid** - Found ${validation.errors.length} error(s)\n\n`;
  }
  
  if (validation.errors.length > 0) {
    output += `### Errors:\n`;
    validation.errors.forEach((error: any, index: number) => {
      output += `${index + 1}. **Line ${error.line || 'unknown'}**: ${error.message}\n`;
      if (error.suggestion) {
        output += `   💡 Suggestion: ${error.suggestion}\n`;
      }
    });
    output += '\n';
  }
  
  if (validation.warnings.length > 0) {
    output += `### Warnings:\n`;
    validation.warnings.forEach((warning: any, index: number) => {
      output += `${index + 1}. **Line ${warning.line || 'unknown'}**: ${warning.message}\n`;
    });
    output += '\n';
  }
  
  if (validation.suggestions.length > 0) {
    output += `### Suggestions:\n`;
    validation.suggestions.forEach((suggestion: any, index: number) => {
      output += `${index + 1}. ${suggestion}\n`;
    });
  }
  
  return output;
}

function formatReferenceResults(results: any): string {
  let output = `## Reference Validation Results\n\n`;
  
  const valid = results.filter((r: any) => r.isValid);
  const invalid = results.filter((r: any) => !r.isValid);
  
  output += `✅ Valid: ${valid.length} | ❌ Invalid: ${invalid.length}\n\n`;
  
  if (invalid.length > 0) {
    output += `### Invalid References:\n`;
    invalid.forEach((ref: any) => {
      output += `- **${ref.reference}** (${ref.type}): ${ref.error}\n`;
      if (ref.suggestions && ref.suggestions.length > 0) {
        output += `  💡 Did you mean: ${ref.suggestions.slice(0, 3).join(', ')}?\n`;
      }
    });
    output += '\n';
  }
  
  if (valid.length > 0) {
    output += `### Valid References:\n`;
    valid.forEach((ref: any) => {
      output += `- **${ref.reference}** (${ref.type}) ✅\n`;
    });
  }
  
  return output;
}

function formatModAnalysis(analysis: any): string {
  let output = `# Mod Analysis Report\n\n`;
  
  output += `**Mod Name**: ${analysis.modName || 'Unknown'}\n`;
  output += `**Path**: ${analysis.modPath}\n`;
  output += `**Analysis Date**: ${new Date().toISOString()}\n\n`;
  
  // Structure validation
  output += `## Structure Validation\n`;
  output += `- **mod.info**: ${analysis.structure.hasModInfo ? '✅ Found' : '❌ Missing'}\n`;
  output += `- **Scripts**: ${analysis.structure.scriptCount} file(s) found\n`;
  output += `- **Lua Files**: ${analysis.structure.luaCount} file(s) found\n`;
  output += `- **Assets**: ${analysis.structure.assetCount} file(s) found\n\n`;
  
  // Issues
  if (analysis.issues && analysis.issues.length > 0) {
    output += `## Issues Found\n`;
    analysis.issues.forEach((issue: any, index: number) => {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      output += `${index + 1}. ${icon} **${issue.file}**: ${issue.message}\n`;
    });
    output += '\n';
  }
  
  // Balance analysis
  if (analysis.balance) {
    output += `## Balance Analysis\n`;
    output += `- **Items Analyzed**: ${analysis.balance.itemCount}\n`;
    output += `- **Balance Score**: ${analysis.balance.score}/100\n`;
    if (analysis.balance.recommendations.length > 0) {
      output += `- **Recommendations**:\n`;
      analysis.balance.recommendations.forEach((rec: string) => {
        output += `  - ${rec}\n`;
      });
    }
  }
  
  return output;
}

function formatGeneratedMod(result: { outputPath: string; files: string[]; modId: string; itemIds: string[] }): string {
  let output = `## Mod generado correctamente\n\n`;
  output += `**Ubicación**: ${result.outputPath}\n\n`;
  output += `**Guía completa**: se creó \`GUIA.md\` dentro del mod, con cada paso detallado (probar en 2 min, iconos, modelo 3D, recetas, errores comunes y checklist).\n\n`;
  output += `### Archivos creados\n`;
  result.files.forEach(file => {
    output += `- ${file}\n`;
  });
  output += `\n### Guía rápida\n\n`;
  output += `1. **Probar ahora**: copia la carpeta del mod a \`C:\\Users\\<tu-usuario>\\Zomboid\\mods\\\`, activa el mod en el menú de Mods, y actívala con el modo debug (spawner de items).\n`;
  output += `2. **Iconos**: reemplaza los PNG placeholder (64x64, fondo transparente) respetando el nombre exacto: \`Item_<Icon>.png\` por cada item, más \`icon.png\` y \`poster.png\`.\n`;
  output += `3. **Modelo 3D (opcional)**: el mod ya referencia meshes vanilla y se ve en el juego. Para arte propio: Blender → FBX a \`media/models_X/weapons/...\` + PNG a \`media/textures/weapons/...\`, y actualiza \`mesh\`/\`texture\` en el bloque model.\n`;
  output += `4. **Nombres**: el nombre en juego se cambia en \`Translate/<idioma>/ItemName.json\`, sin tocar scripts.\n`;
  output += `5. **Editar stats**: todo en \`Item_<ModId>.txt\` — cambia números, guarda, reinicia el juego. La guía incluye tabla de tus valores vs vanilla B42.\n`;
  output += `6. **Errores típicos** (item invisible, icono cuadrado, receta sin aparecer) están resueltos en la tabla de \`GUIA.md\`.\n`;
  output += `\n### Probar al instante (modo debug activo)\n\n`;
  output += `Consola debug (tecla \`\` \`\`):\n\`\`\`\n`;
  for (const id of result.itemIds) {
    output += `additem "TuNombreDeJugador" "${id}" 1\n`;
  }
  output += `\`\`\`\n\nConsola Lua (panel debug → Lua console):\n\`\`\`lua\n`;
  for (const id of result.itemIds) {
    output += `getPlayer():getInventory():AddItem("${id}")\n`;
  }
  output += `\`\`\`\n`;
  output += `\n**Nota**: los iconos y el póster se generan automáticamente con silueta del arma (icono 256x256, póster 512x288, iconos de inventario 128x128) — ya se ve bien sin arte propio, y puedes reemplazarlos cuando quieras.\n`;
  return output;
}

function formatParseResults(results: any): string {
  let output = `## Parse Results\n\n`;
  
  output += `- **Items**: ${results.itemCount} parsed\n`;
  output += `- **Recipes**: ${results.recipeCount} parsed\n`;
  output += `- **Sounds**: ${results.soundCount} parsed\n`;
  output += `- **Vehicles**: ${results.vehicleCount} parsed\n`;
  output += `- **Files Processed**: ${results.filesProcessed}\n`;
  output += `- **Parse Time**: ${results.parseTime}ms\n\n`;
  
  if (results.errors && results.errors.length > 0) {
    output += `### Parse Errors:\n`;
    results.errors.forEach((error: any, index: number) => {
      output += `${index + 1}. **${error.file}**: ${error.message}\n`;
    });
  }
  
  return output;
}

// Start the server
async function main() {
  await initializeServer();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("🚀 Project Zomboid MCP Server running");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("💥 Server failed to start:", error);
    process.exit(1);
  });
}
