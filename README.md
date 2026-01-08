# AI作文批改系统

基于腾讯云CloudBase的智能作文批改系统，支持图片识别、OCR文字提取、AI智能批改。

## 🌟 功能特性

- ✅ **图片识别**: 支持上传作文图片（最多3张/学生）
- ✅ **OCR识别**: 百度OCR高精度文字识别
- ✅ **AI批改**: 豆包大模型智能批改
- ✅ **异步处理**: 后台异步处理，避免超时
- ✅ **实时进度**: 前端轮询显示处理步骤
- ✅ **批量处理**: 支持同时批改多个学生作文
- ✅ **云存储**: 图片自动上传云存储，处理完成后自动删除

## 🏗️ 架构设计

### 技术栈
- **前端**: 原生HTML/JavaScript + CloudBase Web SDK
- **后端**: Node.js + Express + CloudBase Node SDK
- **数据库**: CloudBase NoSQL数据库
- **云存储**: CloudBase云存储
- **OCR**: 百度OCR API
- **AI模型**: 豆包大模型
- **图片处理**: Python + OpenCV
- **部署**: CloudBase CloudRun（容器化部署）

### 系统架构图

```
┌─────────────┐
│   用户      │
└──────┬──────┘
       │ 1. 上传作文图片
       ↓
┌─────────────────────────────┐
│  前端 (home.html)            │
│  - 图片选择和预览             │
│  - 云存储代理上传             │
│  - 任务提交                  │
│  - 状态轮询（每5秒）          │
└──────┬──────────────────────┘
       │ 2. POST /api/upload
       ↓
┌─────────────────────────────┐
│  代理上传 (/api/upload)       │
│  - 接收图片文件               │
│  - 上传到云存储               │
│  - 返回 fileID               │
└──────┬──────────────────────┘
       │ 3. POST /api/correct
       ↓
┌─────────────────────────────┐
│  任务创建 (/api/correct)      │
│  - 生成 taskId               │
│  - 写入数据库（pending状态）   │
│  - 立即返回 taskId（<1秒）    │
│  - 触发后台 runTask()         │
└──────┬──────────────────────┘
       │ 4. 异步执行
       ↓
┌─────────────────────────────┐
│  后台处理 (runTask)           │
│  ├─ 下载云存储文件            │
│  ├─ Python图片预处理          │
│  ├─ OCR文字识别               │
│  ├─ AI批改                   │
│  ├─ 更新数据库状态            │
│  └─ 删除云存储文件（节省成本）  │
└──────┬──────────────────────┘
       │ 5. GET /api/task/:id (每5秒)
       ↓
┌─────────────────────────────┐
│  状态查询 (/api/task/:id)     │
│  - 读取数据库                │
│  - 返回状态和日志             │
│  - 完成时返回批改结果          │
└──────┬──────────────────────┘
       │ 6. 显示结果
       ↓
┌─────────────┐
│   用户      │
└─────────────┘
```

## 📁 项目结构

```
.
├── server.js                    # 后端服务器主文件
├── src/
│   ├── preprocess_image.py      # 图片预处理脚本
│   └── preprocess_image.js      # Python调用封装
├── templates/
│   └── home.html                # 前端主页面
├── public/                      # 静态资源
├── temp_uploads/                # 临时文件目录
├── data/                        # 输出数据目录
├── Dockerfile                   # Docker构建文件
├── package.json                 # Node.js依赖
├── requirements.txt             # Python依赖
├── cloudbaserc.json             # CloudBase配置
├── FIX_SUMMARY.md               # 修复详情文档
├── TEST_GUIDE.md                # 测试指南
└── README.md                    # 本文件
```

## 🚀 快速开始

### 环境要求

- **Node.js**: v18+
- **Python**: 3.8+
- **CloudBase环境**: 已开通

### 本地开发

1. **安装依赖**:
   ```bash
   npm install
   pip install -r requirements.txt
   ```

2. **配置环境变量**:
   ```bash
   export TCB_ENV=your-env-id
   export TCB_SECRET_ID=your-secret-id
   export TCB_SECRET_KEY=your-secret-key
   export DOUBAO_API_KEY=your-doubao-key
   export BAIDU_API_KEY=your-baidu-key
   export BAIDU_SECRET_KEY=your-baidu-secret
   ```

3. **启动服务**:
   ```bash
   node server.js
   ```

4. **访问应用**:
   ```
   http://localhost:80
   ```

### 部署到CloudRun

1. **确保 Dockerfile 存在**（已提供）

2. **使用 tcb CLI 部署**:
   ```bash
   tcb run deploy -n composition-backend
   ```

3. **或使用 AI 工具部署**:
   ```javascript
   // 使用 call_tcb_integration 工具
   manageCloudRun({
     action: "deploy",
     serverName: "composition-backend",
     targetPath: "/path/to/project"
   })
   ```

## 📊 API 文档

### 1. 图片上传

**端点**: `POST /api/upload`

**请求**:
- Content-Type: `multipart/form-data`
- Body: `file` (图片文件)

**响应**:
```json
{
  "fileID": "cloud://xxx.jpg",
  "message": "Upload successful"
}
```

---

### 2. 提交批改任务

**端点**: `POST /api/correct`

