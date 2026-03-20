const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const tcb = require('@cloudbase/node-sdk');
const multer = require('multer');
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 } // 30MB limit
});

// Initialize CloudBase
// Priority: Explicit credentials (TCB_SECRET_ID/KEY) > Container authorization (TENCENTCLOUD_RUNENV)
const tcbConfig = {
    env: process.env.TCB_ENV || 'cloud1-0gh78mpy39eccc0f'
};

let tcbApp;
let db;
let _;
let isLocalMock = false;

// Check if we have valid credentials
const hasCredentials = process.env.TCB_SECRET_ID && process.env.TCB_SECRET_KEY;
const isCloudRun = process.env.TENCENTCLOUD_RUNENV;

if (hasCredentials || isCloudRun) {
    if (hasCredentials) {
        tcbConfig.secretId = process.env.TCB_SECRET_ID;
        tcbConfig.secretKey = process.env.TCB_SECRET_KEY;
        console.log('✅ Initializing CloudBase with explicit credentials');
    } else {
        console.log('✅ Initializing CloudBase with container authorization (CloudRun mode)');
    }
    
    tcbApp = tcb.init(tcbConfig);
    try {
        db = tcbApp.database();
        _ = db.command;
        console.log('✅ Connected to CloudBase Database');
    } catch (e) {
        console.warn('⚠️  Failed to connect to CloudBase Database, falling back to local mock');
        initLocalMock();
    }
} else {
    console.warn('⚠️  No credentials provided. Starting in LOCAL MOCK MODE.');
    initLocalMock();
}

function initLocalMock() {
    isLocalMock = true;
    const mockStorageDir = path.join(__dirname, 'temp_uploads', 'mock_cloud');
    if (!fs.existsSync(mockStorageDir)) {
        try { fs.mkdirSync(mockStorageDir, { recursive: true }); } catch(e) {}
    }

    // Mock DB Store
    const mockStore = new Map();
    
    // Mock TCB App Interface
    tcbApp = {
        uploadFile: async ({ cloudPath, fileContent }) => {
            const fileName = path.basename(cloudPath);
            // Replace / with _ to simulate flat structure or just use name
            const safeName = cloudPath.replace(/\//g, '_');
            const destPath = path.join(mockStorageDir, safeName);
            fs.writeFileSync(destPath, fileContent);
            console.log(`[Mock Cloud] Uploaded: ${destPath}`);
            return { fileID: `cloud://mock/${safeName}` };
        },
        downloadFile: async ({ fileID }) => {
            const fileName = fileID.replace('cloud://mock/', '');
            const srcPath = path.join(mockStorageDir, fileName);
            if (!fs.existsSync(srcPath)) {
                throw new Error(`File not found: ${srcPath}`);
            }
            console.log(`[Mock Cloud] Downloaded: ${srcPath}`);
            return { fileContent: fs.readFileSync(srcPath) };
        },
        deleteFile: async ({ fileList }) => {
            let deleted = 0;
            for (const fileID of fileList) {
                const fileName = fileID.replace('cloud://mock/', '');
                const filePath = path.join(mockStorageDir, fileName);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    deleted++;
                }
            }
            return { deleted };
        },
        database: () => db
    };

    // Mock DB Interface
    db = {
        collection: (name) => ({
            add: async (data) => {
                const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
                mockStore.set(id, { ...data, _id: id });
                return { id };
            },
            doc: (id) => ({
                set: async (data) => { mockStore.set(id, { ...data, _id: id }); },
                update: async (data) => {
                    const existing = mockStore.get(id) || {};
                    for (const key in data) {
                        if (data[key] && data[key].__op === 'push') {
                            const arr = existing[key] || [];
                            existing[key] = [...arr, ...data[key].values];
                        } else if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
                             // Deep merge for nested objects like 'result'
                             existing[key] = { ...existing[key], ...data[key] };
                        } else {
                            existing[key] = data[key];
                        }
                    }
                    mockStore.set(id, existing);
                },
                get: async () => ({ data: [mockStore.get(id)].filter(x => x) }), // filter undefined
                remove: async () => { mockStore.delete(id); }
            }),
            where: (query) => ({
                remove: async () => {
                    // Simple mock for cleanup based on startTime
                    if (query && query.startTime && query.startTime.__op === 'lt') {
                         const threshold = query.startTime.val; // Accessing internal mock structure
                         for (const [key, val] of mockStore.entries()) {
                             if (val.startTime < threshold) mockStore.delete(key);
                         }
                    }
                },
                get: async () => {
                    return { data: [] }; // Mock empty result for other queries
                }
            })
        }),
        command: {
            push: (vals) => ({ __op: 'push', values: vals }),
            lt: (val) => ({ __op: 'lt', val }),
            set: (val) => val // simple pass-through for set command
        }
    };
    _ = db.command;
    console.log('✅ Local Mock Environment Initialized');
}

