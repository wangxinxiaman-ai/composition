# 最终方案确认 (已复核)

经过仔细检查，我完善了前端路径的处理逻辑，确保在 `Composition` 子目录下也能正常运行。

## 1. 后端 (Cloud Run)
*   **构建策略**：使用 `node:18` 镜像，额外安装 `python3`, `pip` 及 OpenCV 依赖库 (`libgl1`, `libglib2.0`)。
*   **依赖管理**：`requirements.txt` 指定 `opencv-python-headless` (无 GUI 版本，更轻量稳定)。
*   **安全**：`.dockerignore` 严格排除敏感文件。

## 2. 前端 (静态托管 - Composition 目录)
*   **关键修正 1 (API 地址)**：增加 `API_BASE_URL` 变量，用于指向云托管域名。
*   **关键修正 2 (跳转路径)**：
    *   原代码：`window.open('/templates/correction-template.html'...)` (绝对路径，会跳出 `Composition` 目录)。
    *   **修改后**：`window.open('correction-template.html'...)` (相对路径，确保在当前目录下跳转)。

## 执行清单
1.  生成 `Dockerfile`。
2.  生成 `requirements.txt`。
3.  生成 `.dockerignore`。
4.  修改 `templates/home.html` (API 地址 + 跳转路径)。

方案已确认无误，立即执行？