**请求**:
```json
{
  "choice": "记叙文",
  "studentName": "张三",
  "fileIds": ["cloud://xxx1.jpg", "cloud://xxx2.jpg"],
  "imageDataUrls": []  // 备用Base64数据
}
```

**响应**:
```json
{
  "taskId": "1736248500000xxxxx",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

---

### 3. 查询任务状态

**端点**: `GET /api/task/:id`

**响应**:
```json
{
  "id": "1736248500000xxxxx",
  "status": "completed",  // pending / processing / completed / error
  "logs": [
    "[xx:xx:xx] Task created",
    "[xx:xx:xx] Task started. Processing images...",
    "[xx:xx:xx] Image 1: Recognizing Text (OCR)...",
    "[xx:xx:xx] AI processing complete."
  ],
  "result": {
    "原文": "...",
    "修改建议": "...",
    "修改示范": "...",
    ...
  },
  "error": null
}
```

---

### 4. 数据库健康检查

**端点**: `GET /api/test-db`

**响应**:
```json
{
  "status": "success",
  "message": "Database Write & Read successful",
  "data": { "test": true, "timestamp": 1234567890 }
}
```

## 🔧 配置说明

### CloudBase 配置

**环境ID**: `cloud1-0gh78mpy39eccc0f`  
**区域**: `ap-shanghai`

**所需资源**:
- ✅ NoSQL数据库（集合：`correction_tasks`）
- ✅ 云存储（用于图片上传）
- ✅ CloudRun服务（容器化部署）

### 数据库集合结构

**集合名**: `correction_tasks`

**字段说明**:
```javascript
{
  _id: "1736248500000xxxxx",       // 任务ID（自动生成）
  status: "completed",              // 状态：pending / processing / completed / error
  logs: [                           // 处理日志数组
    "[xx:xx:xx] Task created",
    "[xx:xx:xx] Processing..."
  ],
  result: {                         // 批改结果（完成时）
    "原文": "...",
    "修改建议": "...",
    ...
  },
  error: null,                      // 错误信息（失败时）
  startTime: 1736248500000          // 创建时间戳
}
```

**清理策略**: 自动删除24小时前的任务记录

## 🐛 已修复的Bug（2026-01-07）

### Bug #1: 数据库自动清理太激进
**问题**: 任务完成1小时后就被删除，导致数据库看起来总是空的  
**修复**: 延长清理周期至24小时

### Bug #2: 数据库写入错误处理不当
**问题**: 数据库写入失败时静默失败，前端无法感知  
**修复**: 改进错误处理机制，失败时正确返回500错误

### Bug #3: 前端超时时间不足
**问题**: 5分钟超时对于复杂任务不够用  
**修复**: 延长超时时间至10分钟

**详细信息**: 查看 `FIX_SUMMARY.md`

## 📖 测试指南

完整的测试步骤和验证方法请参考：**`TEST_GUIDE.md`**

包含：
- ✅ 基础功能测试
- ✅ 核心功能测试
- ✅ 错误处理测试
- ✅ 性能测试
- ✅ 长期稳定性测试

## 🔗 快速链接

### 应用访问
- **主页**: https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com
- **数据库健康检查**: https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com/api/test-db

### CloudBase 控制台
- **概览**: https://tcb.cloud.tencent.com/dev?envId=cloud1-0gh78mpy39eccc0f#/overview
- **数据库**: https://tcb.cloud.tencent.com/dev?envId=cloud1-0gh78mpy39eccc0f#/db/doc/collection/correction_tasks
- **云存储**: https://tcb.cloud.tencent.com/dev?envId=cloud1-0gh78mpy39eccc0f#/storage
- **CloudRun**: https://tcb.cloud.tencent.com/dev?envId=cloud1-0gh78mpy39eccc0f#/platform-run
- **日志查询**: https://tcb.cloud.tencent.com/dev?envId=cloud1-0gh78mpy39eccc0f#/devops/log

## ⚡ 性能指标

| 指标 | 数值 | 说明 |
|------|------|------|
| 任务提交响应时间 | <1秒 | 立即返回taskId |
| 单张图片处理时间 | 30-60秒 | OCR + AI批改 |
| 两张图片处理时间 | 60-120秒 | 串行处理 |
| 最大超时时间 | 10分钟 | 前端轮询超时 |
| 轮询频率 | 5秒/次 | 查询任务状态 |
| 数据保留期 | 24小时 | 自动清理旧记录 |
| 最大并发任务数 | 5个 | CloudRun配置 |
| 单图片最大尺寸 | 30MB | multer限制 |

## 📝 待优化项

1. **任务优先级队列**: 支持VIP用户优先处理
2. **批量处理优化**: 并行处理多张图片（目前是串行）
3. **结果缓存**: 相同作文避免重复批改
4. **WebSocket推送**: 替代轮询机制，减少请求次数
5. **进度百分比**: 更细粒度的处理进度展示
6. **图片压缩**: 自动压缩大尺寸图片，提升OCR速度
7. **多模型支持**: 支持切换不同的AI批改模型
8. **批改标准定制**: 支持自定义批改标准和评分维度

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**最后更新**: 2026-01-07  
**当前版本**: composition-backend-043  
**维护者**: AI作文批改系统团队
