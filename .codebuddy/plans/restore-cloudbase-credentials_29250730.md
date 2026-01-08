---
name: restore-cloudbase-credentials
overview: 恢复CloudRun环境变量中的CloudBase访问密钥（TCB_SECRET_ID和TCB_SECRET_KEY），修复上传功能
todos:
  - id: configure-env-vars
    content: 使用[integration:tcb]在CloudRun中配置TCB_SECRET_ID和TCB_SECRET_KEY环境变量
    status: completed
  - id: restart-service
    content: 重启CloudRun服务以加载新的环境变量配置
    status: completed
    dependencies:
      - configure-env-vars
  - id: test-upload
    content: 测试上传功能验证CloudBase连接是否恢复
    status: completed
    dependencies:
      - restart-service
  - id: document-config
    content: 在项目文档中记录环境变量配置方法，防止未来丢失
    status: completed
    dependencies:
      - test-upload
---

## 产品概述

恢复CloudRun环境中的CloudBase访问凭证配置，修复因密钥丢失导致的上传功能故障。

## 核心功能

- 在CloudRun环境变量中重新配置TCB_SECRET_ID和TCB_SECRET_KEY
- 验证CloudBase连接和上传功能是否恢复正常
- 确保配置持久化，避免未来重新部署时丢失

## 技术方案

### 问题分析

CloudRun环境变量在重新部署过程中未被持久化保存，导致TCB_SECRET_ID和TCB_SECRET_KEY丢失，影响CloudBase集成的上传功能。

### 解决方案

#### 环境变量配置恢复

通过CloudBase Integration (tcb) 重新配置环境变量：

- 在CloudRun控制台或配置文件中添加TCB_SECRET_ID
- 在CloudRun控制台或配置文件中添加TCB_SECRET_KEY
- 触发服务重启以加载新配置

#### 持久化策略

为防止未来部署时丢失配置，采用以下方案：

- 将环境变量配置写入项目配置文件（如cloudbaserc.json或.env文件）
- 在CI/CD流程中自动注入环境变量
- 在部署文档中记录必需的环境变量配置清单

### 验证流程

```mermaid
flowchart TD
    A[配置环境变量] --> B[重启CloudRun服务]
    B --> C[测试上传功能]
    C --> D{上传成功?}
    D -->|是| E[记录配置方法]
    D -->|否| F[检查密钥有效性]
    F --> A
```

### 技术实现步骤

1. 使用tcb integration访问CloudBase控制台
2. 在CloudRun环境配置中添加TCB_SECRET_ID和TCB_SECRET_KEY
3. 重启CloudRun服务使配置生效
4. 执行上传测试验证功能恢复
5. 将环境变量配置写入项目文档或配置文件

## Agent Extensions

### Integration

- **tcb**
- 用途：访问CloudBase控制台，配置CloudRun环境变量
- 预期结果：成功添加TCB_SECRET_ID和TCB_SECRET_KEY到CloudRun环境配置中