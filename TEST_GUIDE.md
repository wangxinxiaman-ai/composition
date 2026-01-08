# AI作文批改系统 - 测试指南

## 🎉 部署状态
- ✅ **部署成功**: 2026-01-07 20:16:31
- ✅ **服务名称**: composition-backend
- ✅ **版本号**: composition-backend-043
- ✅ **环境ID**: cloud1-0gh78mpy39eccc0f

## 🌐 访问地址
**主页**: https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com

## 📋 测试清单

### 1. ✅ 基础功能测试

#### 1.1 访问主页
```bash
# 浏览器访问
https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com
```
**预期结果**: 正常显示作文批改界面

#### 1.2 数据库健康检查
```bash
# 浏览器访问
https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com/api/test-db
```
**预期结果**: 
```json
{
  "status": "success",
  "message": "Database Write & Read successful",
  "data": { "test": true, "timestamp": 1234567890 }
}
```

---

### 2. ✅ 核心功能测试

#### 2.1 图片上传测试

**步骤**:
1. 打开主页
2. 选择文体（记叙文/议论文/说明文）
3. 为学生1添加1-2张作文图片
4. 点击"开始批改"按钮

**观察要点**:
- ✅ 图片上传进度日志（"上传图片 1/2..."）
- ✅ 任务提交成功（"任务已提交，ID: xxx"）
- ✅ 不应该出现 "network request error"

**调试信息**: 查看浏览器控制台，确认：
```
[xx:xx:xx.xxx][学生 1] 上传图片 1/2...
[xx:xx:xx.xxx][学生 1] 图片上传完成，共 2 张
[xx:xx:xx.xxx][学生 1] 任务已提交，ID: 1736248500000xxxxx
```

---

#### 2.2 异步处理测试

**步骤**:
1. 提交任务后，观察日志区域
2. 应该看到每5秒更新一次的服务器日志

**观察要点**:
- ✅ **立即返回 taskId**（<1秒）
- ✅ **前端轮询日志**（每5秒一次）
- ✅ **后台处理步骤**:
  ```
  [Server] Task started. Processing images...
  [Server] Processing 2 Cloud Storage files...
  [Server] Downloading file 1: cloud://xxx
  [Server] Image 1: Preprocessing (Python)...
  [Server] Image 1: Recognizing Text (OCR)...
  [Server] Image 1: OCR Finished (xxx chars)
  [Server] Calling AI for correction (this may take 1-2 minutes)...
  [Server] AI processing complete.
  ```
- ✅ **不应该出现 504 超时错误**

**预期时间**:
- 单张图片: 30-60秒
- 两张图片: 60-120秒

---

#### 2.3 数据库持久化测试

**步骤**:
1. 提交一个任务并等待完成
2. 复制 taskId（例如：`1736248500000xxxxx`）
3. 访问任务状态API:
   ```
   https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com/api/task/1736248500000xxxxx
   ```

**预期结果**:
```json
{
  "id": "1736248500000xxxxx",
  "status": "completed",
  "logs": [
    "[xx:xx:xx] Task created",
    "[xx:xx:xx] Task started. Processing images...",
    ...
    "[xx:xx:xx] AI processing complete."
  ],
  "result": {
    "原文": "...",
    "修改建议": "...",
    ...
  }
}
```

