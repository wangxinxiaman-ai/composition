const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_BASE = 'http://localhost:3000';

console.log('🧪 本地完整批改测试\n');

async function testFullWorkflow() {
    try {
        // 1. 测试上传
        console.log('1️⃣  上传测试图片...');
        const testImage = path.join(__dirname, '作文测试', '作文1-1.png');
        
        const form = new FormData();
        form.append('file', fs.createReadStream(testImage));
        
        const uploadRes = await axios.post(`${API_BASE}/api/upload`, form, {
            headers: form.getHeaders(),
            timeout: 30000
        });
        
        const uploadId = uploadRes.data.uploadId;
        console.log(`✅ 上传排队: ${uploadId}`);
        
        // 2. 等待上传完成
        console.log('2️⃣  等待上传完成...');
        let fileID = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const statusRes = await axios.get(`${API_BASE}/api/upload/${uploadId}`);
            console.log(`   状态: ${statusRes.data.status}`);
            
            if (statusRes.data.status === 'completed') {
                fileID = statusRes.data.fileID;
                console.log(`✅ 上传完成: ${fileID}`);
                break;
            } else if (statusRes.data.status === 'failed') {
                throw new Error(`上传失败: ${statusRes.data.error}`);
            }
        }
        
        if (!fileID) {
            throw new Error('上传超时');
        }
        
        // 3. 提交批改任务
        console.log('3️⃣  提交批改任务...');
        const correctRes = await axios.post(`${API_BASE}/api/correct`, {
            fileIds: [fileID],
            choice: "小学记叙文（含散文、日记）",
            studentName: "测试学生"
        }, {
            timeout: 10000
        });
        
        const taskId = correctRes.data.taskId;
        console.log(`✅ 任务创建: ${taskId}`);
        
        // 4. 轮询任务状态
        console.log('4️⃣  等待批改完成...');
        for (let i = 0; i < 60; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const taskRes = await axios.get(`${API_BASE}/api/task/${taskId}`);
            const task = taskRes.data;
            
            console.log(`   [${i+1}/60] 状态: ${task.status}`);
            if (task.logs && task.logs.length > 0) {
                console.log(`   最新日志: ${task.logs[task.logs.length - 1]}`);
            }
            
            if (task.status === 'completed') {
                console.log('\n✅ 批改完成！');
                console.log('📊 结果预览:', JSON.stringify(task.result).substring(0, 200) + '...');
                return;
            } else if (task.status === 'error') {
                throw new Error(`批改失败: ${task.error}`);
            }
        }
        
        throw new Error('批改超时（2分钟）');
        
    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);
        if (error.response) {
            console.error('响应状态:', error.response.status);
            console.error('响应数据:', error.response.data);
        }
        process.exit(1);
    }
}

testFullWorkflow();