console.log('CloudBase env:', tcbConfig.env);
console.log('Environment variables:', {
    TENCENTCLOUD_RUNENV: process.env.TENCENTCLOUD_RUNENV,
    TCB_ENV: process.env.TCB_ENV,
    hasSecretId: !!process.env.TCB_SECRET_ID,
    hasSecretKey: !!process.env.TCB_SECRET_KEY,
    mode: isLocalMock ? 'LOCAL MOCK' : 'CLOUD'
});

// Load .env.local manually since we don't have dotenv
try {
  const envPath = path.resolve(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.log('Loaded configuration from .env.local');
  }
} catch (e) {
  console.error('Warning: Could not load .env.local', e.message);
}

// CloudBase uses port 80 by default; Local development uses PORT from .env (e.g., 3001)
const port = process.env.PORT || 80;

const app = express();

// Enable CORS for all routes
app.use(cors());

// Increase body parser limit to handle large base64 images
// Warning: Large JSON parsing is synchronous and can block the event loop
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(express.static('templates'));
app.use('/public', express.static('public'));

// Ensure API_KEY is read from the loaded process.env
const API_KEY = process.env.DOUBAO_API_KEY || '';
const MODEL = process.env.DOUBAO_MODEL || 'doubao-seed-1-6-251015';
const TEMPERATURE = parseFloat(process.env.TEMPERATURE || '0.5');
const TOP_P = parseFloat(process.env.TOP_P || '0.85');
const REPETITION_PENALTY = parseFloat(process.env.REPETITION_PENALTY || '1.15');
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '3000', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '180000', 10);
const REASONING_EFFORT = process.env.REASONING_EFFORT || 'high';

const { STANDARDS_MAP } = require('./src/config/evaluation-standards.js');
const querystring = require('querystring');

// Baidu OCR Configuration
const BAIDU_API_KEY = process.env.BAIDU_API_KEY || '';
const BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY || '';
let BAIDU_ACCESS_TOKEN = null;
let BAIDU_TOKEN_EXPIRES = 0;

async function getBaiduAccessToken() {
  if (BAIDU_ACCESS_TOKEN && Date.now() < BAIDU_TOKEN_EXPIRES) {
    return BAIDU_ACCESS_TOKEN;
  }
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${BAIDU_API_KEY}&client_secret=${BAIDU_SECRET_KEY}`;
  try {
    const resp = await fetch(url, { method: 'POST' });
    const data = await resp.json();
    if (data.access_token) {
      BAIDU_ACCESS_TOKEN = data.access_token;
      BAIDU_TOKEN_EXPIRES = Date.now() + (data.expires_in - 60) * 1000;
      console.log('Baidu Access Token refreshed');
      return BAIDU_ACCESS_TOKEN;
    } else {
      console.error('Failed to get Baidu Access Token:', data);
      return null;
    }
  } catch (e) {
    console.error('Error fetching Baidu Access Token:', e);
    return null;
  }
}

async function performBaiduOCR(imageBase64) {
  const start = Date.now();
  const token = await getBaiduAccessToken();
  if (!token) return '';
  
  // Use handwriting (Handwriting Recognition) - Optimized for student essays
  const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting?access_token=${token}`;
  
  // Remove data:image/xxx;base64, prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  
  try {
    const body = querystring.stringify({
      image: base64Data,
      language_type: 'CHN_ENG',
      detect_direction: 'true'
    });
    
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body
    });
    
    const data = await resp.json();
    const end = Date.now();
    console.log(`Baidu OCR API call took: ${end - start} ms`);

    if (data.words_result) {
      const lines = data.words_result.sort((a, b) => a.location.top - b.location.top);
      if (lines.length === 0) return '';
      
       const lefts = lines.map(l => l.location.left).sort((a,b) => a - b);
       const medianLeft = lefts[Math.floor(lefts.length / 2)];
       const INDENT_THRESHOLD = 40; 
       
       const firstLine = lines[0];
       let titleDetected = false;
       if (lines.length > 0 && 
           (firstLine.location.left - medianLeft > 100) && 
           firstLine.words.length < 20) {
           titleDetected = true;
       }

       let reconstructedText = '';
       
       const noisePatterns = [
           /^星期[一二三四五六日\(\)（）]*$/i,
           /^月\s*日$/i,
           /^\d+$/i,
           /^第\s*\d+\s*页$/i,
           /^WENBOOK$/i,
           /^[①②③④⑤⑥⑦⑧⑨⑩]$/i,
           /^第$/i 
       ];

       for (let i = 0; i < lines.length; i++) {
           const line = lines[i];
           const text = line.words.trim();
           
           const isNoise = noisePatterns.some(p => p.test(text)) || text.includes('WENBOOK');
           if (isNoise) continue;
           
           const isIndented = (line.location.left - medianLeft) > INDENT_THRESHOLD;
           
           if (i === 0 && titleDetected) {
               reconstructedText += text + '\n';
               continue;
           }
           
           if (i > 0) {
              if (isIndented) {
                  reconstructedText += '\n' + text;
              } else {
                  reconstructedText += text;
              }
          } else {
              reconstructedText += text;
          }
      }
      
      console.log('Baidu OCR success (Smart Reconstruct), length:', reconstructedText.length);
      return reconstructedText;
    } else {
      console.error('Baidu OCR failed:', data);
      return '';
    }
  } catch (e) {
    const end = Date.now();
    console.error(`Baidu OCR API call failed after ${end - start} ms:`, e);
    return '';
  }
}

