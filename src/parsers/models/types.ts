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