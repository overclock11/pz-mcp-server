# Cloudflare Workers Deployment Guide

This guide walks you through deploying the Project Zomboid MCP Server to Cloudflare Workers for serverless operation.

## Prerequisites

- Cloudflare account with Workers enabled
- Wrangler CLI installed globally
- Node.js 18+ for building the project

## Setup Steps

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
```

### 2. Login to Cloudflare

```bash
wrangler login
```

This will open a browser window for authentication.

### 3. Create D1 Database

```bash
# Create production database
wrangler d1 create pz-mcp-prod

# Create development database
wrangler d1 create pz-mcp-dev
```

Note the database IDs returned by these commands.

### 4. Create KV Namespaces

```bash
# Create production KV namespace
wrangler kv:namespace create "CACHE"

# Create development KV namespace  
wrangler kv:namespace create "CACHE" --preview
```

### 5. Update wrangler.toml

Replace the placeholder IDs in `wrangler.toml` with your actual database and KV IDs:

```toml
[[env.development.d1_databases]]
binding = "DB"
database_name = "pz-mcp-dev"
database_id = "your-actual-dev-database-id"

[[env.production.d1_databases]]
binding = "DB"
database_name = "pz-mcp-prod"  
database_id = "your-actual-prod-database-id"

[[env.development.kv_namespaces]]
binding = "CACHE"
id = "your-actual-dev-kv-id"

[[env.production.kv_namespaces]]
binding = "CACHE"
id = "your-actual-prod-kv-id"
```

### 6. Build the Project

```bash
npm run build
```

### 7. Deploy to Development

```bash
wrangler deploy --env development
```

### 8. Deploy to Production

```bash
wrangler deploy --env production
```

## Database Initialization

After deployment, you need to populate the database with Project Zomboid game data.

### Option 1: Upload via API

```bash
# Parse local game files first
node dist/index.js parse-game-files --output game-data.json

# Upload to Cloudflare Worker
curl -X POST https://your-worker.workers.dev/admin/load-game-data \
  -H "Content-Type: application/json" \
  -d @game-data.json
```

### Option 2: Use D1 Migrations

Create migration files in `migrations/` directory and apply them:

```bash
wrangler d1 migrations create initial-schema --env production
wrangler d1 migrations apply --env production
```

## Environment Configuration

### Development Environment

```toml
[env.development.vars]
ENVIRONMENT = "development"
LOG_LEVEL = "debug"
CORS_ORIGINS = "http://localhost:3000,http://localhost:8080"
```

### Production Environment

```toml
[env.production.vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"
CORS_ORIGINS = "https://yourdomain.com"
```

## API Usage

Once deployed, your MCP server provides HTTP endpoints:

### Health Check
```bash
curl https://your-worker.workers.dev/health
```

### Server Info
```bash
curl https://your-worker.workers.dev/mcp/info
```

### Using MCP Tools
```bash
# Search vanilla content
curl -X POST https://your-worker.workers.dev/tools/search_vanilla \
  -H "Content-Type: application/json" \
  -d '{"query": "katana", "type": "item"}'

# Generate script
curl -X POST https://your-worker.workers.dev/tools/generate_script \
  -H "Content-Type: application/json" \
  -d '{
    "type": "item",
    "name": "SuperKatana",
    "properties": {
      "DisplayName": "Super Katana",
      "Type": "Weapon",
      "MaxDamage": 5.0
    }
  }'
```

## Integration with MCP Clients

### Claude Desktop Configuration

Create or update your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pz-mcp-server": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "https://your-worker.workers.dev/tools/{tool}",
        "-H", "Content-Type: application/json",
        "-d", "{params}"
      ]
    }
  }
}
```

### Custom MCP Client

For TypeScript/JavaScript clients:

```typescript
class CloudflareSourcedMCPClient {
  constructor(private baseUrl: string) {}

  async callTool(toolName: string, params: any) {
    const response = await fetch(`${this.baseUrl}/tools/${toolName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    if (!response.ok) {
      throw new Error(`Tool call failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.data;
  }
}

const client = new CloudflareSourcedMCPClient('https://your-worker.workers.dev');
const results = await client.callTool('search_vanilla', { query: 'weapon' });
```

## Monitoring and Debugging

### View Logs

```bash
wrangler tail --env production
```

### Check Database

```bash
# List tables
wrangler d1 execute pz-mcp-prod --command "SELECT name FROM sqlite_master WHERE type='table';"

# Check item count
wrangler d1 execute pz-mcp-prod --command "SELECT COUNT(*) FROM items;"

# Sample data
wrangler d1 execute pz-mcp-prod --command "SELECT * FROM items LIMIT 5;"
```

### Performance Monitoring

The Worker includes built-in performance monitoring:

- Response times for each tool
- Database query performance
- Memory usage statistics
- Error rates and types

Access these metrics in the Cloudflare Dashboard under Workers Analytics.

## Security Considerations

### API Authentication

For production use, consider adding authentication:

```typescript
// Add to cloudflare-worker.ts
app.use('/tools/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !validateAPIKey(authHeader)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});
```

### Rate Limiting

Implement rate limiting for public APIs:

```typescript
// Simple rate limiting with KV
app.use('/tools/*', async (c, next) => {
  const clientIP = c.req.header('CF-Connecting-IP');
  const rateLimitKey = `rate_limit:${clientIP}`;
  
  const requests = await c.env.CACHE.get(rateLimitKey);
  if (requests && parseInt(requests) > 100) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }
  
  await c.env.CACHE.put(rateLimitKey, (parseInt(requests || '0') + 1).toString(), {
    expirationTtl: 3600 // 1 hour
  });
  
  await next();
});
```

## Scaling Considerations

### Database Limits

Cloudflare D1 has the following limits:
- 10 GB database size
- 25 million row reads per day (free tier)
- 100,000 row writes per day (free tier)

For heavy usage, consider:
- Implementing caching with KV
- Optimizing queries with proper indexes
- Using batch operations for bulk data

### Worker Limits

- 10ms CPU time per request (free tier)
- 128 MB memory limit
- 50 concurrent executions

Optimize by:
- Caching frequently accessed data
- Using efficient algorithms
- Implementing request batching

## Troubleshooting

### Common Issues

**Build Errors**
```bash
# Clear cache and rebuild
rm -rf dist node_modules
npm install
npm run build
```

**Database Connection Issues**
```bash
# Verify database exists
wrangler d1 list

# Test database connection
wrangler d1 execute your-db-id --command "SELECT 1;"
```

**Deployment Failures**
```bash
# Check wrangler.toml syntax
wrangler validate

# Deploy with debug output
wrangler deploy --verbose
```

### Getting Help

- Check Cloudflare Workers documentation
- Review Wrangler CLI logs
- Test endpoints locally before deployment
- Use the Cloudflare Dashboard for monitoring

## Cost Optimization

### Free Tier Limits

Cloudflare Workers free tier includes:
- 100,000 requests per day
- 10ms CPU time per request
- 25 MB script size

### Cost-Effective Patterns

1. **Cache Aggressively**: Use KV for rarely-changing data
2. **Optimize Queries**: Use indexes and limit result sets
3. **Batch Operations**: Combine multiple operations when possible
4. **Monitor Usage**: Use Cloudflare Analytics to track consumption

---

With this setup, your Project Zomboid MCP Server will be globally available, automatically scaled, and ready to assist with mod development from anywhere in the world!
