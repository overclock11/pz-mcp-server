import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, extname, basename } from 'path';
import { DatabaseManager, GameItem } from '../database/DatabaseManager.js';
import { ProjectZomboidParser, ModInfo } from '../parsers/ProjectZomboidParser.js';
import { ValidationEngine, ValidationResult } from '../validation/ValidationEngine.js';

export interface ModAnalysisResult {
  modName?: string;
  modPath: string;
  modInfo?: ModInfo;
  structure: StructureAnalysis;
  issues: Issue[];
  balance?: BalanceAnalysis;
  compatibility?: CompatibilityAnalysis;
  performance?: PerformanceAnalysis;
  quality: QualityMetrics;
  recommendations: string[];
}

export interface StructureAnalysis {
  hasModInfo: boolean;
  hasCorrectStructure: boolean;
  scriptCount: number;
  luaCount: number;
  assetCount: number;
  missingFiles: string[];
  unexpectedFiles: string[];
  buildVersions: string[];
  hasCommonFolder: boolean;
}

export interface Issue {
  file: string;
  line?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  code: string;
  suggestion?: string;
}

export interface BalanceAnalysis {
  itemCount: number;
  averageStats: Record<string, number>;
  outliers: Array<{item: string; property: string; value: any; recommendation: string}>;
  score: number; // 0-100 balance score
  recommendations: string[];
}

export interface CompatibilityAnalysis {
  conflicts: Array<{type: string; item: string; conflictsWith: string}>;
  missingDependencies: string[];
  incompatibleMods: string[];
  gameVersionCompatibility: {
    minVersion?: string;
    maxVersion?: string;
    compatible: boolean;
  };
}

export interface PerformanceAnalysis {
  largeFiles: Array<{file: string; size: number}>;
  complexScripts: Array<{file: string; complexity: number}>;
  recommendations: string[];
}

export interface QualityMetrics {
  overall: number; // 0-100
  structure: number;
  syntax: number;
  balance: number;
  documentation: number;
}

export interface AnalysisOptions {
  checkBalance?: boolean;
  checkCompatibility?: boolean;
  checkPerformance?: boolean;
  generateReport?: boolean;
  strictValidation?: boolean;
}

export class ModAnalyzer {
  private db: DatabaseManager;
  private parser: ProjectZomboidParser;
  private validator: ValidationEngine;

  constructor(db: DatabaseManager, parser: ProjectZomboidParser) {
    this.db = db;
    this.parser = parser;
    this.validator = new ValidationEngine(db);
  }

  async analyzeMod(
    modPath: string, 
    options: AnalysisOptions = {}
  ): Promise<ModAnalysisResult> {
    
    const {
      checkBalance = true,
      checkCompatibility = true,
      checkPerformance = true,
      generateReport = true,
      strictValidation = false,
    } = options;

    const result: ModAnalysisResult = {
      modPath,
      structure: await this.analyzeStructure(modPath),
      issues: [],
      quality: {
        overall: 0,
        structure: 0,
        syntax: 0,
        balance: 0,
        documentation: 0,
      },
      recommendations: [],
    };

    try {
      // Parse mod.info if it exists
      result.modInfo = this.parseModInfo(modPath);
      result.modName = result.modInfo?.name || basename(modPath);

      // Analyze scripts
      await this.analyzeScripts(modPath, result, strictValidation);

      // Analyze Lua files
      await this.analyzeLuaFiles(modPath, result);

      // Balance analysis
      if (checkBalance) {
        result.balance = await this.analyzeBalance(modPath, result);
      }

      // Compatibility analysis
      if (checkCompatibility) {
        result.compatibility = await this.analyzeCompatibility(modPath, result);
      }

      // Performance analysis
      if (checkPerformance) {
        result.performance = await this.analyzePerformance(modPath, result);
      }

      // Calculate quality metrics
      this.calculateQualityMetrics(result);

      // Generate recommendations
      this.generateRecommendations(result);

    } catch (error) {
      result.issues.push({
        file: 'analyzer',
        severity: 'error',
        message: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        code: 'ANALYSIS_ERROR',
      });
    }

    return result;
  }

