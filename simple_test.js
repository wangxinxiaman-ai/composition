const axios = require('axios');

const API_BASE = 'https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com';

async function test() {
    console.log('简单连接测试...\n');
    
    // 测试1: 健康检查
    console.log('【测试1】GET /');
    try {
        const res = await axios.get(API_BASE, { timeout: 5000 });
        console.log('✅ 状态码:', res.status);
        console.log('✅ 响应:', res.data.substring(0, 100) + '...');
    } catch (e) {
        console.log('❌ 失败:', e.message);
    }
    
    // 测试2: 查询任务状态（使用已知的任务ID）
    console.log('\n【测试2】GET /api/task/:id (使用旧任务ID)');
    try {
        const res = await axios.get(`${API_BASE}/api/task/1767793166490prs2n`, { timeout: 5000 });
        console.log('✅ 状态码:', res.status);
        console.log('✅ 任务状态:', res.data.status);
        console.log('✅ 日志数量:', res.data.logs.length);
    } catch (e) {
        console.log('❌ 失败:', e.message);
        if (e.response) {
            console.log('   响应码:', e.response.status);
            console.log('   响应数据:', e.response.data);
        }
    }
    
    // 测试3: 提交小任务
    console.log('\n【测试3】POST /api/correct (提交小图片)');
    const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    try {
        const res = await axios.post(`${API_BASE}/api/correct`, {
            imageDataUrls: [tiny],
            studentName: '测试',
            choice: '小学记叙文（含散文、日记）'
        }, { timeout: 15000 });
        console.log('✅ 状态码:', res.status);
        console.log('✅ 任务ID:', res.data.taskId);
        console.log('✅ 状态:', res.data.status);
    } catch (e) {
        console.log('❌ 失败:', e.message);
        if (e.response) {
            console.log('   响应码:', e.response.status);
            console.log('   响应数据:', e.response.data);
        }
    }
}

test();
