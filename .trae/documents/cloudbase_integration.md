# CloudBase AI Integration for Trae

## Configuration
To enable full CloudBase capabilities in Trae, you need to configure the Model Context Protocol (MCP) server.

### MCP Server Config
Add the following to your Trae MCP settings:

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["npm-global-exec@latest", "@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Trae"
      }
    }
  }
}
```

## Features & Usage

### 1. Environment Management
- **Login**: Use the `mcp_cloudbase_login` tool to authenticate.
- **Switch Environment**: Use `mcp_cloudbase_login` with `forceUpdate: true` or `mcp_cloudbase_envQuery` to check current status.

### 2. Database Operations (NoSQL)
- **Query Data**: Use `mcp_cloudbase_readNoSqlDatabaseContent` to fetch records.
- **Modify Data**: Use `mcp_cloudbase_writeNoSqlDatabaseContent` to insert, update, or delete records.
- **Manage Collections**: Use `mcp_cloudbase_readNoSqlDatabaseStructure` and `mcp_cloudbase_writeNoSqlDatabaseStructure`.

### 3. Cloud Functions
- **List Functions**: `mcp_cloudbase_getFunctionList`
- **Create/Deploy**: `mcp_cloudbase_createFunction`
- **Invoke**: `mcp_cloudbase_invokeFunction`
- **Logs**: `mcp_cloudbase_getFunctionLogs`

### 4. Static Hosting
- **Upload Files**: `mcp_cloudbase_uploadFiles`
- **Manage Domains**: `mcp_cloudbase_domainManagement`

### 5. Storage
- **Upload/Download**: `mcp_cloudbase_manageStorage`
- **Get Temp URLs**: `mcp_cloudbase_queryStorage`

## Best Practices
- Always check the environment ID before performing write operations.
- Use `mcp_cloudbase_interactiveDialog` if you need to confirm risky operations with the user.
