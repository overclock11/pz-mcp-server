# Project Zomboid MCP Server

A comprehensive Model Context Protocol (MCP) server for Project Zomboid mod development, providing intelligent script validation, generation, and contextual assistance through AI-enhanced tooling.

## 🚀 Features

### Smart Project Zomboid Integration
- **Auto-detection** of Steam, Epic Games, and GOG installations
- **Cross-platform support** (Windows, Linux, macOS, WSL)
- **Build 42 compatibility** with modern mod structure support
- **Fallback system** with local script parsing

### Comprehensive Game Data Knowledge
- **Complete vanilla game indexing** with full-text search capabilities
- **Rich metadata extraction** including damage, durability, categories, and tags
- **Relationship mapping** between items, recipes, and dependencies
- **Real-time reference validation** against game database

### Intelligent Script Generation
- **Template-based generation** using real game patterns
- **Balance analysis** comparing custom items to vanilla equivalents
- **Reference validation** ensuring all dependencies exist
- **Multiple output formats** (items, recipes, fixing scripts, sounds, vehicles)
- **Build 42 syntax** throughout: `ItemType = base:<type>`, namespaced `Categories`/`Tags`, modern `craftRecipe`

### One-Shot Mod Generation (`generate_mod`)
- **Complete mod folder** ready to copy into `Zomboid\mods\` or upload to the Workshop
- **Versioned structure** (`42.0/` + root `mod.info`) with B42-correct `craftRecipe` (bracketed inputs, mandatory bench tag, drainable-friendly modes)
- **Vanilla asset reuse**: item `WeaponSprite` pointing at a vanilla mesh is auto-cloned into a mod-owned `model` block (hand/world attachments preserved) with the vanilla texture copied as a paintable base — never clobbered on regeneration
- **Procedural art**: `icon.png` (256x256), `poster.png` (512x288) and per-item inventory icons (128x128) generated with a dependency-free PNG encoder, replaceable by your own art
- **World loot, translations (multi-language) and a step-by-step `GUIA.md`** included in every generated mod

### Advanced Validation Engine
- **Real-time syntax validation** with detailed error reporting
- **Reference checking** for items, sounds, and sprites
- **Balance analysis** with gameplay impact assessment
- **Best practices suggestions** for mod development

### Deployment Ready
- **Cloudflare Workers** support for serverless deployment
- **D1 Database** integration for persistent storage
- **HTTP API** for integration with any MCP client
- **Claude Desktop** ready with example configurations

## 🔧 Installation

### Prerequisites
- Node.js 18.0.0 or higher

### 🧠 Skill for opencode (recommended)

This repo ships an **opencode skill** that teaches any opencode session the complete Build 42 modding workflow with this MCP: how to ask the right questions, calibrate stats against vanilla B42, generate the mod, validate it, install it into `Zomboid\mods\`, customize textures/icons/poster, and always finish with the in-game test commands.

**Install it (one copy):**

```powershell
# Windows
Copy-Item -Recurse skill\pz-b42-modding-skill "$env:USERPROFILE\.config\opencode\skill\pz-b42-modding-skill"

# Linux / macOS
cp -r skill/pz-b42-modding-skill ~/.config/opencode/skill/pz-b42-modding-skill
```

Then restart opencode. From now on, just describe the weapon/item you want (e.g. *"quiero un cuchillo táctico militar que se encuentre en el mundo"*) and the session will follow the full guided workflow automatically.
- npm or yarn package manager

### Local Development
```bash
# Clone the repository
git clone https://github.com/minimax/pz-mcp-server.git
cd pz-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
```

### Cloudflare Workers Deployment
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create pz-mcp-prod

# Deploy to Cloudflare Workers
wrangler deploy
```