function buildStrictPrompt(genreName = '小学中年级记叙文') {
  return (
    `请严格按照以下要求完成${genreName}作文批改，最终输出标准JSON格式结果，字段不可缺失、不可新增、不可修改，确保JSON格式合法可解析。\n` +
    '---\n' +
    '一、执行步骤（严格按顺序完成）\n' +
    '步骤一：原文标注（必须100%保留原文的段落、换行、语序、内容。绝不允许随意增加换行符把一段话拆成多段！）\n' +
    '1. 错别字标注\n' +
    '   - 标注范围：形近字、同音字、错字、漏字、多字，以及「的、地、得」用法错误、标点使用错误；\n' +
    '   - 「的、地、得」用法规则：名词前用「的」，动词前用「地」，动词/形容词后补语前用「得」；\n' +
    '   - 标注格式：统一用[]包裹，错别字与正确字之间用单下划线_分割，示例：[错别字_正确的字]、[的_地]、[，_。]。\n' +
    '2. 好句子标注\n' +
    '   - 评选标准（满足任意1条即可）：① 运用了比喻、拟人等符合中年级水平的修辞手法；② 有生动的动作、神态、环境细节描写；③ 情感真挚自然，贴合主题；④ 用词准确，句式有新意；\n' +
    '   - 数量要求：不少于2条，不超过4条；\n' +
    '   - 标注格式：统一用【】包裹，原句与点评之间用单下划线_分割，必须包含原句完整标点，示例：【春天来了，花儿探出了小脑袋_运用拟人的修辞手法，生动写出了春天花开的可爱样子，画面感十足】；\n' +
    '   - 刚性规则：必须是直接用【】包裹的格式替换掉原文的原句！绝对不要在保留原句后再追加一个【】标注，这会导致句子重复！同一句话不得同时标注好句子和不好的句子。\n' +
    '3. 不好的句子标注\n' +
    '   - 标注范围：除错别字、标点错误外，存在以下问题的句子：① 病句（成分残缺、搭配不当、语序混乱）；② 表达空洞、无具体内容；③ 逻辑断层、与主题无关；④ 重复啰嗦、语句不通顺；\n' +
    '   - 数量要求：2-4条，若原文无足够问题句，可选取表达有提升空间的句子标注优化建议；\n' +
    '   - 刚性规则：【绝对不可把标注放在文章末尾】！你必须在文章正文的【原位置】直接把原句替换为带@@的标注格式。绝不允许在文章末尾另起一段写标注。并且，标注时是直接将原句替换为@@包围的格式，绝对不要保留原句后再跟一个标注！\n' +
    '   - 标注格式：统一用@@包裹，原句、问题、修改建议之间用单下划线_分割，必须包含原句完整标点，句子中的错别字需同步标注，示例：@@这句[化_话]有问题_句子成分残缺，缺少主语，表意不完整_修改为：妈妈说的这句话，让我明白了坚持的意义，也让我学会了勇敢面对困难@@；\n' +
    '   - 要求：修改建议贴合小学中年级写作水平，不超纲，有明确的提升指导，每条问题+建议总字数50-80字。\n' +
    '\n' +
    '步骤二：五维度评分（严格按照前面提供的【本篇作文评分标准】执行，结合作文实际质量评定对应档位的得分，不得随意给定分值）\n' +
    '\n' +
    '步骤三：完成评分理由与综合评价\n' +
    '1. 每个维度的评分理由：必须先对应评分档位，再结合原文具体内容举例说明，不得空泛，每个维度理由不少于80字；\n' +
    '2. 综合评价：先肯定作文的优点与亮点，再给出2-3个具体的可提升方向，语言亲切，符合小学中年级学生认知，字数180-220字；\n' +
    '3. 总分=五个维度得分之和，结果取整数。\n' +
    '\n' +
    '---\n' +
    '二、输出格式要求（严格执行，确保JSON可解析）\n' +
    '1. 原文中的双引号"必须转义为\\"，换行符必须转义为\\n；\n' +
    '2. 严格按照以下JSON字段输出，不可缺失、新增、修改字段名，所有字段不能为空；\n' +
    `3. 若用户未提供作者姓名，默认填「佚名」；未提供作文题目，默认填「无标题」；文体固定填「${genreName}」。\n` +
    '\n' +
    '输出格式样例：\n' +
    '{\n' +
    '  "作文题目": "填写作文完整题目",\n' +
    `  "文体": "${genreName}",\n` +
    '  "作者姓名": "填写作者姓名，未提供填佚名",\n' +
    '  "原文": "根据要求标注完成的作文，保留原有的段落、换行格式",\n' +
    '  "总分": "填写总分，满分40分，整数",\n' +
    '  "五个维度评分及理由": [\n' +
    '    {\n' +
    '      "维度": "内容立意",\n' +
    '      "得分": "0-9分，整数",\n' +
    '      "理由": "结合原文写评分依据，不少于80字"\n' +
    '    },\n' +
    '    {\n' +
    '      "维度": "结构框架",\n' +
    '      "得分": "0-6分，整数",\n' +
    '      "理由": "结合原文写评分依据，不少于80字"\n' +
    '    },\n' +
    '    {\n' +
    '      "维度": "素材运用",\n' +
    '      "得分": "0-6分，整数",\n' +
    '      "理由": "结合原文写评分依据，不少于80字"\n' +
    '    },\n' +
    '    {\n' +
    '      "维度": "语言表达",\n' +
    '      "得分": "0-15分，整数",\n' +
    '      "理由": "结合原文写评分依据，不少于80字"\n' +
    '    },\n' +
    '    {\n' +
    '      "维度": "书写规范",\n' +
    '      "得分": "0-4分，整数",\n' +
    '      "理由": "结合原文写评分依据，不少于80字"\n' +
    '    }\n' +
    '  ],\n' +
    '  "综合评价": "点评作文优缺点，180-220字，贴合小学生认知"\n' +
    '}\n'
  );
}