  private async analyzeStructure(modPath: string): Promise<StructureAnalysis> {
    const structure: StructureAnalysis = {
      hasModInfo: false,
      hasCorrectStructure: false,
      scriptCount: 0,
      luaCount: 0,
      assetCount: 0,
      missingFiles: [],
      unexpectedFiles: [],
      buildVersions: [],
      hasCommonFolder: false,
    };

    if (!existsSync(modPath)) {
      structure.missingFiles.push('Mod directory does not exist');
      return structure;
    }

    // Check for mod.info
    const modInfoPaths = [
      join(modPath, 'mod.info'),
      join(modPath, '42', 'mod.info'),
    ];

    for (const modInfoPath of modInfoPaths) {
      if (existsSync(modInfoPath)) {
        structure.hasModInfo = true;
        break;
      }
    }

    // Check for proper Build 42 structure
    const commonPath = join(modPath, 'common');
    structure.hasCommonFolder = existsSync(commonPath);

    // Find build version folders
    const entries = readdirSync(modPath);
    for (const entry of entries) {
      const entryPath = join(modPath, entry);
      if (statSync(entryPath).isDirectory()) {
        if (/^\d+(\.\d+)*$/.test(entry)) {
          structure.buildVersions.push(entry);
        }
      }
    }

    // Check for correct structure (Build 42 style)
    const hasVersionFolder = structure.buildVersions.length > 0;
    structure.hasCorrectStructure = structure.hasCommonFolder && hasVersionFolder;

    // Count files
    await this.countFiles(modPath, structure);

    // Check for missing essential files
    if (!structure.hasModInfo) {
      structure.missingFiles.push('mod.info');
    }

    if (structure.scriptCount === 0 && structure.luaCount === 0) {
      structure.missingFiles.push('No script or Lua files found');
    }

    return structure;
  }

