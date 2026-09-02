import type { ModInfo } from '../../parsers/index.js';

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