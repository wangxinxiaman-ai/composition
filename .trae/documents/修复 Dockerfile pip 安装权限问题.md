# 解决构建失败：Python 环境限制

您遇到的错误 `externally-managed-environment` 是因为较新的 Debian/Ubuntu 系统（Node 18 镜像基于 Debian 12）引入了 **PEP 668** 保护机制，防止 `pip` 直接修改系统 Python 环境。

**解决方案**：
在 `pip install` 命令中添加 `--break-system-packages` 参数，强制允许安装。这在容器环境中是安全的做法，因为容器本身就是隔离的。

## 修复步骤

1.  **修改 `Dockerfile`**：
    *   将 `RUN pip3 install --no-cache-dir -r requirements.txt`
    *   修改为 `RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt`

我将立即为您更新 `Dockerfile`。修改后，您只需重新点击“重新构建”或再次上传部署即可。