  private async countFiles(dirPath: string, structure: StructureAnalysis): Promise<void> {
    try {
      const entries = readdirSync(dirPath);

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          await this.countFiles(fullPath, structure);
        } else {
          const ext = extname(entry).toLowerCase();
          
          if (ext === '.txt' && fullPath.includes('scripts')) {
            structure.scriptCount++;
          } else if (ext === '.lua') {
            structure.luaCount++;
          } else if (['.png', '.jpg', '.jpeg', '.ogg', '.wav', '.mp3'].includes(ext)) {
            structure.assetCount++;
          }
        }
      }
    } catch (error) {
      // Directory read error, skip
    }
  }

  private parseModInfo(modPath: string): ModInfo | undefined {
    const modInfoPaths = [
      join(modPath, 'mod.info'),
      join(modPath, '42', 'mod.info'),
    ];

    for (const modInfoPath of modInfoPaths) {
      if (existsSync(modInfoPath)) {
        try {
          return this.parser.parseModInfo(modInfoPath);
        } catch (error) {
          // Failed to parse, continue to next path
        }
      }
    }

    return undefined;
  }

  private async analyzeScripts(
    modPath: string, 
    result: ModAnalysisResult, 
    strict: boolean
  ): Promise<void> {
    
    const scriptPaths = [
      join(modPath, 'media', 'scripts'),
      join(modPath, '42', 'media', 'scripts'),
      join(modPath, 'common', 'media', 'scripts'),
    ];

    for (const scriptsPath of scriptPaths) {
      if (existsSync(scriptsPath)) {
        await this.analyzeScriptDirectory(scriptsPath, result, strict);
      }
    }
  }

  private async analyzeScriptDirectory(
    dirPath: string, 
    result: ModAnalysisResult, 
    strict: boolean
  ): Promise<void> {
    
    try {
      const entries = readdirSync(dirPath);

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          await this.analyzeScriptDirectory(fullPath, result, strict);
        } else if (extname(entry).toLowerCase() === '.txt') {
          await this.analyzeScriptFile(fullPath, result, strict);
        }
      }
    } catch (error) {
      result.issues.push({
        file: dirPath,
        severity: 'error',
        message: `Failed to read scripts directory: ${error instanceof Error ? error.message : String(error)}`,
        code: 'READ_ERROR',
      });
    }
  }

  private async analyzeScriptFile(
    filePath: string, 
    result: ModAnalysisResult, 
    strict: boolean
  ): Promise<void> {
    
    try {
      const content = readFileSync(filePath, 'utf-8');
      const validation = await this.validator.validateScript(content, undefined, strict);

      // Add validation issues to result
      for (const error of validation.errors) {
        result.issues.push({
          file: filePath,
          line: error.line,
          severity: error.severity,
          message: error.message,
          code: error.code,
          suggestion: error.suggestion,
        });
      }

      for (const warning of validation.warnings) {
        result.issues.push({
          file: filePath,
          line: warning.line,
          severity: warning.severity,
          message: warning.message,
          code: warning.code,
          suggestion: warning.suggestion,
        });
      }

    } catch (error) {
      result.issues.push({
        file: filePath,
        severity: 'error',
        message: `Failed to analyze script: ${error instanceof Error ? error.message : String(error)}`,
        code: 'SCRIPT_ANALYSIS_ERROR',
      });
    }
  }

  private async analyzeLuaFiles(modPath: string, result: ModAnalysisResult): Promise<void> {
    const luaPaths = [
      join(modPath, 'media', 'lua'),
      join(modPath, '42', 'media', 'lua'),
      join(modPath, 'common', 'media', 'lua'),
    ];

    for (const luaPath of luaPaths) {
      if (existsSync(luaPath)) {
        await this.analyzeLuaDirectory(luaPath, result);
      }
    }
  }

  private async analyzeLuaDirectory(dirPath: string, result: ModAnalysisResult): Promise<void> {
    try {
      const entries = readdirSync(dirPath);

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          await this.analyzeLuaDirectory(fullPath, result);
        } else if (extname(entry).toLowerCase() === '.lua') {
          await this.analyzeLuaFile(fullPath, result);
        }
      }
    } catch (error) {
      result.issues.push({
        file: dirPath,
        severity: 'error',
        message: `Failed to read Lua directory: ${error instanceof Error ? error.message : String(error)}`,
        code: 'READ_ERROR',
      });
    }
  }

  private async analyzeLuaFile(filePath: string, result: ModAnalysisResult): Promise<void> {
    try {
      const content = readFileSync(filePath, 'utf-8');
      
      // Basic Lua syntax checks
      if (!content.trim()) {
        result.issues.push({
          file: filePath,
          severity: 'warning',
          message: 'Empty Lua file',
          code: 'EMPTY_FILE',
        });
        return;
      }

      // Check for common Lua syntax issues
      this.checkLuaSyntax(content, filePath, result);

      // Check for deprecated API usage
      this.checkDeprecatedAPI(content, filePath, result);

    } catch (error) {
      result.issues.push({
        file: filePath,
        severity: 'error',
        message: `Failed to analyze Lua file: ${error instanceof Error ? error.message : String(error)}`,
        code: 'LUA_ANALYSIS_ERROR',
      });
    }
  }

  private checkLuaSyntax(content: string, filePath: string, result: ModAnalysisResult): void {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Check for unbalanced parentheses/brackets
      const openParens = (line.match(/\(/g) || []).length;
      const closeParens = (line.match(/\)/g) || []).length;
      const openBrackets = (line.match(/\[/g) || []).length;
      const closeBrackets = (line.match(/\]/g) || []).length;

      if (openParens !== closeParens && !line.includes('--')) {
        result.issues.push({
          file: filePath,
          line: lineNumber,
          severity: 'warning',
          message: 'Unbalanced parentheses',
          code: 'LUA_SYNTAX_WARNING',
        });
      }

      if (openBrackets !== closeBrackets && !line.includes('--')) {
        result.issues.push({
          file: filePath,
          line: lineNumber,
          severity: 'warning',
          message: 'Unbalanced brackets',
          code: 'LUA_SYNTAX_WARNING',
        });
      }

      // Check for common typos
      if (line.includes('Events.OnPreMapLoad.Add') && line.includes('Events.OnPreMapLoad.Add')) {
        result.issues.push({
          file: filePath,
          line: lineNumber,
          severity: 'info',
          message: 'Consider using Events.OnGameBoot.Add for initialization code',
          code: 'LUA_BEST_PRACTICE',
        });
      }
    }
  }

  private checkDeprecatedAPI(content: string, filePath: string, result: ModAnalysisResult): void {
    const deprecatedAPIs = [
      { old: 'getSpecificPlayer(0)', new: 'getPlayer()', message: 'Use getPlayer() instead of getSpecificPlayer(0)' },
      { old: 'instanceof', new: 'type checking', message: 'instanceof may not work as expected in Lua' },
    ];

    for (const api of deprecatedAPIs) {
      if (content.includes(api.old)) {
        result.issues.push({
          file: filePath,
          severity: 'warning',
          message: api.message,
          code: 'DEPRECATED_API',
          suggestion: `Replace with: ${api.new}`,
        });
      }
    }
  }

  private async analyzeBalance(modPath: string, result: ModAnalysisResult): Promise<BalanceAnalysis> {
    const balance: BalanceAnalysis = {
      itemCount: 0,
      averageStats: {},
      outliers: [],
      score: 100,
      recommendations: [],
    };

    try {
      // Parse mod items
      const parseResults = await this.parser.parseModDirectory(modPath);
      const modItems = await this.db.getItemsByType('item');

      if (modItems.length === 0) {
        balance.recommendations.push('No items found to analyze');
        return balance;
      }

      balance.itemCount = modItems.length;

      // Analyze item stats
      const stats = ['MaxDamage', 'MinDamage', 'Weight', 'ConditionMax'];
      const statValues: Record<string, number[]> = {};

      for (const stat of stats) {
        statValues[stat] = [];
      }

      // Collect stats from mod items
      for (const item of modItems) {
        for (const stat of stats) {
          const value = item.properties[stat];
          if (typeof value === 'number') {
            statValues[stat].push(value);
          }
        }
      }

      // Calculate averages
      for (const [stat, values] of Object.entries(statValues)) {
        if (values.length > 0) {
          balance.averageStats[stat] = values.reduce((sum, val) => sum + val, 0) / values.length;
        }
      }

      // Find outliers (items with stats significantly different from vanilla)
      await this.findBalanceOutliers(modItems, balance);

      // Calculate balance score
      balance.score = this.calculateBalanceScore(balance);

      // Generate balance recommendations
      this.generateBalanceRecommendations(balance);

    } catch (error) {
      balance.recommendations.push(`Balance analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return balance;
  }

  private async findBalanceOutliers(
    modItems: GameItem[], 
    balance: BalanceAnalysis
  ): Promise<void> {
    
    // Get vanilla weapon stats for comparison
    const vanillaWeapons = await this.db.searchContent('weapon', { type: 'item', limit: 50 });
    
    if (vanillaWeapons.length === 0) return;

    // Calculate vanilla averages
    const vanillaStats: Record<string, number> = {};
    const stats = ['MaxDamage', 'MinDamage', 'Weight'];

    for (const stat of stats) {
      const values = vanillaWeapons
        .map(w => w.properties[stat])
        .filter(v => typeof v === 'number') as number[];
      
      if (values.length > 0) {
        vanillaStats[stat] = values.reduce((sum, val) => sum + val, 0) / values.length;
      }
    }

    // Find outliers in mod items
    for (const item of modItems) {
      if (item.properties.Type === 'Weapon') {
        for (const stat of stats) {
          const value = item.properties[stat];
          const vanillaAvg = vanillaStats[stat];
          
          if (typeof value === 'number' && vanillaAvg) {
            const ratio = value / vanillaAvg;
            
            if (ratio > 2.0) {
              balance.outliers.push({
                item: item.name,
                property: stat,
                value,
                recommendation: `${stat} is ${ratio.toFixed(1)}x higher than vanilla average (${vanillaAvg.toFixed(1)})`,
              });
            } else if (ratio < 0.3) {
              balance.outliers.push({
                item: item.name,
                property: stat,
                value,
                recommendation: `${stat} is ${(1/ratio).toFixed(1)}x lower than vanilla average (${vanillaAvg.toFixed(1)})`,
              });
            }
          }
        }
      }
    }
  }

  private calculateBalanceScore(balance: BalanceAnalysis): number {
    let score = 100;

    // Deduct points for outliers
    score -= balance.outliers.length * 5;

    // Deduct points for extreme outliers
    const extremeOutliers = balance.outliers.filter(o => 
      o.recommendation.includes('10x') || o.recommendation.includes('100x')
    );
    score -= extremeOutliers.length * 15;

    return Math.max(0, score);
  }

  private generateBalanceRecommendations(balance: BalanceAnalysis): void {
    if (balance.outliers.length > 0) {
      balance.recommendations.push(`Found ${balance.outliers.length} potential balance issues`);
      
      if (balance.outliers.length > 5) {
        balance.recommendations.push('Consider reviewing item stats for better game balance');
      }
    }

    if (balance.score < 50) {
      balance.recommendations.push('Many items appear to be overpowered or underpowered compared to vanilla');
    }
  }

  private async analyzeCompatibility(
    modPath: string, 
    result: ModAnalysisResult
  ): Promise<CompatibilityAnalysis> {
    
    const compatibility: CompatibilityAnalysis = {
      conflicts: [],
      missingDependencies: [],
      incompatibleMods: [],
      gameVersionCompatibility: {
        compatible: true,
      },
    };

    // Check mod.info dependencies
    if (result.modInfo?.require) {
      for (const dep of result.modInfo.require) {
        // Check if dependency is available (simplified check)
        const exists = await this.db.checkReference(dep, 'item');
        if (!exists) {
          compatibility.missingDependencies.push(dep);
        }
      }
    }

    // Check game version compatibility
    if (result.modInfo?.versionMin || result.modInfo?.versionMax) {
      compatibility.gameVersionCompatibility.minVersion = result.modInfo.versionMin;
      compatibility.gameVersionCompatibility.maxVersion = result.modInfo.versionMax;
      
      // Simple version check (could be more sophisticated)
      const currentVersion = '42.0'; // This should come from game detection
      if (result.modInfo.versionMax && currentVersion > result.modInfo.versionMax) {
        compatibility.gameVersionCompatibility.compatible = false;
      }
    }

    return compatibility;
  }

  private async analyzePerformance(
    modPath: string, 
    result: ModAnalysisResult
  ): Promise<PerformanceAnalysis> {
    
    const performance: PerformanceAnalysis = {
      largeFiles: [],
      complexScripts: [],
      recommendations: [],
    };

    await this.findLargeFiles(modPath, performance);
    this.generatePerformanceRecommendations(performance);

    return performance;
  }

  private async findLargeFiles(dirPath: string, performance: PerformanceAnalysis): Promise<void> {
    try {
      const entries = readdirSync(dirPath);

      for (const entry of entries) {
        const fullPath = join(dirPath, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          await this.findLargeFiles(fullPath, performance);
        } else {
          const sizeInMB = stat.size / (1024 * 1024);
          
          if (sizeInMB > 5) { // Files larger than 5MB
            performance.largeFiles.push({
              file: fullPath,
              size: stat.size,
            });
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  private generatePerformanceRecommendations(performance: PerformanceAnalysis): void {
    if (performance.largeFiles.length > 0) {
      performance.recommendations.push(`Found ${performance.largeFiles.length} large files that may impact loading time`);
      performance.recommendations.push('Consider optimizing textures and audio files');
    }

    if (performance.complexScripts.length > 0) {
      performance.recommendations.push('Some scripts may be complex and could impact performance');
    }
  }

  private calculateQualityMetrics(result: ModAnalysisResult): void {
    const metrics = result.quality;

    // Structure score
    metrics.structure = 0;
    if (result.structure.hasModInfo) metrics.structure += 30;
    if (result.structure.hasCorrectStructure) metrics.structure += 40;
    if (result.structure.scriptCount > 0) metrics.structure += 20;
    if (result.structure.missingFiles.length === 0) metrics.structure += 10;

    // Syntax score (based on issues)
    const syntaxErrors = result.issues.filter(i => i.severity === 'error').length;
    const syntaxWarnings = result.issues.filter(i => i.severity === 'warning').length;
    metrics.syntax = Math.max(0, 100 - (syntaxErrors * 15) - (syntaxWarnings * 5));

    // Balance score
    metrics.balance = result.balance?.score || 100;

    // Documentation score
    metrics.documentation = 0;
    if (result.modInfo?.description) metrics.documentation += 50;
    if (result.modInfo?.author) metrics.documentation += 25;
    if (result.modInfo?.version) metrics.documentation += 25;

    // Overall score
    metrics.overall = Math.round(
      (metrics.structure + metrics.syntax + metrics.balance + metrics.documentation) / 4
    );
  }

  private generateRecommendations(result: ModAnalysisResult): void {
    const recommendations: string[] = [];

    // Structure recommendations
    if (!result.structure.hasModInfo) {
      recommendations.push('Add a mod.info file with proper metadata');
    }

    if (!result.structure.hasCorrectStructure) {
      recommendations.push('Use Build 42 mod structure with common/ and version folders');
    }

    // Issue-based recommendations
    const errorCount = result.issues.filter(i => i.severity === 'error').length;
    if (errorCount > 0) {
      recommendations.push(`Fix ${errorCount} error(s) to ensure mod functionality`);
    }

    const warningCount = result.issues.filter(i => i.severity === 'warning').length;
    if (warningCount > 5) {
      recommendations.push('Address warnings to improve mod quality');
    }

    // Balance recommendations
    if (result.balance?.outliers.length && result.balance.outliers.length > 0) {
      recommendations.push('Review item balance for better gameplay experience');
    }

    // Quality recommendations
    if (result.quality.overall < 70) {
      recommendations.push('Consider improving mod structure and documentation');
    }

    result.recommendations = recommendations;
  }
}
