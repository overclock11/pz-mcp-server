# Project Zomboid MCP Server Architecture

## Research Summary

Based on research, Project Zomboid mods have the following key components:

### File Structure
- **mod.info**: Metadata file (name, id, author, description, etc.)
- **media/scripts/*.txt**: Game definitions (items, recipes, sounds, vehicles, etc.)
- **media/lua/**: Lua script files (client/, server/, shared/ subfolders)
- **media/**: Other assets (textures, sounds, models, maps, etc.)

### Key File Formats to Parse

1. **mod.info**: Simple key=value format
   - Required: name, id
   - Optional: author, description, version, requirements, etc.

2. **Script Files (.txt)**: Structured blocks
   - module { ... }
   - item { ... }
   - recipe { ... }
   - evolvedrecipe { ... }
   - fixing { ... }
   - sound { ... }
   - vehicle { ... }

3. **Lua Files**: Standard Lua syntax with PZ API calls

## MCP Server Features

The server will provide:
- Parse and index mod files
- Query mod information (items, recipes, dependencies)
- Validate mod structure and compatibility
- Generate mod templates and boilerplate
- Search functionality across mod databases
- Mod conflict detection
- Recipe chain analysis
