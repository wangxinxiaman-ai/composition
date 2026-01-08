const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com';

async function testUpload() {
    console.log('=== 开始上传测试 ===\n');
    
    try {
        // 1. 测试服务可达性
        console.log('1️⃣ 测试服务状态...');
        const healthRes = await axios.get(`${API_BASE}/`, { timeout: 5000 });
        console.log('✅ 服务在线\n');
        
        // 2. 准备测试图片（使用正常作文图片）
        const testImage = path.join(__dirname, '作文测试', '作文1-1.png');
        if (!fs.existsSync(testImage)) {
            throw new Error('测试图片不存在: ' + testImage);
        }
        
        const fileSize = fs.statSync(testImage).size;
        console.log(`2️⃣ 准备上传图片: ${path.basename(testImage)}`);
        console.log(`   文件大小: ${(fileSize / 1024).toFixed(2)} KB\n`);
        
        // 3. 上传图片
        console.log('3️⃣ 开始上传...');
        const form = new FormData();
        form.append('file', fs.createReadStream(testImage));
        
        const uploadStartTime = Date.now();
        const uploadRes = await axios.post(`${API_BASE}/api/upload`, form, {
            headers: form.getHeaders(),
            timeout: 10000 // 10秒超时
        });
        
        const uploadDuration = Date.now() - uploadStartTime;
        console.log(`✅ 上传请求成功 (${uploadDuration}ms)`);
        console.log(`   uploadId: ${uploadRes.data.uploadId}`);
        console.log(`   status: ${uploadRes.data.status}\n`);
        
        const uploadId = uploadRes.data.uploadId;
        
        // 4. 轮询上传状态（最多等待60秒）
        console.log('4️⃣ 等待CloudBase上传完成...');
        let uploadComplete = false;
        let attempts = 0;
        const maxAttempts = 30; // 30次 * 2秒 = 60秒
        
        while (!uploadComplete && attempts < maxAttempts) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 2000)); // 每2秒查询一次
            
            try {
                const statusRes = await axios.get(`${API_BASE}/api/upload/${uploadId}`, {
                    timeout: 5000
                });
                
                const status = statusRes.data;
                console.log(`   [尝试 ${attempts}/${maxAttempts}] status: ${status.status}, age: ${(status.age / 1000).toFixed(1)}s`);
                
                if (status.status === 'completed') {
                    uploadComplete = true;
                    console.log(`✅ 上传成功！`);
                    console.log(`   fileID: ${status.fileID}\n`);
                    return { success: true, fileID: status.fileID };
                } else if (status.status === 'failed') {
                    console.error(`❌ 上传失败: ${status.error}\n`);
                    return { success: false, error: status.error };
                }
            } catch (e) {
                console.error(`   [尝试 ${attempts}] 查询失败: ${e.message}`);
            }
        }
        
        // 超时
        console.error(`❌ 上传超时（等待了 ${attempts * 2} 秒）\n`);
        return { success: false, error: 'Upload timeout' };
        
    } catch (e) {
        console.error('❌ 测试失败:', e.message);
        if (e.response) {
            console.error('   响应状态:', e.response.status);
            console.error('   响应数据:', e.response.data);
        }
        return { success: false, error: e.message };
    }
}

// 运行测试
testUpload().then(result => {
    console.log('=== 测试完成 ===');
    console.log('结果:', result);
    process.exit(result.success ? 0 : 1);
});
