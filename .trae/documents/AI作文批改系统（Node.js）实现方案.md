# 总览

* 目标：构建一个面向教师/家长/学生的 AI 作文批改系统，支持多图上传、豆包多模态批改、结构化结果入库；前端始终以数据库内容渲染漂亮的批改结果模板，并支持 PDF/HTML 导出与检索管理。

* 架构：前端 Next.js + Ant Design + ECharts；后端 NestJS + Prisma + BullMQ；本地数据库用 SQLite（零安装），生产用 PostgreSQL；对象存储本地 MinIO、生产腾讯云 COS；AI Provider 使用豆包，可在开发期切换到 mock。

## 技术选型

* 前端：Next.js（SSR 保证打印样式）、Ant Design、ECharts、TanStack Query

* 后端：NestJS（模块化/DI/管道/守卫/拦截器）、Prisma ORM、BullMQ（Redis 队列）

* 数据库：SQLite（开发期）→ PostgreSQL（生产）

* 存储：MinIO（开发）→ COS（生产）

* AI：豆包多模态；环境变量 `AI_PROVIDER=mock|doubao`，`DOUBAO_API_KEY`，`DOUBAO_MODEL=doubao-seed-1-6-thinking-250715`

## 数据模型（Prisma）

```prisma
model User {
  id           String  @id @default(uuid())
  role         Role
  name         String
  email        String  @unique
  passwordHash String
  createdAt    DateTime @default(now())
  records      WritingRecord[]
}

model WritingRecord {
  id                String   @id @default(uuid())
  ownerUserId       String
  owner             User     @relation(fields: [ownerUserId], references: [id])
  studentName       String
  title             String
  genre             String
  gradeLevel        String
  recognizedText    String
  aiResultJson      Json
  totalScore        Int
  status            RecordStatus
  templateVersion   String
  schemaVersion     String
  createdAt         DateTime @default(now())
  images            WritingRecordImage[]

  @@index([studentName])
  @@index([title])
  @@index([ownerUserId])
}

model WritingRecordImage {
  id            String @id @default(uuid())
  recordId      String
  record        WritingRecord @relation(fields: [recordId], references: [id])
  url           String
  createdAt     DateTime @default(now())
}

enum Role { teacher parent student }

enum RecordStatus { pending processing done failed }
```

## 接口设计

* `POST /auth/login`、`POST /auth/register`

* `POST /records`：创建记录（学段、文体、姓名、题目、图片\[]）

* `GET /records`：查询记录（姓名/题目、分页、角色过滤）

* `GET /records/:id`：记录详情

* `POST /records/:id/export`：导出 PDF/HTML 并返回下载链接

* `GET /files/:key`：签名 URL 获取文件（鉴权）

## 提示词配置（6个变量与映射）

* 文件：`src/config/evaluation-standards.ts`

```ts
export const PRIMARY_NARRATIVE = `小学记叙文（含散文、日记）
内容立意
核心标准1：主题与题目匹配度（AI 对比作文内容与题目关键词，如“春游”需含“春天”“出行”相关表述）
核心标准2：核心事件清晰度（是否有“谁做了什么事”的明确表述）
评分1分：跑题，无明确事件
评分3分：扣题，能说清事件
评分5分：扣题，事件有核心亮点（如“帮助他人”“克服困难”）

结构框架
核心标准1：段落数量（至少3段，含开头、中间、结尾）
核心标准2：过渡词使用（是否含“首先/然后/最后”“因为/所以”等基础衔接词）
评分1分：1-2段，无逻辑
评分3分：3段，有简单过渡
评分5分：3-4段，过渡自然，主次分明（中间段详写事件）

素材运用
核心标准1：素材真实性（是否为生活常见场景，如“家庭/学校/游玩”，AI 排除“虚构且脱离生活”内容）
核心标准2：细节数量（是否含1个以上动作/环境描写，如“妈妈擦汗”“树叶变黄”）
评分1分：无具体素材，泛泛而谈
评分3分：有生活素材，能简单描述
评分5分：素材具体，含2个以上细节描写

语言表达
核心标准1：病句率（AI 检测“搭配不当/成分残缺”等病句，每100字不超过3句）
核心标准2：修辞使用（是否含“像/好像”“把/被”等简单修辞）
评分1分：病句多（每100字≥5句），无修辞
评分3分：病句少（每100字≤3句），有1处简单修辞
评分5分：无病句，有2处以上合适修辞

