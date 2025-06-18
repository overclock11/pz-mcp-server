import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';

export interface GameItem {
  id: string;
  name: string;
  displayName?: string;
  type: 'item' | 'recipe' | 'sound' | 'vehicle' | 'evolvedrecipe' | 'fixing';
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

export class DatabaseManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(process.cwd(), 'data', 'pz_database.db');
    
    // Ensure directory exists
    const dbDir = join(this.dbPath, '..');
    mkdirSync(dbDir, { recursive: true });
  }

  async initialize(): Promise<void> {
    this.db = new Database(this.dbPath);
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    
    await this.createTables();
    await this.createIndexes();
  }

  private async createTables(): Promise<void> {
    // Main items table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT,
        type TEXT NOT NULL,
        module TEXT NOT NULL,
        category TEXT,
        properties TEXT, -- JSON string
        raw_content TEXT,
        file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Full-text search table using FTS5
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        id,
        name,
        display_name,
        type,
        module,
        category,
        properties_text,
        content=items,
        content_rowid=rowid
      )
    `);

    // Triggers to keep FTS table in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
        INSERT INTO items_fts(rowid, id, name, display_name, type, module, category, properties_text)
        VALUES (new.rowid, new.id, new.name, new.display_name, new.type, new.module, new.category, new.properties);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
        INSERT INTO items_fts(items_fts, rowid, id, name, display_name, type, module, category, properties_text)
        VALUES ('delete', old.rowid, old.id, old.name, old.display_name, old.type, old.module, old.category, old.properties);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
        INSERT INTO items_fts(items_fts, rowid, id, name, display_name, type, module, category, properties_text)
        VALUES ('delete', old.rowid, old.id, old.name, old.display_name, old.type, old.module, old.category, old.properties);
        INSERT INTO items_fts(rowid, id, name, display_name, type, module, category, properties_text)
        VALUES (new.rowid, new.id, new.name, new.display_name, new.type, new.module, new.category, new.properties);
      END
    `);

    // References table for tracking item dependencies
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        reference_type TEXT NOT NULL, -- 'item', 'sound', 'sprite', 'model'
        context TEXT, -- where the reference appears (property name, recipe ingredient, etc.)
        FOREIGN KEY (item_id) REFERENCES items (id)
      )
    `);

    // Mod metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mods (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        author TEXT,
        version TEXT,
        description TEXT,
        path TEXT,
        last_analyzed DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private async createIndexes(): Promise<void> {
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_items_type ON items (type)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_items_module ON items (module)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_items_category ON items (category)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_references_item ON references (item_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_references_ref ON references (reference_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_references_type ON references (reference_type)`);
  }

  async insertItem(item: GameItem): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO items 
      (id, name, display_name, type, module, category, properties, raw_content, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      item.id,
      item.name,
      item.displayName,
      item.type,
      item.module,
      item.category,
      JSON.stringify(item.properties),
      item.rawContent,
      item.filePath
    );
  }

  async insertItems(items: GameItem[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO items 
      (id, name, display_name, type, module, category, properties, raw_content, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items: GameItem[]) => {
      for (const item of items) {
        stmt.run(
          item.id,
          item.name,
          item.displayName,
          item.type,
          item.module,
          item.category,
          JSON.stringify(item.properties),
          item.rawContent,
          item.filePath
        );
      }
    });

    transaction(items);
  }

  async searchContent(query: string, options: SearchOptions = {}): Promise<GameItem[]> {
    let sql = '';
    let params: any[] = [];

    if (query.trim() === '') {
      // Return all items with optional filtering
      sql = `
        SELECT id, name, display_name, type, module, category, properties, raw_content, file_path
        FROM items
        WHERE 1=1
      `;
    } else {
      // Use FTS5 for search
      sql = `
        SELECT items.id, items.name, items.display_name, items.type, items.module, 
               items.category, items.properties, items.raw_content, items.file_path,
               items_fts.rank
        FROM items_fts
        JOIN items ON items.rowid = items_fts.rowid
        WHERE items_fts MATCH ?
      `;
      params.push(this.prepareFTSQuery(query));
    }

    // Add type filter
    if (options.type && options.type !== 'all') {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    // Add category filter
    if (options.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }

    // Add ordering and limit
    if (query.trim() !== '') {
      sql += ' ORDER BY rank DESC';
    } else {
      sql += ' ORDER BY name ASC';
    }

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params);
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      type: row.type as any,
      module: row.module,
      category: row.category,
      properties: JSON.parse(row.properties || '{}'),
      rawContent: row.raw_content,
      filePath: row.file_path,
    }));
  }

  async getItemById(id: string): Promise<GameItem | null> {
    const row = this.db.prepare(`
      SELECT id, name, display_name, type, module, category, properties, raw_content, file_path
      FROM items
      WHERE id = ?
    `).get(id);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      type: row.type as any,
      module: row.module,
      category: row.category,
      properties: JSON.parse(row.properties || '{}'),
      rawContent: row.raw_content,
      filePath: row.file_path,
    };
  }

  async getItemsByType(type: string): Promise<GameItem[]> {
    const rows = this.db.prepare(`
      SELECT id, name, display_name, type, module, category, properties, raw_content, file_path
      FROM items
      WHERE type = ?
      ORDER BY name ASC
    `).all(type);

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      type: row.type as any,
      module: row.module,
      category: row.category,
      properties: JSON.parse(row.properties || '{}'),
      rawContent: row.raw_content,
      filePath: row.file_path,
    }));
  }

  async getCategories(): Promise<string[]> {
    const rows = this.db.prepare(`
      SELECT DISTINCT category
      FROM items
      WHERE category IS NOT NULL
      ORDER BY category ASC
    `).all();

    return rows.map(row => row.category);
  }

  async getStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};

    // Count by type
    const typeRows = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM items
      GROUP BY type
    `).all();

    for (const row of typeRows) {
      stats[row.type] = row.count;
    }

    // Total count
    const totalRow = this.db.prepare('SELECT COUNT(*) as count FROM items').get();
    stats.total = totalRow.count;

    return stats;
  }

  async addReference(itemId: string, referenceId: string, referenceType: string, context?: string): Promise<void> {
    this.db.prepare(`
      INSERT OR IGNORE INTO references (item_id, reference_id, reference_type, context)
      VALUES (?, ?, ?, ?)
    `).run(itemId, referenceId, referenceType, context);
  }

  async getReferences(itemId: string): Promise<Array<{referenceId: string; type: string; context?: string}>> {
    const rows = this.db.prepare(`
      SELECT reference_id, reference_type, context
      FROM references
      WHERE item_id = ?
    `).all(itemId);

    return rows.map(row => ({
      referenceId: row.reference_id,
      type: row.reference_type,
      context: row.context,
    }));
  }

  async checkReference(referenceId: string, referenceType?: string): Promise<boolean> {
    let sql = 'SELECT COUNT(*) as count FROM items WHERE id = ?';
    const params = [referenceId];

    if (referenceType && referenceType !== 'all') {
      sql += ' AND type = ?';
      params.push(referenceType);
    }

    const row = this.db.prepare(sql).get(...params);
    return row.count > 0;
  }

  async getSimilarItems(query: string, limit: number = 5): Promise<string[]> {
    const rows = this.db.prepare(`
      SELECT name
      FROM items
      WHERE name LIKE ? OR display_name LIKE ?
      ORDER BY 
        CASE 
          WHEN name = ? THEN 1
          WHEN name LIKE ? THEN 2
          WHEN display_name LIKE ? THEN 3
          ELSE 4
        END,
        name ASC
      LIMIT ?
    `).all(
      `%${query}%`,
      `%${query}%`,
      query,
      `${query}%`,
      `${query}%`,
      limit
    );

    return rows.map(row => row.name);
  }

  async clearDatabase(): Promise<void> {
    this.db.exec('DELETE FROM items');
    this.db.exec('DELETE FROM references');
    this.db.exec('DELETE FROM mods');
  }

  private prepareFTSQuery(query: string): string {
    // Handle exact matches with quotes
    if (query.startsWith('"') && query.endsWith('"')) {
      return query;
    }

    // Handle complex queries
    if (query.includes(' AND ') || query.includes(' OR ') || query.includes(' NOT ')) {
      return query;
    }

    // For simple queries, add wildcards and prepare for FTS5
    const terms = query.split(/\s+/).filter(term => term.length > 0);
    
    if (terms.length === 1) {
      const term = terms[0];
      // Try exact match first, then prefix match
      return `"${term}" OR ${term}*`;
    }

    // For multiple terms, create a phrase query and individual term queries
    const phraseQuery = `"${terms.join(' ')}"`;
    const termQueries = terms.map(term => `${term}*`).join(' ');
    
    return `${phraseQuery} OR (${termQueries})`;
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