const { spawn } = require('child_process');

// Cleanup old tasks from DB every hour (TTL fallback)
// Changed from 1 hour to 24 hours to allow users to review results
setInterval(async () => {
    try {
        const twentyFourHoursAgo = Date.now() - (24 * 3600000); // 24 hours instead of 1
        await db.collection('correction_tasks')
            .where({
                startTime: _.lt(twentyFourHoursAgo)
            })
            .remove();
        console.log('Cleaned up tasks older than 24 hours from DB');
    } catch (e) {
        console.error('Failed to cleanup old tasks:', e);
    }
}, 3600000);

// Cleanup old uploads from cache every 10 minutes
setInterval(() => {
    const tenMinutesAgo = Date.now() - 600000;
    let cleaned = 0;
    
    for (const [uploadId, cached] of uploadCache.entries()) {
        if (cached.timestamp < tenMinutesAgo) {
            uploadCache.delete(uploadId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} old uploads from cache`);
    }
}, 600000);

function processImageWithPython(imagePath) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.resolve(__dirname, 'src', 'python', 'preprocess.py');
    const pythonProcess = spawn('python', [pythonScript, imagePath]);
    
    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script exited with code ${code}`);
        console.error(`stderr: ${stderrData}`);
        resolve(imagePath);
      } else {
        const lines = stdoutData.trim().split(/\r?\n/);
        const processedPath = lines[lines.length - 1].trim();
        if (processedPath && fs.existsSync(processedPath)) {
            console.log('Image processed successfully:', processedPath);
            resolve(processedPath);
        } else {
            console.warn('Python script did not return a valid path, using original.');
            resolve(imagePath);
        }
      }
    });
    
    pythonProcess.on('error', (err) => {
        console.error('Failed to start python process:', err);
        resolve(imagePath);
    });
  });
}

const BASE_SAVE_DIR = path.resolve(__dirname, 'data', 'corrections');
try { fs.mkdirSync(BASE_SAVE_DIR, { recursive: true }); } catch(e) {}

