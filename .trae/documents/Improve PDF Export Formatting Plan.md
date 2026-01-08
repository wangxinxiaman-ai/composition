# 优化 PDF 导出格式

## 1. 强制打印背景色
*   **CSS 修改**: 在 `correction-template.html` 的 `@media print` 样式块中，为 `body` 或关键元素（如 `.dim-item`, `.overall`, `.mark-wrong` 等）添加 `-webkit-print-color-adjust: exact;` 和 `print-color-adjust: exact;` 属性。
*   **目的**: 确保导出 PDF 时，维度评分框的淡色背景、综合评价的背景色以及错别字/好句子的标记颜色能被正确保留，而不是显示为白色。

## 2. 修正雷达图居中问题
*   **容器调整**: 检查 `.chart` 容器在打印模式下的宽度设置。确保其宽度为 100% 或固定宽度，并使用 `margin: 0 auto` 居中。
*   **Canvas 渲染**: 雷达图是基于 Canvas 绘制的。虽然打印时使用的是当前屏幕渲染的 Canvas，但通过 CSS 确保其容器在打印布局中水平居中，通常能解决视觉上的偏移问题。

## 3. 优化打印布局
*   **去除多余边距**: 在 `@media print` 中检查 `.page` 的 `max-width` 和 `margin` 设置，确保利用完整的 A4 纸张宽度，避免内容偏左或偏右。
*   **隐藏无关元素**: 确认“打印”和“下载”按钮在打印模式下已隐藏（现有代码已包含，再次确认）。

## 执行步骤
1.  修改 `templates/correction-template.html` 文件。
2.  更新 `@media print` 样式，加入背景色强制打印属性。
3.  调整雷达图容器样式，确保其在打印流中居中。
