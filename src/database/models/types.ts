export interface GameItem {
  id: string;
  name: string;
  displayName?: string;
  type: 'item' | 'recipe' | 'craftrecipe' | 'sound' | 'vehicle' | 'evolvedrecipe' | 'fixing';
  module: string;
  category?: string;
  properties: Record<string, any>;
  rawContent: string;
  filePath: string;
}

export interface SearchOptions {
  type?: string;
  category?: string;
  limit?: number;
}

export interface ItemRow {
  id: string;
  name: string;
  display_name: string | null;
  type: string;
  module: string;
  category: string | null;
  properties: string | null;
  raw_content: string | null;
  file_path: string | null;
  rank?: number;
}