async function callDoubao(payload) {
  const start = Date.now();
  const { system, user, imageDataUrls } = payload;
  const baseUrl = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const apiPath = process.env.DOUBAO_API_PATH || '/chat/completions';
  const urlFull = baseUrl + apiPath;
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  const content = [{ type: 'text', text: user }];
  for (const u of imageDataUrls || []) {
    content.push({ type: 'image_url', image_url: { url: u, detail: 'high' } });
  }
  messages.push({ role: 'user', content });
  const body = {
    model: MODEL,
    messages,
    temperature: TEMPERATURE,
    top_p: TOP_P,
    max_tokens: MAX_TOKENS,
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let resp;
  let error = null;
  try {
    resp = await fetch(urlFull, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    error = err;
  } finally {
    clearTimeout(timeoutId);
  }
  
  const end = Date.now();
  console.log(`Doubao API call took: ${end - start} ms`);

  let data = {};
  let text = '';
  
  if (!error && resp) {
    if (!resp.ok) {
        error = new Error(`API responded with status ${resp.status}`);
        try { text = await resp.text(); } catch(e){}
    } else {
        data = await resp.json().catch(() => ({}));
        try {
            const msg = data.choices && data.choices[0] && data.choices[0].message;
            if (typeof msg?.content === 'string') {
            text = msg.content;
            } else if (Array.isArray(msg?.content)) {
            const parts = msg.content.filter(x => x && (x.type === 'output_text' || typeof x.text === 'string'));
            text = parts.map(x => x.text || '').join('\n');
            }
        } catch(e) {}
    }
  } else if (error) {
      text = `Error: ${error.message}`;
  }

  let parsed;
  try { 
    parsed = JSON.parse(text); 
  } catch(e) {
    console.log('Direct JSON parse failed, attempting to repair...');
    const dimensionFixRegex = /(\{\s*)"([^"]+)"(\s*,\s*"得分"\s*:)/g;
    let fixedText = text.replace(dimensionFixRegex, '$1"维度": "$2"$3');
    try {
        parsed = JSON.parse(fixedText);
        console.log('JSON repaired via regex successfully.');
    } catch(e3) {
        const firstOpen = fixedText.indexOf('{');
        if (firstOpen !== -1) {
            const potentialJson = fixedText.slice(firstOpen);
            for (let i = potentialJson.length - 1; i >= 0; i--) {
                if (potentialJson[i] === '}') {
                    const candidate = potentialJson.slice(0, i + 1);
                    try {
                        parsed = JSON.parse(candidate);
                        console.log('JSON repaired successfully by truncation.');
                        break;
                    } catch (e2) {}
                }
            }
        }
    }
  }
  
  const dir = BASE_SAVE_DIR;
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const baseName = `${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  const parsedFile = path.join(dir, `${baseName}.json`);
  const contentFile = path.join(dir, `${baseName}.content.txt`);
  const responseFile = path.join(dir, `${baseName}.response.json`);
  const promptFile = path.join(dir, `${baseName}.prompt.txt`);
  
  try {
    let formattedText = String(text || '');
    try {
        if (parsed) {
             formattedText = JSON.stringify(parsed, null, 2);
        } else {
             const tempParsed = JSON.parse(text);
             formattedText = JSON.stringify(tempParsed, null, 2);
        }
    } catch(e) {}

    fs.writeFileSync(contentFile, formattedText, 'utf8');
    
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      delete data.choices[0].message.reasoning_content;
      if (parsed) {
         try {
             data.choices[0].message.content = parsed;
         } catch(e) {}
      } else {
         try {
             data.choices[0].message.content = JSON.parse(text);
         } catch(e) {}
      }
    }
    fs.writeFileSync(responseFile, JSON.stringify(data || { error: String(error) }, null, 2), 'utf8');
    const promptText = `SYSTEM:\n${system || ''}\n\nUSER:\n${user || ''}`;
    fs.writeFileSync(promptFile, promptText, 'utf8');
  } catch (e) {}

  if (error) {
      throw error;
  }

  if (parsed && typeof parsed === 'object') {
    if (parsed['原文'] && typeof parsed['原文'] === 'string') {
        parsed['原文'] = parsed['原文'].replace(/\\n/g, '\n');
    }
    parsed.image_url = imageDataUrls || [];
    try { fs.writeFileSync(parsedFile, JSON.stringify(parsed, null, 2), 'utf8'); } catch(e) {}
    parsed.saved_file = parsedFile;
    parsed.saved_files = { parsed: parsedFile, content: contentFile, response: responseFile, prompt: promptFile };
    return parsed;
  } else {
    const fallback = {
      error: (!text ? 'Empty response content' : 'Invalid JSON from model'),
      raw_text: text || '',
      image_url: imageDataUrls || [],
      saved_file: parsedFile,
      saved_files: { parsed: parsedFile, content: contentFile, response: responseFile, prompt: promptFile }
    };
    try { fs.writeFileSync(parsedFile, JSON.stringify(fallback, null, 2), 'utf8'); } catch(e) {}
    return fallback;
  }
}

function buildPromptPayload(body, ocrText) {
  let standardText = '';
  
  // 提前解析需要的文体名称
  let genreForPrompt = '小学中年级记叙文';
  if (body.customStandard) {
      const displayName = body.customStandard.name;
      if (displayName.includes('《')) {
          genreForPrompt = displayName.split('《')[0];
      } else {
          genreForPrompt = displayName;
      }
      console.log(`[Prompt Builder] Using Custom Genre Name: ${genreForPrompt}`);
  } else {
      genreForPrompt = body.choice || body.type || '小学中年级记叙文';
      console.log(`[Prompt Builder] Using Default Genre Name: ${genreForPrompt}`);
  }
  
  // 直接通过参数将文体传递给生成函数，避免后期正则替换遗漏
  let baseSystem = buildStrictPrompt(genreForPrompt);
  
  // 检查是否使用了自定义评分规则
  if (body.customStandard) {
      const cs = body.customStandard;
      // 前端传过来的 name 可能是 "小学中年级记叙文" 或者 "小学中年级记叙文《我的朋友》"
      // 这是给 AI 看的标题
      const displayName = cs.name; 
      
      // 解析出纯粹的“学段+文体”，用于替换提示词中的要求
      // 前端传递时可以把基础文体带过来，这里简单处理，提取前面的文体部分（去掉书名号内容）
      let baseGenre = displayName;
      if (displayName.includes('《')) {
          baseGenre = displayName.split('《')[0];
      }
      
      standardText = `${displayName}\n` +
          `五维度固定分值上限\n` +
          `1. 内容立意：9分\n` +
          `2. 结构框架：6分\n` +
          `3. 素材运用：6分\n` +
          `4. 语言表达：15分\n` +
          `5. 书写规范：4分\n\n` +
          `维度一：内容立意（9分）\n${cs.dim1}\n\n` +
          `维度二：结构框架（6分）\n${cs.dim2}\n\n` +
          `维度三：素材运用（6分）\n${cs.dim3}\n\n` +
          `维度四：语言表达（15分）\n${cs.dim4}\n\n` +
          `维度五：书写规范（4分）\n${cs.dim5}`;
          
      // baseSystem 已经在调用 buildStrictPrompt(baseGenre) 时完成了动态替换
  } else {
      // 根据前端传入的 choice (前端传递的字段名是 choice 而不是 type) 获取对应的评分标准
      const { STANDARDS_MAP } = require('./src/config/evaluation-standards');
      const typeKey = body.choice || body.type || '';
      standardText = STANDARDS_MAP[typeKey] || STANDARDS_MAP['小学中年级记叙文']; // 默认兜底
      
      // baseSystem 已经在调用 buildStrictPrompt(typeKey) 时完成了动态替换
  }
  
  // 将评分标准拼接到系统提示词中（放在开头更利于 AI 遵循标准）
  const system = `【本篇作文评分标准】：\n${standardText}\n\n${baseSystem}`;
  
  let user = body.content || '';
  if (ocrText) {
    user += (user ? '\n\n' : '') + ocrText;
  }
  
  // Debug log to verify what genre was actually requested and parsed
  console.log(`[Prompt Builder] Body Custom Standard:`, !!body.customStandard);
  if (body.customStandard) {
      console.log(`[Prompt Builder] Custom Genre Name: ${body.customStandard.name}`);
  } else {
      console.log(`[Prompt Builder] Default Choice: ${body.choice || body.type}`);
  }
  
  return { system, user, imageDataUrls: body.imageDataUrls };
}

// Async Task Processing
async function runTask(taskId, body) {
    const log = async (msg) => {
        const time = new Date().toLocaleTimeString();
        const logEntry = `[${time}] ${msg}`;
        console.log(`[Task ${taskId}] ${msg}`);
        try {
            await db.collection('correction_tasks').doc(taskId).update({
                logs: _.push([logEntry])
            });
        } catch (e) {
            console.error('Failed to update logs:', e);
        }
    };

    try {
        await db.collection('correction_tasks').doc(taskId).update({
            status: 'processing'
        });
        await log('任务已开始，正在处理图片...');

        let ocrText = '';
        let imageDataUrls = []; // Initialize outside to ensure scope visibility

        if ((body.imageDataUrls && body.imageDataUrls.length > 0) || (body.fileIds && body.fileIds.length > 0)) {
            const tempDir = path.resolve(__dirname, 'temp_uploads');
            try { fs.mkdirSync(tempDir, { recursive: true }); } catch(e) {}
            
            // Case A: Cloud Storage File IDs (New Way)
            if (body.fileIds && body.fileIds.length > 0) {
                await log(`正在处理 ${body.fileIds.length} 个云端图片...`);
                for (let i = 0; i < body.fileIds.length; i++) {
                    const fileID = body.fileIds[i];
                    await log(`正在下载图片 ${i+1}: ${fileID}`);
                    
                    const tempFilePath = path.join(tempDir, `download_${taskId}_${i}.png`); // Assume png or detect later
                    
                    // Download file using tcb-admin-node
                    const res = await tcbApp.downloadFile({
                        fileID: fileID
                    });
                    
                    // res.fileContent is Buffer
                    fs.writeFileSync(tempFilePath, res.fileContent);
                    
                    // Delete file from Cloud Storage immediately after download to save cost
                    try {
                        await tcbApp.deleteFile({
                            fileList: [fileID]
                        });
                        await log(`已清理云端临时图片: ${fileID}`);
                    } catch (delErr) {
                        console.error('Failed to delete cloud file:', delErr);
                    }
                    
                    await log(`图片 ${i+1}: 正在进行图像预处理优化...`);
                    const processedPath = await processImageWithPython(tempFilePath);
                    
                    const processedBuffer = fs.readFileSync(processedPath);
                    const base64 = processedBuffer.toString('base64');
                    imageDataUrls.push(`data:image/png;base64,${base64}`);
                }
            } 
            // Case B: Direct Base64 (Legacy Way)
            else if (body.imageDataUrls && body.imageDataUrls.length > 0) {
                for (let i = 0; i < body.imageDataUrls.length; i++) {
                    await log(`正在处理图片 ${i+1}/${body.imageDataUrls.length}...`);
                    let dataUrl = body.imageDataUrls[i];
                    if (dataUrl.startsWith('data:image')) {
                        const matches = dataUrl.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
                        if (matches) {
                            const ext = matches[1];
                            const buffer = Buffer.from(matches[2], 'base64');
                            const tempFilePath = path.join(tempDir, `upload_${taskId}_${i}.${ext}`);
                            fs.writeFileSync(tempFilePath, buffer);
                            
                            await log(`图片 ${i+1}: 正在进行图像预处理优化...`);
                            const processedPath = await processImageWithPython(tempFilePath);
                            
                            if (processedPath !== tempFilePath) {
                                const processedBuffer = fs.readFileSync(processedPath);
                                dataUrl = `data:image/${ext};base64,${processedBuffer.toString('base64')}`;
                            }
                            imageDataUrls.push(dataUrl);
                        }
                    }
                }
            }
            
            // OCR
            for (let i = 0; i < imageDataUrls.length; i++) {
                await log(`图片 ${i+1}: 正在提取文字内容 (OCR)...`);
                let currentOcrText = await performBaiduOCR(imageDataUrls[i]);
                await log(`图片 ${i+1}: 文字提取完成 (共 ${currentOcrText ? currentOcrText.length : 0} 字)`);
                
                if (currentOcrText) {
                    // 1. 过滤掉整行都是孤立页眉的情况
                    currentOcrText = currentOcrText.split('\n').filter(line => {
                        const trimmed = line.trim().replace(/\s+/g, ''); 
                        if (/^(月|日|口|年)+$/.test(trimmed) && trimmed.length <= 6) {
                            return false; 
                        }
                        if (/^[-_—]+$/.test(trimmed) || /^[.,，。]+$/.test(trimmed)) {
                            return false;
                        }
                        return true;
                    }).join('\n');
                    
                    // 2. 强制抹除夹杂在段落开头的“月口”、“月日”、“年月日”等残留字符
                    // 这会把文本中所有的孤立或者连着的 "月口", "月 日", "年 月 日" 给干掉
                    currentOcrText = currentOcrText.replace(/(?:年|月|日|口)\s*(?:年|月|日|口)/g, '');
                    currentOcrText = currentOcrText.replace(/^[年月口日\s]+/g, '');
                    
                    ocrText += (ocrText ? '\n' : '') + currentOcrText;
                }
            }
        }

        await log('正在呼叫AI老师进行智能批改 (可能需要1-2分钟，请耐心等待)...');
        
        // Let's make it robust.
        // Get dynamic prompt based on composition type
        const payloadForPrompt = buildPromptPayload(body, ocrText);

        const finalPayload = {
             system: payloadForPrompt.system,
             user: payloadForPrompt.user,
             imageDataUrls: imageDataUrls // The processed base64 images from the local variable
        };
        
        console.log(`[Task ${taskId}] 发送给大模型的 System Prompt: \n`, finalPayload.system.substring(0, 500) + '...');
        
        const result = await callDoubao(finalPayload);
        
        await log('AI老师批改完成，正在生成报告...');
        
        // Use update with proper field replacement to avoid "Cannot create field in null" error
        // We don't use .set() because it would replace the entire document and lose logs
        await db.collection('correction_tasks').doc(taskId).update({
            status: 'completed',
            result: _.set(result) // Use _.set() command to replace the entire result field
        });
    } catch (e) {
        await log(`发生错误: ${e.message}`);
        await db.collection('correction_tasks').doc(taskId).update({
            status: 'error',
            error: e.message
        });
    }
}

// API: Proxy Upload (Solves CORS issues)
// In-memory cache for upload operations (temporary storage before CloudBase upload)
const uploadCache = new Map();

app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        // Generate upload ID immediately
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fileExtension = path.extname(req.file.originalname) || '.jpg';
        const cloudPath = `uploads/${Date.now()}-${Math.random().toString(36).substr(2, 9)}${fileExtension}`;

        // ⚠️ CRITICAL: Save buffer BEFORE sending response (req.file may be cleared after response)
        const fileBuffer = Buffer.from(req.file.buffer);

        console.log(`[Upload] Queued: ${uploadId}, size: ${fileBuffer.length} bytes`);

        // ✅ CRITICAL: Set initial status to uploadCache BEFORE responding (fixes 404 on status check)
        uploadCache.set(uploadId, {
            status: 'uploading',
            fileID: null,
            cloudPath: cloudPath,
            timestamp: Date.now()
        });

        // Return immediately with upload ID
        res.json({
            uploadId: uploadId,
            status: 'queued',
            message: 'Upload queued, processing in background'
        });

        // Upload to CloudBase asynchronously (non-blocking)
        (async () => {
            const startUpload = Date.now();
            try {
                console.log(`[Upload] Starting CloudBase upload: ${uploadId}, path: ${cloudPath}`);
                
                const uploadRes = await tcbApp.uploadFile({
                    cloudPath: cloudPath,
                    fileContent: fileBuffer
                });

                const uploadDuration = Date.now() - startUpload;
                console.log(`[Upload] Success in ${uploadDuration}ms: ${uploadId} -> ${uploadRes.fileID}`);
                
                // Store success result
                uploadCache.set(uploadId, {
                    status: 'completed',
                    fileID: uploadRes.fileID,
                    cloudPath: cloudPath,
                    timestamp: Date.now()
                });
            } catch (e) {
                const uploadDuration = Date.now() - startUpload;
                console.error(`[Upload] Failed after ${uploadDuration}ms: ${uploadId}`);
                console.error('[Upload] Error details:', e);
                
                // Store error
                uploadCache.set(uploadId, {
                    status: 'failed',
                    error: e.message,
                    cloudPath: cloudPath,
                    timestamp: Date.now()
                });
            }
        })();

    } catch (e) {
        console.error('[Upload] Error:', e);
        res.status(500).json({ error: 'Upload initialization failed: ' + e.message });
    }
});

// API: Check Upload Status
app.get('/api/upload/:uploadId', (req, res) => {
    const { uploadId } = req.params;
    const cached = uploadCache.get(uploadId);

    if (!cached) {
        return res.status(404).json({ error: 'Upload not found' });
    }

    res.json({
        uploadId: uploadId,
        status: cached.status,
        fileID: cached.fileID,
        error: cached.error,
        age: Date.now() - cached.timestamp
    });
});

// API: Create Task
app.post('/api/correct', async (req, res) => {
    // Generate Task ID
    const taskId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    console.log(`[${new Date().toISOString()}] Received task ${taskId}`);

    // Check body
    if (!req.body || (!req.body.imageDataUrls && !req.body.fileIds)) {
        console.error(`[Task ${taskId}] Error: Request body empty or missing image data`);
        return res.status(400).json({ error: 'Invalid request body' });
    }

    try {
        // 1. Write Initial Status to DB with timeout protection (prevents cold start hangs)
        await Promise.race([
            db.collection('correction_tasks').doc(taskId).set({
                status: 'pending',
                logs: ['Task created'],
                result: null,
                error: null,
                startTime: Date.now()
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Database write timeout')), 10000)
            )
        ]);
        
        console.log(`[Task ${taskId}] DB record created successfully`);

        // 2. Send response to client immediately
        res.json({ taskId, status: 'pending', message: 'Task submitted successfully' });

        // 3. Start Heavy Processing asynchronously
        // Background processing continues even after response is sent
        runTask(taskId, req.body).catch(err => {
            console.error(`[Task ${taskId}] Unhandled background error:`, err);
            // Try to update task status to error
            db.collection('correction_tasks').doc(taskId).update({
                status: 'error',
                error: err.message || 'Unknown error'
            }).catch(dbErr => {
                console.error(`[Task ${taskId}] Failed to update error status:`, dbErr);
            });
        });

    } catch (e) {
        console.error(`[Task ${taskId}] DB Initialization Error:`, e);
        // If DB write fails, return 500 so frontend knows to retry
        return res.status(500).json({ 
            error: 'Failed to initialize task', 
            details: e.message 
        });
    }
});

// Health Check Endpoint (No DB dependency)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        env: process.env.TCB_ENV || 'cloud1-0gh78mpy39eccc0f'
    });
});

// API: Test Database (Health Check)
app.get('/api/test-db', async (req, res) => {
    // Set timeout to avoid hanging forever
    const timeoutId = setTimeout(() => {
        if (!res.headersSent) {
            console.error('[DB Test] Timeout after 30 seconds');
            res.status(504).json({
                status: 'timeout',
                message: 'Database test timed out after 30 seconds',
                hint: 'Database connection may be blocked or credentials are invalid'
            });
        }
    }, 30000); // 30 second timeout

    try {
        console.log('[DB Test] Starting...');
        console.log('[DB Test] DB object exists:', !!db);
        console.log('[DB Test] isLocalMock:', isLocalMock);
        
        const testId = 'test_' + Date.now();
        const collection = db.collection('correction_tasks');
        
        // 1. Try to Write
        console.log('[DB Test] Writing to collection...');
        await collection.doc(testId).set({
            test: true,
            timestamp: Date.now()
        });
        console.log('[DB Test] Write Success');
        
        // 2. Try to Read
        console.log('[DB Test] Reading from collection...');
        const doc = await collection.doc(testId).get();
        console.log('[DB Test] Read Success:', doc.data);
        
        clearTimeout(timeoutId);
        res.json({
            status: 'success',
            message: 'Database Write & Read successful',
            data: doc.data,
            isLocalMock: isLocalMock
        });
        
        // Cleanup
        console.log('[DB Test] Cleaning up test document...');
        await collection.doc(testId).remove();
        
    } catch (e) {
        clearTimeout(timeoutId);
        console.error('[DB Test] Failed:', e);
        if (!res.headersSent) {
            res.status(500).json({
                status: 'error',
                message: 'Database test failed',
                error: e.message,
                code: e.code,
                isLocalMock: isLocalMock
            });
        }
    }
});


// API: Get Task Status
app.get('/api/task/:id', async (req, res) => {
    const taskId = req.params.id;
    
    try {
        // Add 5-second timeout to prevent 504 errors
        const doc = await Promise.race([
            db.collection('correction_tasks').doc(taskId).get(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Database query timeout after 5s')), 5000)
            )
        ]);
        
        if (!doc.data || doc.data.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        const task = doc.data[0];
        res.json({
            id: taskId,
            status: task.status,
            logs: task.logs,
            result: task.result,
            error: task.error
        });
    } catch (e) {
        console.error('Failed to get task:', e);
        // Return specific error for timeout vs other errors
        if (e.message && e.message.includes('timeout')) {
            return res.status(504).json({ error: 'Database query timeout, please retry' });
        }
        res.status(500).json({ error: 'Failed to get task status' });
    }
});

// Legacy handler removed to prevent confusion

// Static files
app.use(express.static(path.join(__dirname, 'templates')));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'home.html'));
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

server.setTimeout(300000);
server.keepAliveTimeout = 305000;
server.headersTimeout = 310000;