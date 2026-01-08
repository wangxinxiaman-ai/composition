# 本地测试失败原因分析与修复

**测试结果分析**：
1.  **连接成功**：`STATUS: 200`。说明服务起来了，Express 正常工作。
2.  **没有心跳**：`Total Heartbeats: 0`。说明 `res.write('<!-- h -->\n')` 没生效，或者被 Express 缓冲了。
3.  **返回了 JSON，但没标记**：`RECEIVED CHUNK ... {"作文题目":"Test Essay"...`。
    *   这说明后端**成功调用了 AI**（虽然我没传图片，但可能我代码里的逻辑允许空图或者 Mock 了）。
    *   **关键问题**：返回的 JSON **没有**被 `___JSON_START___` 包裹。

**为什么没有包裹？**
查看 `server.js` 的 `try` 块：
```javascript
      // 增加隔离换行，确保 JSON 不会和心跳包粘连
      res.write('\n___JSON_START___' + JSON.stringify(result) + '___JSON_END___\n', 'utf8');
```
但是本地测试收到的居然是纯 JSON？
**原因**：Express 的 `res.json()` 或类似方法可能被隐式调用了，或者 `callDoubao` 返回的内容本身有问题。

**等等！我看到了 Header：**
`HEADERS: {"content-type":"application/json", ...}`
**这不对！** 我在代码里显式设置的是：
`res.setHeader('Content-Type', 'text/plain; charset=utf-8');`

**破案了！**
在 `callDoubao` 函数里，或者 `server.js` 的其他地方，可能**覆盖了** `Content-Type`，或者 Express 的默认行为干扰了。
**最可疑的是**：
```javascript
// Enable CORS for all routes (Must be before other middleware)
app.use(cors());
// ...
app.use(express.json(...)); 
```
Express 的 `res.write` 是底层的，通常不会自动改 Header。
但是，如果 `callDoubao` 内部或者外层逻辑有 `res.json()`，那就会覆盖 Header 并发送 JSON。

**再次检查 `server.js` 源码**：
我在 `app.post` 里写了 `res.setHeader(...)`。
但是测试结果显示 Header 变成了 `application/json`。
这意味着**在我的 `res.write` 之前，有东西修改了 Header**。

**还有一种可能**：
我本地启动的 `node server.js` 可能**不是最新的代码**（虽然我用了 `SearchReplace`，但可能没生效？）。
不，`SearchReplace` 是生效的。

**真正的罪魁祸首**：
`app.use(express.json())` 会自动解析 Body，但这不影响 Response。

**让我们看 `test_client.js` 的日志**：
`RECEIVED CHUNK (662 chars): {"作文题目":"Test Essay"...`
这直接是一个 JSON 对象。
说明 `callDoubao` 返回的 `result` 是个对象，然后 `JSON.stringify` 后确实是 JSON。
但是**前面的 `___JSON_START___` 去哪了？**

**极有可能的原因：Buffer 缓冲机制**
Express (或者底层的 Node.js http) 在 `chunked` 模式下，如果第一次 `write` 的内容太长，可能会分片。
但这里连 `<!-- h -->` 都没收到。

**更诡异的是**：
`HEADERS: ... "content-type":"application/json"`。
我的代码里明明写的是 `text/plain`。
**这说明我的 `res.setHeader` 被覆盖了，或者根本没执行到那里。**

**推测**：
我在 `app.post` 的开头就写了 `res.setHeader`。
如果有中间件（如 `cors`）修改了它，或者 Express 发现我在发 JSON（虽然我发的是字符串），它自作聪明了？

**不对，Express 不会自作聪明改 Content-Type 为 json，除非我调了 `res.json()`。**
但我代码里全是 `res.write`。

**让我仔细看一眼 `server.js` 的 `callDoubao` 函数**。
虽然它是辅助函数，不涉及 `res`。

**等等！**
`HEADERS: ... "access-control-allow-origin":"*"`
这是 CORS 中间件加的。

**有没有可能**：
我本地运行的 `test_client.js` 连接的端口 `3001`，但 `server.js` 里：
```javascript
const port = process.env.PORT || 80;
```
本地没有 `.env` 指定 PORT=3001 的话，它应该监听 80？
日志显示：`Server running on port 3001`。
说明 `.env.local` 生效了，或者 `process.env.PORT` 有值。

**问题焦点：为什么 Content-Type 变成了 application/json？**
这意味着 **Express 认为我在发 JSON**。
唯一的解释是：**我在某个地方用了 `res.json()` 或者 `res.send()`，而不是 `res.write()`。**

**检查代码**：
```javascript
    // 开启流式响应，防止网关超时
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
```
这段代码在 `app.post` 的第一行。

**除非...**
`callDoubao` 报错了，进入了 `catch`？
`catch` 里也是 `res.write`。

**让我做一个极端的测试**：
把 `server.js` 里的逻辑简化，只发心跳，不发别的，看看 Header 是什么。

**或者，直接强制覆盖**：
在 `res.write` 之前再次 `res.setHeader`？不行，Header 早就发了。

**修正方案**：
既然 Express 这么“智能”或者哪里有鬼，我决定**显式禁用 Express 的一些默认行为**，或者**完全接管 Response**。
其实 `res` 就是原生的 `http.ServerResponse` 的子类。

**但我发现了一个细节**：
测试脚本里：`RECEIVED CHUNK ... {"作文题目"...`
这说明**JSON 确实发出来了**。
但是没有 `___JSON_START___`。
这意味着 `'\n___JSON_START___' + JSON.stringify(result) + '___JSON_END___\n'` 这个字符串拼接**只发出了中间部分**？这在逻辑上是不可能的。

**唯一解释：**
**我运行的代码和我想象的不一样。**
也就是 `server.js` 的内容可能**没更新成功**，或者我之前 `SearchReplace` 的时候**把旧代码保留了一部分**，导致逻辑混乱。

**行动**：
1.  **读取 `server.js`**：我要亲眼看看现在的 `server.js` 到底长什么样。
2.  **强制覆盖**：如果发现代码乱了，我直接用 `Write` 工具**全量覆盖** `server.js`，而不是用 `SearchReplace`。

我敢打赌，`server.js` 现在肯定是一团糟（比如有两个 `app.post` 或者混合了新旧逻辑）。

我立即读取 `server.js`。