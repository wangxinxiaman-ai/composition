# CloudBase Coding Guidelines for AI

You are an expert CloudBase developer. When writing code for this project, adhere to the following rules and best practices.

## 1. Project Structure
- **Cloud Functions**: Place in `functions/<function_name>/`.
- **Static Files**: Place in `public/` or `templates/` (if using server-side rendering).
- **Configuration**: Use `cloudbaserc.json` for project-level config.

## 2. Cloud Functions
- **Node.js Runtime**: Prefer Node.js 16/18.
- **Dependencies**: Each function must have its own `package.json`.
- **Entry Point**: `index.js` exporting `main` or `tcbMain`.
- **Async/Await**: Always use async/await for asynchronous operations.
- **Error Handling**: Wrap logic in try-catch blocks and return standardized error responses.

```javascript
// Example Cloud Function Structure
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    // Business logic here
    return { success: true, data: result };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
};
```

## 3. Database (NoSQL)
- **Collections**: Define collection names in constants.
- **Permissions**: Set ACL (Access Control List) appropriately (e.g., `read: true`, `write: false` for public data).
- **Queries**: Use `db.collection('name').where({...}).get()`.
- **Command**: Use `db.command` (e.g., `_.eq`, `_.in`) for complex queries.

## 4. Storage
- **Upload**: Use `uploadFile` API.
- **Temp URL**: Use `getTempFileURL` for sharing private files.

## 5. Environment Variables
- Access via `process.env`.
- Store secrets in CloudBase console, not in code.

## 6. Local Development
- Use `tcb` CLI or MCP tools for local testing and deployment.
- Mock context/event when running functions locally.
