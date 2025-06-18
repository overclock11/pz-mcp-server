#!/bin/bash

# Project Zomboid MCP Server Installation Script
# Author: MiniMax Agent

set -e

echo "🎮 Project Zomboid MCP Server Installation"
echo "=========================================="

# Check Node.js version
echo "📋 Checking Node.js version..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building the project..."
npm run build

# Create data directory
echo "📁 Creating data directory..."
mkdir -p data

# Check for Project Zomboid installation
echo "🔍 Checking for Project Zomboid installation..."
PZ_PATHS=(
    "/mnt/c/Program Files (x86)/Steam/steamapps/common/ProjectZomboid"
    "/mnt/c/Program Files/Steam/steamapps/common/ProjectZomboid"
    "$HOME/.steam/debian-installation/steamapps/common/ProjectZomboid"
    "$HOME/.local/share/Steam/steamapps/common/ProjectZomboid"
    "/Applications/ProjectZomboid.app/Contents"
)

PZ_FOUND=""
for path in "${PZ_PATHS[@]}"; do
    if [ -d "$path" ] && [ -d "$path/media/scripts" ]; then
        PZ_FOUND="$path"
        echo "✅ Found Project Zomboid at: $path"
        break
    fi
done

if [ -z "$PZ_FOUND" ]; then
    echo "⚠️ Project Zomboid installation not auto-detected."
    echo "   You can specify the path manually when running the server."
else
    echo "🎮 Project Zomboid found at: $PZ_FOUND"
    echo "   The server will auto-detect this installation."
fi

# Create example configuration
echo "⚙️ Creating example configuration..."
cat > config.example.json << 'EOF'
{
  "projectZomboidPath": "/path/to/ProjectZomboid",
  "databasePath": "./data/pz_database.db",
  "logLevel": "info",
  "enableAutoDetection": true,
  "mcpServer": {
    "name": "pz-mcp-server",
    "version": "1.0.0"
  }
}
EOF

# Create Claude Desktop configuration example
echo "🤖 Creating Claude Desktop configuration example..."
mkdir -p examples
cat > examples/claude_desktop_config.json << EOF
{
  "mcpServers": {
    "pz-mcp-server": {
      "command": "node",
      "args": ["$(pwd)/dist/index.js"]
    }
  }
}
EOF

# Success message
echo ""
echo "🎉 Installation completed successfully!"
echo ""
echo "📋 Next Steps:"
echo "1. Run the server: npm run dev"
echo "2. Or use with Claude Desktop:"
echo "   - Copy examples/claude_desktop_config.json to your Claude config"
echo "   - Update the path to match your installation"
echo "3. For Cloudflare deployment:"
echo "   - Install wrangler: npm install -g wrangler"
echo "   - Follow docs/CLOUDFLARE_DEPLOYMENT.md"
echo ""
echo "📖 Documentation:"
echo "- README.md - Complete usage guide"
echo "- docs/CLOUDFLARE_DEPLOYMENT.md - Deployment guide"
echo "- docs/USAGE_EXAMPLES.md - Example workflows"
echo ""
echo "🚀 Ready to enhance your Project Zomboid modding experience!"
