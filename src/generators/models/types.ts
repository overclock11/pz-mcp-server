export interface ItemTemplate {
  type: string;
  category: string;
  baseStats: Record<string, any>;
  requiredProperties: string[];
  optionalProperties: string[];
  balanceMultipliers: Record<string, number>;
}

export interface GenerationOptions {
  module?: string;
  balance?: 'vanilla' | 'powerful' | 'weak' | 'custom';
  includeComments?: boolean;
  useTemplate?: string;
}

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

export interface ModelPlan {
  name: string;
  mesh?: string | undefined;
  texture?: string | undefined;
  scale?: number | undefined;
  worldOffset?: string | undefined;
  worldRotate?: string | undefined;
  vanillaSprite?: string | undefined;
}

export interface ModelInfo {
  name: string;
  mesh: string;
  scale?: number | undefined;
  texture: string | null;
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
  gamePath?: string;
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