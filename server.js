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

function buildStrictPrompt() {
  return (
    '请以严格按照以下要求完成作文批改，并输出标准JSON格式结果，字段不可缺失、不可新增：\n' +
    '步骤一：\n'+
    '在原文中用[]标识出错别字，格式样例：[错别字1_正确的字]、[错别字2_正确的字]。\n' +
    '特别注意“的、地、得”的正确用法：\n' +
    '1. 名词前用“的”（定语+的+名词，如“美丽的风景”）；\n' +
    '2. 动词前用“地”（状语+地+动词，如“飞快地跑”）；\n' +
    '3. 动词/形容词后补语前用“得”（动词/形容词+得+补语，如“跑得快”、“辛苦得来”）。\n' +
    '发现错误需用[]标识并纠正，格式样例：[的_得]、[地_得]、[的_地]等。\n' +
    '在原文中用【】标识出好的句子（不要漏了句子最后的标点符号），同时说明好在哪里，格式样例：【好的句子1_说明好在哪里】、【好的句子2_说明好在哪里】，至少2条。\n' +
    '在原文中用@@标识出不好的句子（不要漏了句子最后的标点符号），同时说明问题及具体的修改建议（错别字单独有格式要求，不算不好的句子）。格式样例：@不好的句子1_问题_修改建议@、@不好的句子2_问题_修改建议@，数量为3-5条，至少3条。修改建议相对原文要有明显改动并且尽量内容丰富，目标是指导学生提升写作水平。每条问题+建议约100字\n' +
    '注意1：即使句子被标记为【】或@@，其中的错别字仍需单独用[]标识。格式样例：@这句[化_话]有问题@\n' +
    '注意2：错别字和正确的字之间严格用下划线_分割，方便后期解析，好的句子、好在哪里之间严格用下划线_分割，方便解析，不好的句子、原句问题、修改建议之间严格用下划线_分割，方便解析。\n' +
    '注意3：[]、【】、@@中每个项目都必须齐全，不能缺失任何一个，且只有中间才可能出现下划线_,开头和末尾没有下划线_。\n' +
    '注意4：【重要】上面说的错别字、好句子、不好的句子一定在原文原位置标识，不要附在作文末尾。\n' +
    '注意5：【重要】不要将你修改后的句子标注为好句子。\n' +
    '步骤三：\n' +
    '1. 五个评分维度（内容立意、结构框架、素材运用、语言表达、情感表达）每项满分6分，总分=五个维度得分之和，结果取整数；\n' +
    '2. 每个维度的评分理由需结合原文具体内容举例说明，避免空泛，字数不少于120字；\n' +
    '3. 综合评价需包含作文优点、亮点分析，语言亲切，符合小学生认知，字数200字左右；\n' +
    '   \n' +
    '    \'输出格式样例（注意保证json格式正确可解析，检查末尾是否有多余的}）：\\n\' +\n' +
    '    \'{\\n\' +\n' +
    '    \'  "作文题目": "[填写作文完整题目]",\\n\' +\n' +
    '    \'  "文体": "[填写文体，如：小学记叙文/议论文/说明文]",\\n\' +\n' +
    '    \'  "作者姓名": "[填写作者姓名]",\\n\' +\n' +
    '    \'  "原文": "[根据要求标识出错别字、好句子、不好句子的作文，同时保留原有的段落、换行等格式]",\\n\' +\n' +
    '    \'  "总分": "[填写总分，满分30分，整数]",\\n\' +\n' +
    '    \'  "五个维度评分及理由": [\\n\' +\n' +
    '    \'    {\\n\' +\n' +
    '    \'      "维度": "内容立意",\\n\' +\n' +
    '    \'      "得分": "[0-6分，整数]",\\n\' +\n' +
    '    \'      "理由": "[结合原文写评分依据，不少于120字]"\\n\' +\n' +
    '    \'    },\\n\' +\n' +
    '    \'    {\\n\' +\n' +
    '    \'      "维度": "结构框架",\\n\' +\n' +
    '    \'      "得分": "[0-6分，整数]",\\n\' +\n' +
    '    \'      "理由": "[结合原文写评分依据，不少于120字]"\\n\' +\n' +
    '    \'    },\\n\' +\n' +
    '    \'    {\\n\' +\n' +
    '    \'      "维度": "素材运用",\\n\' +\n' +
    '    \'      "得分": "[0-6分，整数]",\\n\' +\n' +
    '    \'      "理由": "[结合原文写评分依据，不少于120字]"\\n\' +\n' +
    '    \'    },\\n\' +\n' +
    '    \'    {\\n\' +\n' +
    '    \'      "维度": "语言表达",\\n\' +\n' +
    '    \'      "得分": "[0-6分，整数]",\\n\' +\n' +
    '    \'      "理由": "[结合原文写评分依据，不少于120字]"\\n\' +\n' +
    '    \'    },\\n\' +\n' +
    '    \'    {\\n\' +\n' +
    '    \'      "维度": "情感表达",\\n\' +\n' +
    '    \'      "得分": "[0-6分，整数]",\\n\' +\n' +
    '    \'      "理由": "[结合原文写评分依据，不少于120字]"\\n\' +\n' +
    '    \'    }\\n\' +\n' +
    '    \'  ],\\n\' +\n' +
    '    \'  "综合评价": "[点评作文优缺点，200字左右，语言贴合小学生认知]"\n' +
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
  const system = buildStrictPrompt();
  let user = body.content || '';
  if (ocrText) {
    user += (user ? '\n\n' : '') + ocrText;
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
        await log('Task started. Processing images...');

        let ocrText = '';
        let imageDataUrls = []; // Initialize outside to ensure scope visibility

        if ((body.imageDataUrls && body.imageDataUrls.length > 0) || (body.fileIds && body.fileIds.length > 0)) {
            const tempDir = path.resolve(__dirname, 'temp_uploads');
            try { fs.mkdirSync(tempDir, { recursive: true }); } catch(e) {}
            
            // Case A: Cloud Storage File IDs (New Way)
            if (body.fileIds && body.fileIds.length > 0) {
                await log(`Processing ${body.fileIds.length} Cloud Storage files...`);
                for (let i = 0; i < body.fileIds.length; i++) {
                    const fileID = body.fileIds[i];
                    await log(`Downloading file ${i+1}: ${fileID}`);
                    
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
                        await log(`Cloud Storage file deleted: ${fileID}`);
                    } catch (delErr) {
                        console.error('Failed to delete cloud file:', delErr);
                    }
                    
                    await log(`Image ${i+1}: Preprocessing (Python)...`);
                    const processedPath = await processImageWithPython(tempFilePath);
                    
                    const processedBuffer = fs.readFileSync(processedPath);
                    const base64 = processedBuffer.toString('base64');
                    imageDataUrls.push(`data:image/png;base64,${base64}`);
                }
            } 
            // Case B: Direct Base64 (Legacy Way)
            else if (body.imageDataUrls && body.imageDataUrls.length > 0) {
                for (let i = 0; i < body.imageDataUrls.length; i++) {
                    await log(`Processing image ${i+1}/${body.imageDataUrls.length}...`);
                    let dataUrl = body.imageDataUrls[i];
                    if (dataUrl.startsWith('data:image')) {
                        const matches = dataUrl.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
                        if (matches) {
                            const ext = matches[1];
                            const buffer = Buffer.from(matches[2], 'base64');
                            const tempFilePath = path.join(tempDir, `upload_${taskId}_${i}.${ext}`);
                            fs.writeFileSync(tempFilePath, buffer);
                            
                            await log(`Image ${i+1}: Preprocessing (Python)...`);
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
                await log(`Image ${i+1}: Recognizing Text (OCR)...`);
                const currentOcrText = await performBaiduOCR(imageDataUrls[i]);
                await log(`Image ${i+1}: OCR Finished (${currentOcrText ? currentOcrText.length : 0} chars)`);
                
                if (currentOcrText) {
                    ocrText += (ocrText ? '\n' : '') + currentOcrText;
                }
            }
        }

        await log('Calling AI for correction (this may take 1-2 minutes)...');
        
        // Fix scope issue: imageDataUrls was defined inside the 'if' block above
        // We need to access it here. If the 'if' block was skipped, it's undefined.
        // Or if it was defined with 'let' inside 'if', it's block scoped.
        // Checking lines 572-649, 'imageDataUrls' is defined at line 576 INSIDE the if(body.imageDataUrls ...) block.
        // Wait, line 572 checks body.imageDataUrls.
        // Actually, let's just initialize it outside.
        
        // Re-read context:
        // Line 572: if (body.imageDataUrls && body.imageDataUrls.length > 0)
        // Line 576: let imageDataUrls = [];
        // This is the problem. It is block scoped.
        
        // But wait, the frontend sends body.imageDataUrls even for fileIds fallback?
        // Let's make it robust.
        const finalPayload = {
             system: buildStrictPrompt(),
             user: (body.content || '') + (ocrText ? '\n\n' + ocrText : ''),
             imageDataUrls: imageDataUrls // The processed base64 images from the local variable
        };
        
        const result = await callDoubao(finalPayload);
        
        await log('AI processing complete.');
        
        // Use update with proper field replacement to avoid "Cannot create field in null" error
        // We don't use .set() because it would replace the entire document and lose logs
        await db.collection('correction_tasks').doc(taskId).update({
            status: 'completed',
            result: _.set(result) // Use _.set() command to replace the entire result field
        });
    } catch (e) {
        await log(`Error: ${e.message}`);
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