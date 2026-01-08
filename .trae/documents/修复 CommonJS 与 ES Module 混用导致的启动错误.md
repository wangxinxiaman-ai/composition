# 解决 Node.js 模块导入错误

**问题分析**：
构建成功但启动失败，报错 `SyntaxError: Unexpected token 'export'`。
这是因为 `src/config/evaluation-standards.js` 文件使用了 ES6 的 `export` 语法，但您的 `server.js` 是使用 CommonJS 的 `require()` 来加载它的。Node.js 在处理 `.js` 文件时，默认将其视为 CommonJS 模块，除非 `package.json` 中设置了 `"type": "module"`，或者文件扩展名为 `.mjs`。

**解决方案**：
将 `src/config/evaluation-standards.js` 中的 `export` 语法修改为 CommonJS 的 `module.exports` 语法，以与 `server.js` 保持一致。

## 修复步骤

1.  **修改 `src/config/evaluation-standards.js`**：
    *   将所有的 `export const XXX = ...`
    *   改为 `const XXX = ...`
    *   并在文件末尾添加 `module.exports = { XXX, YYY, ... };`

我将立即为您执行此修改。修改完成后，请您**重新部署**。