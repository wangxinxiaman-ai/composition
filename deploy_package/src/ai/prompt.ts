export function buildPrompt({ gradeLevel, genre, studentName, title, standardStr }: {
  gradeLevel: string; genre: string; studentName: string; title: string; standardStr: string;
}) {
  const system = `你是资深中文作文批改专家。严格遵守输出格式，仅返回 JSON。先精准转写所有图片中的原文（去除页码/涂改噪声），再按五维度评分与原因，给出综合评价与修改建议。`;
  const user = `学段：${gradeLevel}\n文体：${genre}\n学生：${studentName}\n题目：${title}\n批改标准：\n${standardStr}\n请严格按以下 JSON 输出：\n{\n  "totalScore": 数值,\n  "dimensions": [ { "name": 字符串, "score": 数值, "reason": 字符串 } ],\n  "overallComment": 字符串,\n  "suggestions": [ 字符串 ],\n  "recognizedText": 字符串,\n  "schemaVersion": "1.0.0"\n}`;
  return { system, user };
}