情感表达
核心标准1：情感词出现率（是否含“开心/难过/感动”等直接情感词）
核心标准2：情感与事件匹配度（如“获奖”对应“开心”，AI 排除“事件与情感矛盾”）
评分1分：无情感表述
评分3分：有情感词，与事件匹配
评分5分：情感词+简单原因（如“获奖开心，因为努力没白费”）

规范书写
核心标准1：错别字率（每100字不超过2个）
核心标准2：格式正确性（标题居中、段落首行缩进2字符、标点使用正确）
评分1分：错别字多（每100字≥5个），格式混乱
评分3分：错别字少（每100字≤3个），格式基本正确
评分5分：无错别字，格式完全规范`;

export const PRIMARY_EXPOSITORY = `小学说明文（简单事物说明，如“我的文具”“家乡的水果”）
内容立意
核心标准1：说明对象明确度（开头是否直接点出“说明什么”，如“我要介绍我的铅笔盒”）
核心标准2：信息完整性（是否含“外形/用途”2个以上说明点）
评分1分：无明确对象，信息混乱
评分3分：对象明确，含1-2个说明点
评分5分：对象明确，含3个以上说明点（如外形+用途+使用习惯）

结构框架
核心标准1：说明顺序（是否按“整体→部分”“用途→用法”等简单顺序，AI 检测关键词逻辑）
核心标准2：段落分工（是否1段1个说明点，无交叉混乱）
评分1分：顺序混乱，段落交叉
评分3分：有简单顺序，段落基本分工
评分5分：顺序清晰，段落分工明确（如1段外形、1段用途）

素材运用
核心标准1：信息准确性（AI 比对常识，如“苹果是红色/圆形”，排除“苹果是蓝色”等错误信息）
核心标准2：说明方法（是否含“打比方”“列数字”，如“铅笔盒像小房子”“长15厘米”）
评分1分：信息错误，无说明方法
评分3分：信息正确，有1种说明方法
评分5分：信息准确，有2种以上说明方法

语言表达
核心标准1：简洁性（AI 排除“无关抒情”，如说明“钢笔”不出现“钢笔陪我度过快乐时光”）
核心标准2：准确性（是否用“大约/大概”等模糊词，关键信息无模糊表述）
评分1分：冗余抒情多，关键信息模糊
评分3分：少抒情，关键信息基本准确
评分5分：无抒情，语言简洁，关键信息精准

情感表达
核心标准1：（弱化要求）仅判断“无负面/错误情感”（如说明“青蛙”不出现“我讨厌青蛙”）
评分1分：含负面/错误情感
评分3-5分：无额外情感或仅含“喜欢”等简单正面情感

规范书写
核心标准1：错别字率（每100字不超过2个）
核心标准2：格式正确性（标题居中、段落首行缩进2字符、标点使用正确）
评分1分：错别字多（每100字≥5个），格式混乱
评分3分：错别字少（每100字≤3个），格式基本正确
评分5分：无错别字，格式完全规范`;

export const PRIMARY_ARGUMENTATIVE = `小学议论文（简单观点议论，如“要讲诚信”“坚持很重要”）
内容立意
核心标准1：观点明确度（开头是否直接提出观点，如“我认为做人要讲诚信”）
核心标准2：观点正面性（AI 排除“撒谎好”“偷懒对”等错误观点）
评分1分：无观点或观点错误
评分3分：观点明确、正面
评分5分：观点明确，加简单理由（如“讲诚信，别人才会信任你”）

结构框架
核心标准1：论证结构（是否含“提观点→举例子→总结”3部分）
核心标准2：总结句（结尾是否呼应开头观点）
评分1分：结构残缺（无例子/无总结）
评分3分：有3部分，总结简单
评分5分：结构完整，总结呼应观点

素材运用
核心标准1：案例相关性（案例是否匹配观点，如“讲诚信”对应“借东西归还”）
核心标准2：案例真实性（是否为生活/课本常见案例，AI 排除虚构且离谱案例）
评分1分：案例无关
评分3分：案例相关，简单描述
评分5分：案例相关，描述具体（如“我借同学橡皮，按时还了，他后来也借我尺子”）

语言表达
核心标准1：论证语言（是否含“因为/所以”“这样做能”等论证关联词）
核心标准2：无口语化（AI 排除“我觉得吧”“反正就是”等随意表述）
评分1分：无论证词，口语多
评分3分：有1-2个论证词，少口语
评分5分：有3个以上论证词，语言正式

