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
import { DatabaseManager } from "./database/DatabaseManager.js";
import { ProjectZomboidParser } from "./parsers/ProjectZomboidParser.js";
import { ModAnalyzer } from "./analyzers/ModAnalyzer.js";
import { ScriptGenerator } from "./generators/ScriptGenerator.js";
import { ValidationEngine } from "./validation/ValidationEngine.js";
import { PathManager } from "./utils/PathManager.js";

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
  type: z.enum(["item", "recipe", "evolvedrecipe", "fixing", "sound", "vehicle"]).describe("Type of script to generate"),
  name: z.string().describe("Name of the item/recipe/etc to generate"),
  properties: z.record(z.any()).describe("Properties and specifications for the generated content"),
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
        description: "Generate balanced Project Zomboid scripts using templates and game data patterns",
        inputSchema: GenerateScriptSchema,
      },
      {
        name: "validate_script",
        description: "Validate Project Zomboid script syntax and references with detailed error reporting",
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("💥 Server failed to start:", error);
    process.exit(1);
  });
}