**数据库验证**:
- ✅ 访问 [CloudBase控制台 - correction_tasks集合](https://tcb.cloud.tencent.com/dev?envId=cloud1-0gh78mpy39eccc0f#/db/doc/collection/correction_tasks)
- ✅ 应该能看到刚才提交的任务记录
- ✅ **记录应该保留至少24小时**（之前是1小时就被删除）

---

#### 2.4 超时保护测试

**步骤**:
1. 提交一个任务
2. 故意让任务处理失败（例如关闭网络）
3. 等待10分钟

**预期结果**:
- ✅ 10分钟后前端显示超时错误：`处理超时（10分钟）- 任务可能过于复杂`
- ✅ 轮询停止，不再继续请求

---

### 3. ✅ 错误处理测试

#### 3.1 数据库写入失败测试

**步骤**:
1. 暂时关闭CloudBase数据库（或在控制台暂停服务）
2. 尝试提交任务

**预期结果**:
- ✅ 前端立即收到错误响应（HTTP 500）
- ✅ 错误信息明确：`Failed to initialize task`
- ✅ 不会出现静默失败

#### 3.2 后台处理错误测试

**步骤**:
1. 上传一张无法识别的图片（例如纯黑色图片）
2. 提交任务

**预期结果**:
- ✅ 任务状态更新为 `error`
- ✅ 错误信息记录在任务记录中
- ✅ 前端能正确显示错误

---

### 4. ✅ 性能测试

#### 4.1 并发处理测试

**步骤**:
1. 同时添加3个学生（每人2张图片）
2. 点击"开始批改"

**观察要点**:
- ✅ 3个任务同时提交（并发）
- ✅ 每个任务独立轮询状态
- ✅ 所有任务应在5分钟内完成（单个2分钟 × 3 = 6分钟，但有并发加速）

#### 4.2 大文件处理测试

**步骤**:
1. 上传高分辨率图片（例如4000×3000像素）
2. 提交任务

**预期结果**:
- ✅ 图片成功上传（不超过30MB限制）
- ✅ 后端成功下载和处理
- ✅ 不应该因为文件太大而失败

---

### 5. ✅ 长期稳定性测试

#### 5.1 24小时数据保留测试

**步骤**:
1. 提交一个任务并记录 taskId
2. **24小时后**再次访问 `/api/task/:id`

**预期结果**:
- ✅ **24小时内**: 任务记录仍然存在
- ✅ **24小时后**: 任务记录被自动清理（404错误）

#### 5.2 连续批改测试

**步骤**:
1. 连续提交10个任务
2. 观察系统稳定性

**观察要点**:
- ✅ 所有任务都能正常完成
- ✅ 数据库没有积压
- ✅ 云存储文件正确清理（处理完后删除）

---

## 🔧 调试工具

### 1. 浏览器开发者工具

**Network 标签页**:
- 查看 `/api/upload` 请求（图片上传）
- 查看 `/api/correct` 请求（任务提交）
- 查看 `/api/task/:id` 请求（状态轮询）

**Console 标签页**:
- 查看前端日志
- 查看错误信息

### 2. CloudBase控制台

**数据库**: 
- [correction_tasks 集合](https://tcb.cloud.tencent.com/dev?envId=cloud1-0gh78mpy39eccc0f#/db/doc/collection/correction_tasks)
- 查看任务记录、日志、结果

**云托管日志**:
- [CloudRun 日志查询](https://tcb.cloud.tencent.com/dev?envId=cloud1-0gh78mpy39eccc0f#/devops/log)
- 查看后端服务器日志

**云存储**:
- [云存储管理](https://tcb.cloud.tencent.com/dev?envId=cloud1-0gh78mpy39eccc0f#/storage)
- 确认文件上传和删除

---

## 📊 测试结果记录

### 测试日期: ____________

| 测试项 | 结果 | 备注 |
|--------|------|------|
| 主页访问 | ☐ 通过 ☐ 失败 | |
| 数据库健康检查 | ☐ 通过 ☐ 失败 | |
| 图片上传 | ☐ 通过 ☐ 失败 | |
| 异步处理 | ☐ 通过 ☐ 失败 | |
| 数据库持久化 | ☐ 通过 ☐ 失败 | |
| 超时保护（10分钟） | ☐ 通过 ☐ 失败 | |
| 错误处理 | ☐ 通过 ☐ 失败 | |
| 并发处理 | ☐ 通过 ☐ 失败 | |
| 24小时数据保留 | ☐ 通过 ☐ 失败 | |

---

## ❗ 常见问题排查

### Q1: 前端显示"无法连接到服务器"
**检查**:
- CloudRun服务是否正常运行？
- 网络连接是否正常？
- CORS配置是否正确？

### Q2: 任务提交后一直pending
**检查**:
- 后端日志是否有错误？
- 数据库连接是否正常？
- Python/OCR服务是否正常？

### Q3: 数据库仍然是空的
**检查**:
- 是否在任务完成后立即查看（需要等待完成）
- 是否超过24小时（会被自动清理）
- 数据库写入是否成功（查看服务器日志）

### Q4: 504超时错误仍然出现
**检查**:
- CloudRun服务超时配置（建议120秒）
- 单个任务是否确实超过10分钟？
- 图片数量是否过多（超过3张）？

---

## 🎯 测试建议

1. **先进行基础测试**，确保服务能正常访问
2. **然后测试核心功能**，验证修复效果
3. **最后进行压力测试**，确保系统稳定
4. **记录所有问题**，便于后续优化

---

**祝测试顺利！** 🚀

如有任何问题，请查看：
- `FIX_SUMMARY.md` - 修复详情
- CloudBase控制台 - 日志和监控
- 浏览器开发者工具 - 网络和控制台日志
