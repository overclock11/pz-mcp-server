/**
 * Cloudflare Worker entry point for Project Zomboid MCP Server
 * Provides HTTP API for MCP tools that can be called from any MCP client
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { DatabaseManager } from './database/DatabaseManager.js';
import { ProjectZomboidParser } from './parsers/ProjectZomboidParser.js';
import { ModAnalyzer } from './analyzers/ModAnalyzer.js';
import { ScriptGenerator } from './generators/ScriptGenerator.js';
import { ValidationEngine } from './validation/ValidationEngine.js';

// Cloudflare Worker environment interface
interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ENVIRONMENT: string;
  LOG_LEVEL: string;
}

// Create Hono app
const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
  });
});

// MCP Tools API endpoints
app.post('/tools/:toolName', async (c) => {
  const toolName = c.req.param('toolName');
  const body = await c.req.json();

  try {
    // Initialize components with D1 database
    const dbManager = new CloudflareDBManager(c.env.DB);
    await dbManager.initialize();

    const parser = new ProjectZomboidParser(dbManager);
    const generator = new ScriptGenerator(dbManager);
    const validator = new ValidationEngine(dbManager);
    const analyzer = new ModAnalyzer(dbManager, parser);

    let result;

    switch (toolName) {
      case 'search_vanilla':
        result = await handleSearchVanilla(dbManager, body);
        break;
      
      case 'generate_script':
        result = await handleGenerateScript(generator, body);
        break;
      
      case 'validate_script':
        result = await handleValidateScript(validator, body);
        break;
      
      case 'check_references':
        result = await handleCheckReferences(validator, body);
        break;
      
      case 'analyze_mod':
        result = await handleAnalyzeMod(analyzer, body);
        break;
      
      default:
        return c.json({ error: `Unknown tool: ${toolName}` }, 404);
    }

    return c.json({ success: true, data: result });

  } catch (error) {
    console.error(`Error in ${toolName}:`, error);
    return c.json({ 
      error: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

// Tool handlers
async function handleSearchVanilla(db: DatabaseManager, params: any) {
  const { query, type, category, limit = 20 } = params;
  return await db.searchContent(query, { type, category, limit });
}

async function handleGenerateScript(generator: ScriptGenerator, params: any) {
  const { type, name, properties, module = 'Base' } = params;
  return await generator.generateScript(type, name, properties, module);
}

async function handleValidateScript(validator: ValidationEngine, params: any) {
  const { content, type, strict = false } = params;
  return await validator.validateScript(content, type, strict);
}

async function handleCheckReferences(validator: ValidationEngine, params: any) {
  const { references, type = 'all' } = params;
  return await validator.checkReferences(references, type);
}

async function handleAnalyzeMod(analyzer: ModAnalyzer, params: any) {
  const { modPath, checkBalance = true, checkCompatibility = true, generateReport = true } = params;
  return await analyzer.analyzeMod(modPath, {
    checkBalance,
    checkCompatibility,
    generateReport,
  });
}

// Cloudflare-specific database manager
class CloudflareDBManager extends DatabaseManager {
  private d1: D1Database;

  constructor(d1: D1Database) {
    super(); // Don't pass dbPath since we're using D1
    this.d1 = d1;
  }

  async initialize(): Promise<void> {
    // Initialize D1 tables
    await this.createD1Tables();
  }

  private async createD1Tables(): Promise<void> {
    // Create main items table
    await this.d1.prepare(`
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
    `).run();

    // Create references table
    await this.d1.prepare(`
      CREATE TABLE IF NOT EXISTS references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        reference_type TEXT NOT NULL,
        context TEXT,
        FOREIGN KEY (item_id) REFERENCES items (id)
      )
    `).run();

    // Create indexes
    await this.d1.prepare(`CREATE INDEX IF NOT EXISTS idx_items_type ON items (type)`).run();
    await this.d1.prepare(`CREATE INDEX IF NOT EXISTS idx_items_module ON items (module)`).run();
    await this.d1.prepare(`CREATE INDEX IF NOT EXISTS idx_items_category ON items (category)`).run();
  }

  // Override parent methods to use D1
  async insertItem(item: any): Promise<void> {
    await this.d1.prepare(`
      INSERT OR REPLACE INTO items 
      (id, name, display_name, type, module, category, properties, raw_content, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      item.id,
      item.name,
      item.displayName,
      item.type,
      item.module,
      item.category,
      JSON.stringify(item.properties),
      item.rawContent,
      item.filePath
    ).run();
  }

  async searchContent(query: string, options: any = {}): Promise<any[]> {
    let sql = `
      SELECT id, name, display_name, type, module, category, properties, raw_content, file_path
      FROM items
      WHERE 1=1
    `;
    const params: any[] = [];

    // Add search conditions
    if (query.trim()) {
      sql += ` AND (name LIKE ? OR display_name LIKE ? OR properties LIKE ?)`;
      const searchTerm = `%${query}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (options.type && options.type !== 'all') {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    if (options.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }

    sql += ' ORDER BY name ASC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const results = await this.d1.prepare(sql).bind(...params).all();
    
    return results.results?.map((row: any) => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      type: row.type,
      module: row.module,
      category: row.category,
      properties: JSON.parse(row.properties || '{}'),
      rawContent: row.raw_content,
      filePath: row.file_path,
    })) || [];
  }
}

// Data loading endpoint for populating the database
app.post('/admin/load-game-data', async (c) => {
  try {
    const { gameData } = await c.req.json();
    
    if (!gameData || !Array.isArray(gameData)) {
      return c.json({ error: 'Invalid game data format' }, 400);
    }

    const dbManager = new CloudflareDBManager(c.env.DB);
    await dbManager.initialize();

    // Insert items in batches
    const batchSize = 100;
    let processed = 0;

    for (let i = 0; i < gameData.length; i += batchSize) {
      const batch = gameData.slice(i, i + batchSize);
      
      for (const item of batch) {
        await dbManager.insertItem(item);
        processed++;
      }
    }

    return c.json({ 
      success: true, 
      message: `Loaded ${processed} items into database` 
    });

  } catch (error) {
    console.error('Failed to load game data:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

// MCP server info endpoint
app.get('/mcp/info', (c) => {
  return c.json({
    name: 'pz-mcp-server',
    version: '1.0.0',
    description: 'Project Zomboid MCP Server for mod development',
    tools: [
      'search_vanilla',
      'generate_script', 
      'validate_script',
      'check_references',
      'analyze_mod'
    ],
    capabilities: {
      database: 'D1',
      caching: 'KV',
      deployment: 'Cloudflare Workers'
    }
  });
});

export default app;
