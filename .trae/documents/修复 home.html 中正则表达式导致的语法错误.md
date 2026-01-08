# 修复 home.html 语法错误

**问题确认**：
诊断信息显示 `j:\AI作文批改\templates\home.html` 第 302 行附近有错误：
`[Error] Argument expression expected. [Line 302, Column 23 ~ Line 302, Column 28]`

**代码分析**：
之前我读取 `home.html` 时，看到第 300-302 行附近的逻辑是：
```javascript
const trimmed = rawText.replace(/<!--[\s\S]*?-->/g, '').trim();
// Find the last closing brace
const lastBrace = trimmed.lastIndexOf('}');
```
这里的 `replace` 正则表达式 `/<!--[\s\S]*?-->/g` 可能会被某些 HTML 解析器误认为是 HTML 注释的开始，导致 JS 语法解析错乱（尤其是在 `.html` 文件里的 `<script>` 标签内）。

**修复方案**：
将正则表达式中的 `-->` 转义，或者拆分字符串，避免 HTML 解析器混淆。
更安全的写法是：`new RegExp('<!--[\\s\\S]*?-->', 'g')`。

**行动计划**：
1.  **修正 `home.html`**：修复正则表达式写法，消除语法错误。

我立即执行修复。