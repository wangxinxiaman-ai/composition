# CloudBase AI Rules for Trae

## Overview
CloudBase AI Toolkit connects Trae with Tencent CloudBase, enabling you to build and deploy full-stack applications directly from your IDE.

## 1. MCP Configuration
To enable CloudBase integration in Trae, configure the MCP server:

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

## 2. Available Tools
You can use the following MCP tools to interact with CloudBase:
- **Environment Management**: `mcp_cloudbase_login`, `mcp_cloudbase_envQuery`
- **Database**: `mcp_cloudbase_readNoSqlDatabaseContent`, `mcp_cloudbase_writeNoSqlDatabaseContent`
- **Functions**: `mcp_cloudbase_createFunction`, `mcp_cloudbase_invokeFunction`
- **Storage**: `mcp_cloudbase_uploadFiles`, `mcp_cloudbase_manageStorage`
- **Hosting**: `mcp_cloudbase_domainManagement`

## 3. Workflow Guidelines
1. **Login**: Always start by ensuring you are logged in using `mcp_cloudbase_login`.
2. **Environment**: Select the correct environment using `mcp_cloudbase_envQuery`.
3. **Development**: Use the MCP tools to create functions, manage database collections, and upload static files.
4. **Deployment**: Use the `tcb` CLI (if installed) or MCP tools to deploy your application.

## 4. CLI Usage
If you have `@cloudbase/cli` installed (`npm install -g @cloudbase/cli`), you can use the `tcb` command for advanced operations.

## 5. Best Practices
- Keep your cloud functions stateless.
- Use environment variables for secrets.
- detailed rules and templates can be found in the [CloudBase AI Toolkit Repository](https://github.com/TencentCloudBase/CloudBase-AI-ToolKit).
