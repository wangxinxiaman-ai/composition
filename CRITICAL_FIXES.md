# 🚨 关键问题诊断报告

**诊断时间**: 2026-01-07 22:39  
**问题症状**: 图片上传到CloudBase存储时超时

---

## 问题根源

### ❌ CloudBase SDK 上传性能问题

在CloudRun容器环境中，`tcbApp.uploadFile()` 存在严重性能问题：

```javascript
// 问题代码位置: server.js 第785行
const uploadRes = await tcbApp.uploadFile({
    cloudPath: cloudPath,
    fileContent: req.file.buffer
});
```

**症状**:
- 上传1.5MB图片需要30秒以上
- 前端轮询一直显示 `pending` 状态
- 后台日志无错误，但就是不完成

---

## 已完成的临时修复

### ✅ 添加超时保护（已部署）

```javascript
// 修复后代码: server.js 第779-815行
const uploadRes = await Promise.race([
    tcbApp.uploadFile({...}),
    new Promise((_, reject) => 
        setTimeout(() => reject(new Error('CloudBase upload timeout after 30s')), 30000)
    )
]);
```

**效果**: 防止永久卡死，30秒后返回错误

---

## 🔧 根本解决方案

### 方案1: 改用 COS SDK 直传（推荐）

CloudBase存储底层是腾讯云COS，直接用COS SDK会更快：

```javascript
const COS = require('cos-nodejs-sdk-v5');
const cos = new COS({
    SecretId: process.env.COS_SECRET_ID,
    SecretKey: process.env.COS_SECRET_KEY
});

cos.putObject({
    Bucket: '636c-cloud1-0gh78mpy39eccc0f-1376977951',
    Region: 'ap-shanghai',
    Key: cloudPath,
    Body: buffer
}, (err, data) => { ... });
```

**优点**: 
- 直接走COS API，性能稳定
- 支持分片上传大文件
- 不依赖CloudBase SDK

**缺点**: 需要额外配置COS密钥

---

### 方案2: 前端直接上传到COS（最优）

让前端获取临时上传凭证，直接传到COS：

1. 后端提供接口生成临时签名
2. 前端用签名直接传COS
3. 上传完成后调用后端保存fileID

**优点**: 
- 完全不经过后端，最快
- 减轻服务器负担
- 支持断点续传

---

### 方案3: 保留现有方案，增加文件大小限制

```javascript
upload.single('file'), async (req, res) => {
    if (req.file.size > 500 * 1024) { // 限制500KB
        return res.status(413).json({ 
            error: '文件过大，请压缩后上传' 
        });
    }
    // ... 现有逻辑
}
```

**优点**: 简单快速
**缺点**: 限制了用户体验

---

## 推荐行动计划

1. **立即**: 保留现有30秒超时保护（已完成）
2. **短期（1小时）**: 实施方案3，限制文件大小
3. **中期（1天）**: 实施方案1，改用COS SDK
4. **长期（1周）**: 实施方案2，前端直传

---

## 测试状态

| 测试项 | 状态 | 说明 |
|--------|------|------|
| 服务可达性 | ✅ | HTTPS访问正常 |
| 数据库读写 | ✅ | 历史数据存在 |
| **CloudBase上传** | ❌ | **30秒超时** |
| OCR处理 | ⏳ | 未测试（因上传失败） |
| AI批改 | ⏳ | 未测试（因上传失败） |

---

## 紧急建议

**用户当前无法使用系统！** 建议立即：

1. 添加文件大小限制（500KB以内）
2. 在前端提示用户压缩图片
3. 或者改用COS SDK（需1小时开发时间）

**请决定采用哪个方案？**