情感表达
核心标准1：（弱化要求）仅判断“情感与观点一致”（如观点“坚持好”，不出现“坚持太累了，不想做”）
评分1分：情感与观点矛盾
评分3-5分：情感与观点一致或无额外情感

规范书写
核心标准1：错别字率（每100字不超过2个）
核心标准2：格式正确性（标题居中、段落首行缩进2字符、标点使用正确）
评分1分：错别字多（每100字≥5个），格式混乱
评分3分：错别字少（每100字≤3个），格式基本正确
评分5分：无错别字，格式完全规范`;

export const MIDDLE_NARRATIVE = `初中记叙文（含叙事散文）
内容立意
核心标准1：主题深度（是否从事件提炼“成长/亲情/责任”等深层主题，AI 检测主题关键词）
核心标准2：主题唯一性（无“多主题混乱”，如“写亲情”不夹杂“环保”）
评分1分：主题肤浅，多主题混乱
评分3分：主题明确，有浅层提炼
评分5分：主题深刻，贯穿全文

结构框架
核心标准1：情节设计（是否有“铺垫/转折”，如“考前紧张→朋友鼓励→考后感谢”）
核心标准2：过渡自然度（AI 检测“然而/后来/回想起来”等进阶过渡词，排除生硬衔接）
评分1分：无情节设计，过渡生硬
评分3分：有简单转折，过渡基本自然
评分5分：情节有层次，过渡流畅

素材运用
核心标准1：素材独特性（AI 排除“扶老人过马路”等过度陈旧素材，优先“个人独特经历”）
核心标准2：素材挖掘（是否从素材提炼意义，如“妈妈煮的粥→体现母爱细节”）
评分1分：素材陈旧，无挖掘
评分3分：素材较新颖，有简单挖掘
评分5分：素材独特，挖掘深入（如“粥里的枸杞→妈妈记得我爱吃”）

语言表达
核心标准1：句式多样性（AI 检测“长短句结合”，避免“全短句/全长句”）
核心标准2：修辞精准度（修辞与语境匹配，如“月光像流水”而非“月光像面包”）
评分1分：句式单一，修辞不当
评分3分：有长短句，修辞基本合适
评分5分：句式灵活，修辞生动贴切

情感表达
核心标准1：情感间接性（AI 检测“通过细节传情感”，如“妈妈揉肩→体现关爱”，排除直白抒情）
核心标准2：情感层次（是否有“开心→感动→珍惜”等情感变化）
评分1分：直白抒情，无层次
评分3分：有细节传情，情感单一
评分5分：细节丰富，情感有层次

规范书写
核心标准1：错别字率（每100字≤1个）
核心标准2：标点复杂度（引号/破折号/省略号使用正确，AI 检测标点搭配错误）
评分1分：错别字多（每100字≥3个），标点错误多
评分3分：错别字少，标点基本正确
评分5分：无错别字，标点完全规范`;

export const MIDDLE_EXPOSITORY = `初中说明文（复杂事物/事理说明，如“智能手机的功能”“雨的形成”）
内容立意
核心标准1：说明重点（是否明确“核心说明点”，如“智能手机”重点讲“智能交互”而非“外形”）
核心标准2：信息权威性（AI 比对权威资料，排除“智能手机能治病”等错误信息）
评分1分：无重点，信息错误
评分3分：重点明确，信息基本正确
评分5分：重点突出，信息权威（如引用“手机系统版本”“科学原理”）

结构框架
核心标准1：说明逻辑（是否用“总分总”“从现象到本质”等进阶顺序，AI 检测逻辑关键词）
核心标准2：分类说明（复杂事物是否“分类别”，如“手机功能分通讯/娱乐/办公”）
评分1分：逻辑混乱，无分类
评分3分：逻辑清晰，简单分类
评分5分：逻辑严谨，分类合理（每类有子要点）

素材运用
核心标准1：说明方法多样性（是否含“列数字/作比较/举例子/下定义”3种以上）
核心标准2：数据准确性（AI 检测“数据是否合理”，如“手机重量150克”而非“1500克”）
评分1分：说明方法≤1种，数据错误
评分3分：说明方法2种，数据基本合理
评分5分：说明方法≥3种，数据精准

语言表达
核心标准1：专业术语使用（是否用学科术语，如“智能手机的触摸屏是电容屏”）
核心标准2：无歧义（避免“这个功能很好用”等模糊表述，改为“这个功能能快速识别语音”）
评分1分：无术语，歧义多
评分3分：有1-2个术语，少歧义
评分5分：术语准确，语言严谨无歧义

