const axios = require('axios');
const fs = require('fs');
const path = require('path');

// CloudRun Service Configuration
const ENV_ID = 'cloud1-0gh78mpy39eccc0f';
const SERVICE_NAME = 'composition-backend';
const REGION = 'ap-shanghai';
const RUN_DOMAIN = `${SERVICE_NAME}-${ENV_ID}.${REGION}.run.tcloudbase.com`;

const API_BASE = `https://${RUN_DOMAIN}`;
const API_UPLOAD = `${API_BASE}/api/upload`;
const API_UPLOAD_STATUS = `${API_BASE}/api/upload/`;
const API_CORRECT = `${API_BASE}/api/correct`;
const API_TASK = `${API_BASE}/api/task/`;

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 AI作文批改系统 - 完整端到端测试');
console.log('═══════════════════════════════════════════════════════');
console.log(`🎯 目标服务: ${RUN_DOMAIN}`);
console.log('');

// 读取测试图片并转换为 base64
function imageToBase64(filePath) {
    const imageBuffer = fs.readFileSync(filePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
}

// 模拟文件上传（使用 multipart/form-data）
async function uploadImage(filePath) {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    
    try {
        const res = await axios.post(API_UPLOAD, form, {
            headers: form.getHeaders(),
            timeout: 30000
        });
        return res.data;
    } catch (error) {
        console.error('❌ 上传失败:', error.message);
        throw error;
    }
}

// 轮询上传状态
async function pollUploadStatus(uploadId, maxAttempts = 20) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await axios.get(`${API_UPLOAD_STATUS}${uploadId}`, { timeout: 5000 });
            const status = res.data.status;
            
            if (status === 'completed') {
                return res.data.fileID;
            } else if (status === 'error') {
                throw new Error(`Upload error: ${res.data.error}`);
            }
            
            // 继续等待
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            if (error.response && error.response.status === 404) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Upload timeout after 20 seconds');
}

// 提交批改任务
async function submitCorrection(fileIds, studentName, choice) {
    try {
        const payload = {
            fileIds: fileIds,
            studentName: studentName,
            choice: choice
        };
        
        const res = await axios.post(API_CORRECT, payload, { timeout: 10000 });
        return res.data.taskId;
    } catch (error) {
        console.error('❌ 提交任务失败:', error.message);
        throw error;
    }
}

// 轮询批改结果
async function pollTaskResult(taskId, maxAttempts = 120) {
    console.log(`📊 开始轮询任务状态 (最多${maxAttempts}次，每次间隔3秒)...`);
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await axios.get(`${API_TASK}${taskId}`, { timeout: 10000 });
            const task = res.data;
            
            console.log(`   [${i + 1}/${maxAttempts}] 状态: ${task.status}`);
            
            if (task.logs && task.logs.length > 0) {
                const latestLog = task.logs[task.logs.length - 1];
                console.log(`   最新日志: ${latestLog}`);
            }
            
            if (task.status === 'completed') {
                console.log('✅ 任务完成！');
                return task;
            } else if (task.status === 'error') {
                throw new Error(`Task error: ${task.error}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            if (error.response && error.response.status === 504) {
                console.log(`   ⚠️  数据库查询超时（504），重试中...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Task timeout after 6 minutes');
}

// 验证批改结果
function validateResult(result) {
    console.log('\n📝 验证批改结果...');
    
    if (!result) {
        throw new Error('结果为空');
    }
    
    const checks = [
        { name: '综合评分', value: result.综合评分, type: 'number' },
        { name: '主要优点', value: result.主要优点, type: 'array' },
        { name: '主要问题', value: result.主要问题, type: 'array' },
        { name: '改进建议', value: result.改进建议, type: 'array' },
        { name: '综合评语', value: result.综合评语, type: 'string' }
    ];
    
    let passed = 0;
    let failed = 0;
    
    checks.forEach(check => {
        const exists = check.value !== undefined && check.value !== null;
        const typeMatch = exists && (
            (check.type === 'array' && Array.isArray(check.value)) ||
            (check.type === 'string' && typeof check.value === 'string') ||
            (check.type === 'number' && typeof check.value === 'number')
        );
        
        if (exists && typeMatch) {
            console.log(`   ✅ ${check.name}: 正常 (${check.type})`);
            passed++;
        } else {
            console.log(`   ❌ ${check.name}: 缺失或类型错误`);
            failed++;
        }
    });
    
    console.log(`\n   通过: ${passed}/${checks.length}, 失败: ${failed}/${checks.length}`);
    
    if (failed > 0) {
        throw new Error('批改结果验证失败');
    }
}

// 主测试流程
async function runFullTest() {
    const testImage = path.join(__dirname, '作文测试', '作文1-1.png');
    
    if (!fs.existsSync(testImage)) {
        console.error('❌ 测试图片不存在:', testImage);
        return;
    }
    
    const startTime = Date.now();
    
    try {
        // 步骤1: 上传图片
        console.log('【步骤1】上传图片到云存储');
        console.log(`   图片路径: ${testImage}`);
        console.log(`   文件大小: ${(fs.statSync(testImage).size / 1024).toFixed(2)} KB`);
        
        const uploadResult = await uploadImage(testImage);
        console.log(`   ✅ 上传ID: ${uploadResult.uploadId}`);
        
        // 步骤2: 轮询上传状态
        console.log('\n【步骤2】等待云存储上传完成');
        const fileID = await pollUploadStatus(uploadResult.uploadId);
        console.log(`   ✅ 云存储ID: ${fileID}`);
        
        // 步骤3: 提交批改任务
        console.log('\n【步骤3】提交批改任务');
        const taskId = await submitCorrection(
            [fileID],
            '测试学生',
            '小学记叙文（含散文、日记）'
        );
        console.log(`   ✅ 任务ID: ${taskId}`);
        
        // 步骤4: 轮询批改结果
        console.log('\n【步骤4】等待批改完成（预计1-2分钟）');
        const task = await pollTaskResult(taskId);
        
        // 步骤5: 验证结果
        console.log('\n【步骤5】验证批改结果');
        validateResult(task.result);
        
        // 步骤6: 显示完整结果
        console.log('\n【步骤6】批改结果详情');
        console.log('─────────────────────────────────────────────────────');
        console.log(JSON.stringify(task.result, null, 2));
        console.log('─────────────────────────────────────────────────────');
        
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n✅ 测试完成！总耗时: ${totalTime}秒`);
        
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('🎉 全部测试通过！系统运行正常！');
        console.log('═══════════════════════════════════════════════════════');
        
    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        console.error('\n完整错误:', error);
        
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n测试中断，已耗时: ${totalTime}秒`);
        process.exit(1);
    }
}

// 运行测试
runFullTest();
