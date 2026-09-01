import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { DatabaseManager, GameItem } from '../database/DatabaseManager.js';

export interface ParseResults {
  itemCount: number;
  recipeCount: number;
  soundCount: number;
  vehicleCount: number;
  evolvedRecipeCount: number;
  fixingCount: number;
  filesProcessed: number;
  parseTime: number;
  errors: Array<{file: string; message: string; line?: number}>;
}

export interface ModInfo {
  name?: string;
  id?: string;
  author?: string;
  description?: string;
  version?: string;
  url?: string;
  poster?: string;
  icon?: string;
  require?: string[];
  incompatible?: string[];
  versionMin?: string;
  versionMax?: string;
}

export class ProjectZomboidParser {
  private db: DatabaseManager;
  private scriptExtensions = ['.txt'];
  private modInfoFile = 'mod.info';

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  async parseGameFiles(gamePath: string, forceReparse: boolean = false): Promise<ParseResults> {
    const startTime = Date.now();
    const results: ParseResults = {
      itemCount: 0,
      recipeCount: 0,
      soundCount: 0,
      vehicleCount: 0,
      evolvedRecipeCount: 0,
      fixingCount: 0,
      filesProcessed: 0,
      parseTime: 0,
      errors: [],
    };

    try {
      // Check if we need to parse
      if (!forceReparse) {
        const stats = await this.db.getStats();
        if (stats.total > 0) {
          console.log('Database already contains data. Use forceReparse=true to re-parse.');
          results.parseTime = Date.now() - startTime;
          return results;
        }
      }

      // Clear database if force reparsing
      if (forceReparse) {
        await this.db.clearDatabase();
      }

      // Parse vanilla game scripts
      const scriptsPath = join(gamePath, 'media', 'scripts');
      if (existsSync(scriptsPath)) {
        await this.parseDirectory(scriptsPath, results, 'Base');
      } else {
        results.errors.push({
          file: scriptsPath,
          message: 'Scripts directory not found in game installation',
        });
      }

      results.parseTime = Date.now() - startTime;
      console.log(`Parsing completed in ${results.parseTime}ms`);
      
    } catch (error) {
      results.errors.push({
        file: 'parser',
        message: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return results;
  }

  async parseModDirectory(modPath: string): Promise<ParseResults> {
    const startTime = Date.now();
    const results: ParseResults = {
      itemCount: 0,
      recipeCount: 0,
      soundCount: 0,
      vehicleCount: 0,
      evolvedRecipeCount: 0,
      fixingCount: 0,
      filesProcessed: 0,
      parseTime: 0,
      errors: [],
    };

    try {
      // Parse mod.info if it exists
      let modInfo: ModInfo | null = null;
      const modInfoPath = join(modPath, this.modInfoFile);
      if (existsSync(modInfoPath)) {
        modInfo = this.parseModInfo(modInfoPath);
      }

      // Determine module name from mod info or directory
      const moduleName = modInfo?.id || basename(modPath);

      // Look for media/scripts directories: root, common/, and versioned dirs (42, 42.0, ...)
      const possiblePaths: string[] = [
        join(modPath, 'media', 'scripts'),           // Direct structure
        join(modPath, 'common', 'media', 'scripts'), // Common structure (shared assets)
      ];
      try {
        for (const entry of readdirSync(modPath)) {
          // Build 42+ versioned folders: "42", "42.0", "43", "42.1", etc.
          if (/^\d+(\.\d+)*$/.test(entry)) {
            possiblePaths.push(join(modPath, entry, 'media', 'scripts'));
          }
        }
      } catch {
        // modPath unreadable; fall through to foundScripts check
      }

      let foundScripts = false;
      for (const scriptsPath of possiblePaths) {
        if (existsSync(scriptsPath)) {
          await this.parseDirectory(scriptsPath, results, moduleName);
          foundScripts = true;
        }
      }

      if (!foundScripts) {
        results.errors.push({
          file: modPath,
          message: 'No scripts directory found in mod structure',
        });
      }

      results.parseTime = Date.now() - startTime;
      
    } catch (error) {
      results.errors.push({
        file: 'mod_parser',
        message: `Mod parse error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return results;
  }

  private async parseDirectory(dirPath: string, results: ParseResults, modulePrefix: string): Promise<void> {
    try {
      const entries = readdirSync(dirPath);
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Recursively parse subdirectories
          await this.parseDirectory(fullPath, results, modulePrefix);
        } else if (stat.isFile() && this.scriptExtensions.includes(extname(entry).toLowerCase())) {
          try {
            await this.parseScriptFile(fullPath, results, modulePrefix);
            results.filesProcessed++;
          } catch (error) {
            results.errors.push({
              file: fullPath,
              message: `Failed to parse file: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }
      }
    } catch (error) {
      results.errors.push({
        file: dirPath,
        message: `Failed to read directory: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async parseScriptFile(filePath: string, results: ParseResults, defaultModule: string): Promise<void> {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    let currentModule = defaultModule;
    let currentBlock: any = null;
    let blockContent: string[] = [];
    let blockStartLine = 0;
    let braceLevel = 0;
    let inModule = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Skip empty lines and comments
      if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        continue;
      }

      // Handle module declarations
      if (line.startsWith('module ') && !inModule) {
        const moduleMatch = line.match(/module\s+(\w+)/);
        if (moduleMatch) {
          currentModule = moduleMatch[1];
          inModule = true;
          braceLevel = 0;
        }
        continue;
      }

      // Count braces to track module/block scope
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceLevel += openBraces - closeBraces;

      // Check for block start (item, recipe, etc.)
      const blockMatch = line.match(/^(item|recipe|evolvedrecipe|fixing|sound|vehicle|craftRecipe)\s+([^\s{]+)/);
      if (blockMatch && !currentBlock) {
        currentBlock = {
          type: blockMatch[1].toLowerCase(),
          name: blockMatch[2],
          module: currentModule,
        };
        blockContent = [line];
        blockStartLine = lineNumber;
        continue;
      }

      // Collect block content
      if (currentBlock) {
        blockContent.push(line);

        // Check if block is complete (closing brace)
        if (braceLevel === (inModule ? 1 : 0) && line.includes('}')) {
          try {
            const item = this.parseBlock(currentBlock, blockContent, filePath, blockStartLine);
            if (item) {
              await this.db.insertItem(item);
              
              // Update counters
              switch (item.type) {
                case 'item': results.itemCount++; break;
                case 'recipe': case 'craftrecipe': results.recipeCount++; break;
                case 'sound': results.soundCount++; break;
                case 'vehicle': results.vehicleCount++; break;
                case 'evolvedrecipe': results.evolvedRecipeCount++; break;
                case 'fixing': results.fixingCount++; break;
              }
            }
          } catch (error) {
            results.errors.push({
              file: filePath,
              line: blockStartLine,
              message: `Failed to parse ${currentBlock.type} block: ${error instanceof Error ? error.message : String(error)}`,
            });
          }

          // Reset for next block
          currentBlock = null;
          blockContent = [];
        }
      }

      // Check if we're exiting module scope
      if (inModule && braceLevel === 0 && line.includes('}')) {
        inModule = false;
        currentModule = defaultModule;
      }
    }
  }

  private parseBlock(blockInfo: any, content: string[], filePath: string, startLine: number): GameItem | null {
    const properties: Record<string, any> = {};
    const rawContent = content.join('\n');

    // Parse properties based on block type
    for (const line of content) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.includes('{') || trimmed.includes('}')) continue;

      try {
        if (blockInfo.type === 'item') {
          this.parseItemProperty(trimmed, properties);
        } else if (blockInfo.type === 'recipe') {
          this.parseRecipeProperty(trimmed, properties);
        } else if (blockInfo.type === 'craftrecipe') {
          this.parseCraftRecipeProperty(trimmed, properties);
        } else if (blockInfo.type === 'fixing') {
          this.parseFixingProperty(trimmed, properties);
        } else if (blockInfo.type === 'sound') {
          this.parseSoundProperty(trimmed, properties);
        } else if (blockInfo.type === 'evolvedrecipe') {
          this.parseEvolvedRecipeProperty(trimmed, properties);
        } else if (blockInfo.type === 'vehicle') {
          this.parseVehicleProperty(trimmed, properties);
        }
      } catch (error) {
        // Log property parse errors but continue
        console.warn(`Property parse error in ${filePath}:${startLine}: ${error}`);
      }
    }

    // Generate item ID
    const itemId = blockInfo.module === 'Base' 
      ? blockInfo.name 
      : `${blockInfo.module}.${blockInfo.name}`;

    return {
      id: itemId,
      name: blockInfo.name,
      displayName: properties.DisplayName || properties.Name || blockInfo.name,
      type: blockInfo.type as any,
      module: blockInfo.module,
      category: properties.DisplayCategory || properties.Category,
      properties,
      rawContent,
      filePath,
    };
  }

  private parseItemProperty(line: string, properties: Record<string, any>): void {
    // Item properties use "property = value," format
    const match = line.match(/^\s*(\w+)\s*=\s*([^,]+),?\s*$/);
    if (match) {
      const [, key, value] = match;
      const parsed = this.parseValue(value.trim());
      // B42 uses repeated keys (e.g. multiple ModelWeaponPart lines) — collect as array
      if (key in properties) {
        if (Array.isArray(properties[key])) {
          properties[key].push(parsed);
        } else {
          properties[key] = [properties[key], parsed];
        }
      } else {
        properties[key] = parsed;
      }
    }
  }

  private parseRecipeProperty(line: string, properties: Record<string, any>): void {
    // Recipe properties use "property:value," format
    const match = line.match(/^\s*(\w+)\s*:\s*([^,]+),?\s*$/);
    if (match) {
      const [, key, value] = match;
      properties[key] = this.parseValue(value.trim());
    } else {
      // Handle ingredients and results (no colon)
      const ingredientMatch = line.match(/^\s*([^,=]+)(?:=(\d+))?,?\s*$/);
      if (ingredientMatch) {
        const [, item, count] = ingredientMatch;
        if (!properties.ingredients) properties.ingredients = [];
        properties.ingredients.push({
          item: item.trim(),
          count: count ? parseInt(count) : 1,
        });
      }
    }
  }

  private parseCraftRecipeProperty(line: string, properties: Record<string, any>): void {
    // Build 42 craftRecipe: scalar props use "key = value," format
    const match = line.match(/^\s*(\w+)\s*=\s*([^,]+),?\s*$/);
    if (match) {
      const [, key, value] = match;
      properties[key] = this.parseValue(value.trim());
      return;
    }

    // Input/output lines: "item <count> <spec>" (with ids, tags or mappers)
    const itemMatch = line.match(/^\s*item\s+(\d+)\s+(.+?),?\s*$/i);
    if (itemMatch) {
      if (!properties.recipeItems) properties.recipeItems = [];
      properties.recipeItems.push({
        count: parseInt(itemMatch[1], 10),
        spec: itemMatch[2].trim(),
      });

      // Extract concrete item ids (e.g. Base.FlaxRippled) for reference tracking
      const ids = itemMatch[2].match(/\bBase\.\w+/g);
      if (ids) {
        if (!properties.recipeItemRefs) properties.recipeItemRefs = [];
        properties.recipeItemRefs.push(...ids);
      }
    }
  }

  private parseFixingProperty(line: string, properties: Record<string, any>): void {
    // Fixing properties use "property : value," format
    if (line.includes('Require :')) {
      const match = line.match(/Require\s*:\s*([^,]+),?\s*$/);
      if (match) {
        properties.RequiredItem = match[1].trim();
      }
    } else if (line.includes('Fixer :')) {
      const match = line.match(/Fixer\s*:\s*([^,]+),?\s*$/);
      if (match) {
        if (!properties.Fixers) properties.Fixers = [];
        
        const fixerData = match[1].trim();
        const parts = fixerData.split(';').map(p => p.trim());
        
        const fixer: any = {};
        
        // Parse material and quantity
        const materialMatch = parts[0].match(/(\w+)=(\d+)/);
        if (materialMatch) {
          fixer.material = materialMatch[1];
          fixer.quantity = parseInt(materialMatch[2]);
        }
        
        // Parse skill requirement if present
        if (parts.length > 1) {
          const skillMatch = parts[1].match(/(\w+)=(\d+)/);
          if (skillMatch) {
            fixer.skill = skillMatch[1];
            fixer.skillLevel = parseInt(skillMatch[2]);
          }
        }
        
        properties.Fixers.push(fixer);
      }
    }
  }

  private parseSoundProperty(line: string, properties: Record<string, any>): void {
    // Sound properties use "property = value," format
    const match = line.match(/^\s*(\w+)\s*=\s*([^,]+),?\s*$/);
    if (match) {
      const [, key, value] = match;
      properties[key] = this.parseValue(value.trim());
    }
  }

  private parseEvolvedRecipeProperty(line: string, properties: Record<string, any>): void {
    // Evolved recipe properties use "property:value," format
    const match = line.match(/^\s*(\w+)\s*:\s*([^,]+),?\s*$/);
    if (match) {
      const [, key, value] = match;
      properties[key] = this.parseValue(value.trim());
    }
  }

  private parseVehicleProperty(line: string, properties: Record<string, any>): void {
    // Vehicle properties can vary, try both formats
    let match = line.match(/^\s*(\w+)\s*=\s*([^,]+),?\s*$/);
    if (!match) {
      match = line.match(/^\s*(\w+)\s*:\s*([^,]+),?\s*$/);
    }
    
    if (match) {
      const [, key, value] = match;
      properties[key] = this.parseValue(value.trim());
    }
  }

  private parseValue(value: string): any {
    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // Parse numbers
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    
    if (/^\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // Parse booleans
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Return as string
    return value;
  }

  parseModInfo(filePath: string): ModInfo {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const modInfo: ModInfo = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

      const match = trimmed.match(/^(\w+)\s*=\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        const cleanValue = value.trim();

        switch (key.toLowerCase()) {
          case 'name':
            modInfo.name = cleanValue;
            break;
          case 'id':
            modInfo.id = cleanValue;
            break;
          case 'author':
            modInfo.author = cleanValue;
            break;
          case 'description':
            modInfo.description = cleanValue;
            break;
          case 'modversion':
          case 'version':
            modInfo.version = cleanValue;
            break;
          case 'url':
            modInfo.url = cleanValue;
            break;
          case 'poster':
            modInfo.poster = cleanValue;
            break;
          case 'icon':
            modInfo.icon = cleanValue;
            break;
          case 'require':
            modInfo.require = cleanValue.split(',').map(s => s.trim()).filter(s => s);
            break;
          case 'incompatible':
            modInfo.incompatible = cleanValue.split(',').map(s => s.trim()).filter(s => s);
            break;
          case 'versionmin':
            modInfo.versionMin = cleanValue;
            break;
          case 'versionmax':
            modInfo.versionMax = cleanValue;
            break;
        }
      }
    }

    return modInfo;
  }

  async extractReferences(item: GameItem): Promise<void> {
    const refs: Array<{ref: string; type: string; context: string}> = [];

    // Extract item references from properties
    const itemProps = ['WeaponSprite', 'Icon', 'AlternativeSwingAnim', 'AttachmentType'];
    for (const prop of itemProps) {
      if (item.properties[prop]) {
        refs.push({
          ref: String(item.properties[prop]),
          type: 'sprite',
          context: prop,
        });
      }
    }

    // Extract sound references
    const soundProps = ['BreakSound', 'HitSound', 'SwingSound', 'ImpactSound'];
    for (const prop of soundProps) {
      if (item.properties[prop]) {
        refs.push({
          ref: String(item.properties[prop]),
          type: 'sound',
          context: prop,
        });
      }
    }

    // Extract recipe ingredient references
    if (item.type === 'recipe' && item.properties.ingredients) {
      for (const ingredient of item.properties.ingredients) {
        refs.push({
          ref: ingredient.item,
          type: 'item',
          context: 'ingredient',
        });
      }
    }

    // Store references in database
    for (const ref of refs) {
      await this.db.addReference(item.id, ref.ref, ref.type, ref.context);
    }
  }
}