情感表达
核心标准1：（无要求）仅判断“不影响说明”（可含“该功能很实用”等客观评价，排除主观抒情）
评分1-3分：含主观抒情
评分4-5分：无抒情或仅客观评价

规范书写
核心标准1：错别字率（每100字≤1个）
核心标准2：标点复杂度（引号/破折号/省略号使用正确，AI 检测标点搭配错误）
评分1分：错别字多（每100字≥3个），标点错误多
评分3分：错别字少，标点基本正确
评分5分：无错别字，标点完全规范`;

export const MIDDLE_ARGUMENTATIVE = `初中议论文（完整观点论证，如“奋斗是青春的底色”“环保需从细节做起”）
内容立意
核心标准1：观点深刻性（是否有“辩证思考”，如“奋斗需结合方向，而非盲目努力”）
核心标准2：观点针对性（是否结合“学生生活/社会现象”，避免空洞）
评分1分：观点肤浅，无针对性
评分3分：观点明确，有一定针对性
评分5分：观点深刻，结合实际有辩证思考

结构框架
核心标准1：论证层次（是否含“提观点→分论点→总结”，分论点≥2个）
核心标准2：分论点逻辑（分论点是否“不重复/不矛盾”，如“奋斗需坚持→奋斗需方法”）
评分1分：无分论点，结构残缺
评分3分：有分论点（1-2个），逻辑基本清晰
评分5分：分论点≥2个，逻辑严谨（递进/并列关系）

素材运用
核心标准1：案例多样性（是否含“历史案例/名人案例/社会案例”2种以上）
核心标准2：案例分析（是否有“案例→观点”的分析句，如“袁隆平研究杂交水稻→体现奋斗的坚持”）
评分1分：案例单一，无分析
评分3分：案例2种，简单分析
评分5分：案例多样，分析深入（结合案例细节论证观点）

语言表达
核心标准1：论证力度（是否含“由此可见”“综上所述”等总结词，“假如/如果”等假设论证词）
核心标准2：语言正式度（AI 排除“我觉得”“大概吧”等口语，使用“笔者认为”“显然”等书面语）
评分1分：论证词少，口语多
评分3分：有论证词，少口语
评分5分：论证词丰富，语言正式严谨

情感表达
核心标准1：情感共鸣（是否含“青年应”“我们需”等呼吁性语句，引发读者认同）
核心标准2：情感克制（避免“我太感动了”等直白抒情，用“令人敬佩”等客观评价）
评分1分：无共鸣，直白抒情
评分3分：有简单呼吁，少抒情
评分5分：呼吁有力，情感克制且共鸣强

规范书写
核心标准1：错别字率（每100字≤1个）
核心标准2：标点复杂度（引号/破折号/省略号使用正确，AI 检测标点搭配错误）
评分1分：错别字多（每100字≥3个），标点错误多
评分3分：错别字少，标点基本正确
评分5分：无错别字，标点完全规范`;

export const STANDARDS_MAP = {
  '小学记叙文（含散文、日记）': PRIMARY_NARRATIVE,
  '小学说明文（简单事物说明，如 “我的文具”“家乡的水果”）': PRIMARY_EXPOSITORY,
  '小学议论文（简单观点议论，如 “要讲诚信”“坚持很重要”）': PRIMARY_ARGUMENTATIVE,
  '初中记叙文（含叙事散文）': MIDDLE_NARRATIVE,
  '初中说明文（复杂事物 / 事理说明，如 “智能手机的功能”“雨的形成”）': MIDDLE_EXPOSITORY,
  '初中议论文（完整观点论证，如 “奋斗是青春的底色”“环保需从细节做起”）': MIDDLE_ARGUMENTATIVE,
};
```

## 提示词拼接函数

* 文件：`src/ai/prompt.ts`

```ts
export function buildPrompt({ gradeLevel, genre, studentName, title, standardStr }: {
  gradeLevel: string; genre: string; studentName: string; title: string; standardStr: string;
}) {
  const system = `你是资深中文作文批改专家。严格遵守输出格式，仅返回 JSON。先精准转写所有图片中的原文（去除页码/涂改噪声），再按六维度评分与原因，给出综合评价与修改建议。`;
  const user = `学段：${gradeLevel}\n文体：${genre}\n学生：${studentName}\n题目：${title}\n批改标准：\n${standardStr}\n请严格按以下 JSON 输出：\n{\n  "totalScore": 数值,\n  "dimensions": [ { "name": 字符串, "score": 数值, "reason": 字符串 } ],\n  "overallComment": 字符串,\n  "suggestions": [ 字符串 ],\n  "recognizedText": 字符串,\n  "schemaVersion": "1.0.0"\n}`;
  return { system, user };
}
```