## 📖 Usage

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pz-mcp-server": {
      "command": "node",
      "args": ["/path/to/pz-mcp-server/dist/index.js"]
    }
  }
}
```

### With Cursor/VSCode

The server can be integrated with any IDE that supports MCP protocol:

1. Install the MCP extension for your IDE
2. Configure the server endpoint
3. Start using Project Zomboid development tools

### Direct stdio testing (no MCP client needed)

The server speaks line-delimited JSON-RPC over stdio, so you can drive it from a shell:

```powershell
@'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_vanilla","arguments":{"query":"katana"}}}
'@ | node dist\index.js
```

Sequence: `initialize` → `notifications/initialized` → `tools/call`. The SQLite database (`data/pz_database.db`) resolves relative to the process working directory — run from the repo root.

## 🛠️ MCP Tools

### `search_vanilla`
Search vanilla Project Zomboid content with intelligent matching.

**Parameters:**
- `query` (string): Search query for game content
- `type` (string, optional): Filter by content type (item, recipe, sound, vehicle)
- `category` (string, optional): Filter by item category
- `limit` (number, optional): Maximum results (default: 20)

**Example:**
```typescript
// Search for weapons
await mcp.callTool('search_vanilla', {
  query: 'katana',
  type: 'item',
  category: 'Weapon'
});
```

### `generate_script`
Generate balanced Project Zomboid scripts using templates and game data.

**Parameters:**
- `type` (string): Script type (item, recipe, evolvedrecipe, fixing, sound, vehicle)
- `name` (string): Name of the item/recipe to generate
- `properties` (object): Properties and specifications
- `module` (string, optional): Module name (default: "Base")

**Example (Build 42 syntax):**
```typescript
// Generate a custom weapon
await mcp.callTool('generate_script', {
  type: 'item',
  name: 'SuperKatana',
  properties: {
    category: 'Weapon',            // control key: picks the weapon template
    DisplayName: 'Super Katana',
    ItemType: 'base:weapon',
    MaxDamage: 5.0,
    Weight: 2.0,
    Categories: 'base:longblade'
  }
});
```

### `validate_script`
Validate Project Zomboid script syntax and references with detailed error reporting.

**Parameters:**
- `content` (string): Script content to validate
- `type` (string, optional): Expected script type
- `strict` (boolean, optional): Enable strict validation mode

**Example:**
```typescript
// Validate mod script
await mcp.callTool('validate_script', {
  content: scriptContent,
  type: 'item',
  strict: true
});
```

### `check_references`
Validate item, sound, and sprite references against game database.

**Parameters:**
- `references` (string[]): List of references to validate
- `type` (string, optional): Type of references (item, sound, sprite, all)

**Example:**
```typescript
// Check if items exist
await mcp.callTool('check_references', {
  references: ['Base.Katana', 'Base.Apple'],
  type: 'item'
});
```

### `analyze_mod`
Comprehensive analysis of mod directory including balance, compatibility, and structure validation.

**Parameters:**
- `modPath` (string): Path to mod directory
- `checkBalance` (boolean, optional): Perform balance analysis
- `checkCompatibility` (boolean, optional): Check compatibility with vanilla
- `generateReport` (boolean, optional): Generate detailed analysis report

**Example:**
```typescript
// Analyze mod quality
await mcp.callTool('analyze_mod', {
  modPath: '/path/to/my-mod',
  checkBalance: true,
  checkCompatibility: true
});
```

### `parse_game_files`
Parse and index Project Zomboid game files to populate the database.

**Parameters:**
- `gamePath` (string, optional): Path to Project Zomboid installation (auto-detected if not provided)
- `forceReparse` (boolean, optional): Force re-parsing even if data exists

**Example:**
```typescript
// Parse vanilla game files
await mcp.callTool('parse_game_files', {
  forceReparse: false
});
```

### `generate_mod`
Generate a complete Build 42 mod folder ready to copy into `Zomboid\mods\`: mod.info, item scripts, 3D model blocks, craftRecipes, world loot, translations, placeholder icons and a step-by-step `GUIA.md`.

**Parameters:**
- `modId` (string): Alphanumeric mod id used in scripts/folders (e.g. `SpecialAxe`)
- `modName` (string): Display name (ASCII only — accents belong in translations)
- `description`, `author`, `version`, `gameVersion` (optional): mod.info metadata
- `outputPath` (string, optional): Defaults to `./generated-mods/<modId>`
- `overwrite` (boolean, optional): Allow writing into an existing folder (never deletes foreign files, e.g. user-painted textures)
- `items` (array): `{ name, properties }` — use `category: 'Weapon'` for the weapon template; generator control keys (`category`, `weaponType`, `similar`) are never emitted to the script
- `models` (array, optional): `{ name, mesh, texture?, scale?, worldOffset?, worldRotate? }` — meshes can be vanilla paths (e.g. `weapons/2handed/FireAxe`); the vanilla texture is always copied as a paintable base
- `recipes` (array, optional): B42 `craftRecipe` specs — `time`, `category`, `SkillRequired: "Perk:Level"`, `timedAction`, `xpAward`, `ingredients` (`{ item, count, keep?, mode? }`), `result`
- `worldLoot` (array, optional): `{ distribution, weight }` — adds the first item to procedural distributions
- `languages` / `translations` (optional): generates `ItemName.json` per language

**Example:**
```typescript
await mcp.callTool('generate_mod', {
  modId: 'Stormbreaker',
  modName: "Stormbreaker - Thor's Axe",
  items: [{
    name: 'Stormbreaker',
    properties: {
      category: 'Weapon', weaponType: 'Axe',
      DisplayName: 'Stormbreaker', Icon: 'Stormbreaker',
      Categories: 'base:axe', WeaponSprite: 'FireAxe',
      MinDamage: 2.5, MaxDamage: 4.5, TwoHandWeapon: true
    }
  }],
  recipes: [{
    name: 'ForgeStormbreaker', time: 400, category: 'Metalworking',
    SkillRequired: 'MetalWelding:6', timedAction: 'Welding', xpAward: 'MetalWelding:75',
    ingredients: [
      { item: 'Base.MetalBar', count: 4 },
      { item: 'tags[base:weldingmask]', keep: true },
      { item: 'Base.BlowTorch', count: 1, mode: 'none' }
    ],
    result: 'Stormbreaker.Stormbreaker'
  }],
  worldLoot: [{ distribution: 'MeleeWeapons', weight: 0.5 }],
  languages: ['EN', 'ES'],
  translations: { ES: { 'Stormbreaker.Stormbreaker': 'Rompetormentas' } },
  overwrite: true
});
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                MCP Server Core                      │
├─────────────────────────────────────────────────────┤
│  Path Manager  │  Enhanced Parser  │  Script Gen    │
├─────────────────────────────────────────────────────┤
│          SQLite/D1 Database Layer                   │
├─────────────────────────────────────────────────────┤
│  Game Data     │  Templates       │  Validation     │
│  (Vanilla PZ)  │  (JSON-based)   │  (Real-time)    │
└─────────────────────────────────────────────────────┘
```

### Core Components

- **DatabaseManager**: SQLite/D1 database with full-text search capabilities
- **ProjectZomboidParser**: Parse vanilla game files and mod directories
- **ScriptGenerator**: Generate balanced scripts using templates and game data
- **ValidationEngine**: Real-time syntax and reference validation
- **ModAnalyzer**: Comprehensive mod analysis and quality metrics
- **PathManager**: Auto-detection of Project Zomboid installations

## 🌐 Cloudflare Workers Deployment

The server includes full Cloudflare Workers support for serverless deployment:

### Features
- **D1 Database** for persistent storage
- **KV Storage** for caching frequently accessed data
- **HTTP API** endpoints for all MCP tools
- **Automatic scaling** with zero cold starts
- **Global edge deployment** for low latency

### API Endpoints

- `GET /health` - Health check
- `GET /mcp/info` - Server capabilities
- `POST /tools/{toolName}` - Execute MCP tools
- `POST /admin/load-game-data` - Load vanilla game data

### Configuration

Update `wrangler.toml` with your database IDs:

```toml
[[env.production.d1_databases]]
binding = "DB"
database_name = "pz-mcp-prod"
database_id = "your-database-id"
```

## 📋 Development Workflow

### Setting Up for Mod Development

1. **Initialize Database**:
   ```bash
   npm run dev
   # Server will auto-detect Project Zomboid installation
   ```

2. **Parse Game Files**:
   ```typescript
   await mcp.callTool('parse_game_files', {});
   ```

3. **Generate a complete mod in one shot**:
   ```typescript
   const result = await mcp.callTool('generate_mod', { /* see generate_mod docs */ });
   // -> result.content includes modId, itemIds and ready-to-paste test commands:
   //    additem "PlayerName" "<ModId>.<Item>" 1
   //    getPlayer():getInventory():AddItem("<ModId>.<Item>")
   ```

4. **Customize (optional)**: replace the procedural icons/poster, paint the copied vanilla texture base, add custom sounds — every generated mod ships with a Spanish step-by-step `GUIA.md` covering all of it.

5. **Validate anytime**:
   ```typescript
   const validation = await mcp.callTool('validate_script', { content: script, strict: true });
   ```

### Supported File Formats

- **mod.info**: Mod metadata and configuration
- **Script Files (.txt)**: Items, recipes, vehicles, sounds, fixing scripts
- **Lua Files (.lua)**: Game logic and event handlers
- **Assets**: Textures, sounds, models, and maps

## 🔍 Examples

### Creating a Custom Weapon

```typescript
// 1. Search for similar weapons
const similarWeapons = await mcp.callTool('search_vanilla', {
  query: 'katana sword blade',
  type: 'item'
});