## HTML 批改结果模板（初版）

* 文件：`templates/correction-template.html`

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>作文批改结果</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <style>
    :root { --bg:#f7f8fa; --card:#ffffff; --text:#1f2d3d; --muted:#6b7280; --accent:#4f46e5; --accent-2:#14b8a6; --border:#e5e7eb; --good:#10b981; --warn:#f59e0b; }
    html,body { background: var(--bg); color: var(--text); font-family: 'Noto Sans SC', system-ui, -apple-system, 'Segoe UI', Roboto; }
    .page { max-width: 1080px; margin: 24px auto; padding: 0 16px; }
    .header { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color:#fff; border-radius: 16px; padding: 24px; box-shadow: 0 8px 24px rgba(79,70,229,.2); }
    .title { font-size: 28px; font-weight: 700; letter-spacing: .5px; }
    .meta { margin-top: 8px; display:flex; gap:16px; flex-wrap:wrap; }
    .meta-item { background: rgba(255,255,255,.15); padding: 6px 10px; border-radius: 999px; font-size: 13px; }
    .actions { display:flex; gap:10px; margin-top: 14px; }
    .btn { appearance:none; border:1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.15); color:#fff; border-radius: 999px; padding:10px 14px; font-size:14px; cursor:pointer; }
    .btn:hover { background: rgba(255,255,255,.25); }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
    .card { background: var(--card); border-radius: 16px; box-shadow: 0 6px 18px rgba(0,0,0,.06); border:1px solid var(--border); }
    .card h3 { margin: 0; padding: 16px 20px; font-size: 18px; border-bottom:1px solid var(--border); }
    .card-body { padding: 18px 20px; }
    .orig { line-height: 1.85; font-size: 16px; white-space: pre-wrap; font-family: 'Noto Serif SC', serif; }
    .score { display:flex; align-items:center; gap:12px; }
    .score-number { font-size: 40px; font-weight: 700; color: #fff; background: var(--accent); border-radius: 12px; padding: 8px 14px; }
    .score-badge { font-size: 13px; color: var(--muted); }
    .chart { width: 100%; height: 340px; }
    .dims { display:grid; grid-template-columns: 1fr; gap: 12px; margin-top: 14px; }
    .dim-item { border:1px dashed var(--border); border-radius: 12px; padding: 12px; }
    .dim-hd { display:flex; justify-content: space-between; font-weight: 600; }
    .dim-score { color: var(--good); }
    .dim-reason { margin-top: 6px; color: var(--muted); line-height: 1.75; }
    .section { margin-top: 16px; }
    .section h4 { margin: 0 0 8px; font-size: 16px; }
    .overall { background:#fafafa; border:1px solid var(--border); border-radius: 12px; padding: 12px; }
    .suggest { display:grid; gap:8px; }
    .suggest li { background:#f2f6ff; border:1px solid #e6ecff; padding:10px 12px; border-radius: 10px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    @media print { body { background: #fff; } .page { max-width: unset; margin: 0; padding: 0; } .header { border-radius: 0; } .card { box-shadow: none; border-radius: 0; } .actions { display: none; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="title">{{title}}</div>
      <div class="meta">
        <div class="meta-item">文体：{{genre}}</div>
        <div class="meta-item">学生：{{studentName}}</div>
        <div class="meta-item">时间：{{createdAt}}</div>
      </div>
      <div class="actions">
        <button class="btn" onclick="window.print()">打印/导出PDF</button>
        <button class="btn" onclick="downloadHTML()">下载HTML</button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>作文原文</h3>
        <div class="card-body">
          <div class="orig">{{recognizedText}}</div>
        </div>
      </div>

      <div class="card">
        <h3>批改结果</h3>
        <div class="card-body">
          <div class="score"><div class="score-number">{{totalScore}}</div><div class="score-badge">总分</div></div>
          <div id="radar" class="chart"></div>
          <div class="dims" id="dims"></div>
          <div class="section">
            <h4>综合评价</h4>
            <div class="overall">{{overallComment}}</div>
          </div>
          <div class="section">
            <h4>修改建议</h4>
            <ul class="suggest" id="suggest"></ul>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const DATA = window.DATA || { title: '{{title}}', genre: '{{genre}}', studentName: '{{studentName}}', createdAt: '{{createdAt}}', recognizedText: '{{recognizedText}}', totalScore: {{totalScore}}, dimensions: {{dimensions}}, overallComment: '{{overallComment}}', suggestions: {{suggestions}} };
    function downloadHTML(){ const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${DATA.studentName}-${DATA.title}.html`; a.click(); }
    function fillDims(){ const container = document.getElementById('dims'); container.innerHTML = ''; DATA.dimensions.forEach(d => { const item = document.createElement('div'); item.className='dim-item'; const hd = document.createElement('div'); hd.className='dim-hd'; const left = document.createElement('span'); left.textContent = d.name; const right = document.createElement('span'); right.className='dim-score'; right.textContent = d.score; hd.appendChild(left); hd.appendChild(right); const reason = document.createElement('div'); reason.className='dim-reason'; reason.textContent = d.reason; item.appendChild(hd); item.appendChild(reason); container.appendChild(item); }); }
    function fillSuggest(){ const ul = document.getElementById('suggest'); ul.innerHTML=''; DATA.suggestions.forEach(s => { const li=document.createElement('li'); li.textContent=s; ul.appendChild(li); }); }
    function renderRadar(){ const dom = document.getElementById('radar'); const chart = echarts.init(dom); const maxScore = Math.max(5, ...DATA.dimensions.map(d => d.score)); const indicators = DATA.dimensions.map(d => ({ name: d.name, max: maxScore })); const values = DATA.dimensions.map(d => d.score); chart.setOption({ tooltip: {}, radar: { indicator: indicators, splitNumber: 5, axisName: { color: '#374151' }, splitLine: { lineStyle: { color: ['#e5e7eb'] } }, splitArea: { areaStyle: { color: ['#fafafa','#fff'] } } }, series: [{ type: 'radar', data: [{ value: values, areaStyle: { color: 'rgba(79,70,229,.25)' }, lineStyle: { color: '#4f46e5', width: 2 }, symbol: 'circle', symbolSize: 4 }] }] }); }
    fillDims(); fillSuggest(); renderRadar();
  </script>
</body>
</html>
```

## 核心流程

1. 登录（JWT、RBAC）→ 教师选择学段/文体 → 多图上传（保存至存储并创建记录）
2. 入队列：记录 `status=pending`，包含图片 URL 与 `templateVersion`
3. Worker：`STANDARDS_MAP` 取对应标准 → `buildPrompt` 拼提示词 → 调豆包多模态 → 返回 JSON（含 `schemaVersion`）→ 校验与归一化 → 回写数据库（`recognizedText`、`aiResultJson`、`totalScore`、`status=done`）
4. 前端轮询/订阅状态，显示等待/错误；详情页用 HTML 模板渲染；导出 PDF/HTML 快照保存到存储

## 权限与安全

* 角色：teacher/parent/student；家长/学生仅访问自己的记录；教师访问名下学生记录

* 输入校验：DTO/Zod；上传大小与速率限制

* 存储：签名 URL 限时访问；豆包密钥仅后端读取（环境变量）

## 本地运行

* SQLite：`.env` → `DATABASE_URL=file:./dev.db`；`AI_PROVIDER=mock` 联调；`npm run setup:lite` 初始化（迁移、种子）；`npm run dev` 启动 web/api/worker

* 真实模型：切 `AI_PROVIDER=doubao`，配置 `DOUBAO_API_KEY` 与模型名；其余不变

## 里程碑

1. 落地骨架与两份核心文件（模板 + 6变量配置），跑通 SQLite + mock
2. 串联豆包与归一化，完善状态与错误提示
3. 模板美化与打印样式优化；雷达图与维度视图细化
4. 导出与存储：前端/后端导出联调，COS 快照保存
5. 权限与检索：教师管理视图、家长/学生自助、姓名/题目检索优化
6. 生产化：切 PostgreSQL、数据导入、云托管与监控

## 首批交付物

* `src/config/evaluation-standards.ts`：6个字符串变量与映射

* `src/ai/prompt.ts`：提示词拼接函数

* `templates/correction-template.html`：批改结果模板初版（漂亮可迭代）

## 下一步

* 如你确认本计划，我将把上述文件与骨架一次性创建到项目，并接通本地运行与预览流程；之后按你的审美逐步优化模板样式与排版。