// 2. Generate balanced weapon
const weaponScript = await mcp.callTool('generate_script', {
  type: 'item',
  name: 'EliteKatana',
  properties: {
    category: 'Weapon',            // control key: weapon template
    DisplayName: 'Elite Katana',
    ItemType: 'base:weapon',
    Weight: 2.5,
    MaxDamage: 4.5,
    MinDamage: 3.5,
    Categories: 'base:longblade',
    Icon: 'Katana',
    SwingSound: 'KatanaSwing'
  }
});

// 3. Validate the script
const validation = await mcp.callTool('validate_script', {
  content: weaponScript,
  strict: true
});

// 4. Check references exist
await mcp.callTool('check_references', {
  references: ['Katana', 'KatanaSwing'],
  type: 'all'
});
```

### Analyzing Mod Quality

```typescript
const analysis = await mcp.callTool('analyze_mod', {
  modPath: '/path/to/my-zombie-mod',
  checkBalance: true,
  checkCompatibility: true,
  generateReport: true
});

console.log(`Mod Quality Score: ${analysis.quality.overall}/100`);
console.log(`Issues Found: ${analysis.issues.length}`);
console.log(`Recommendations: ${analysis.recommendations.join(', ')}`);
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **GitHub Issues**: Bug reports and feature requests
- **Documentation**: Comprehensive guides and API references
- **Community**: Discord server for mod developers

## 🔮 Roadmap

### v1.1.0 - Enhanced Features
- **Vehicle script support** with complete parsing and generation
- **Advanced templates** for complex modding scenarios
- **Lua script integration** for game logic assistance
- **Performance optimization** tools for large mods

### v1.2.0 - Collaboration Features
- **Multi-user support** for team mod development
- **Version control integration** with Git workflows
- **Automated testing** pipelines for mod validation
- **Documentation generation** from mod analysis

### v2.0.0 - Full Platform
- **Web interface** for non-technical users
- **Steam Workshop integration** for direct publishing
- **Marketplace features** for mod discovery
- **Enterprise support** for large mod teams

---

**Built with ❤️ for the Project Zomboid modding community**
