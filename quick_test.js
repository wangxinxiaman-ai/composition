const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com';

async function testUpload() {
    try {
        const testImage = path.join(__dirname, '作文测试', '作文1-1.png');
        
        if (!fs.existsSync(testImage)) {
            console.error('❌ 测试图片不存在:', testImage);
            return;
        }
        
        const fileSize = fs.statSync(testImage).size;
        console.log(`📁 测试图片大小: ${(fileSize / 1024).toFixed(2)} KB\n`);
        
        // 1. 上传图片
        console.log('⏱️  开始上传...');
        const uploadStart = Date.now();
        
        const formData = new FormData();
        formData.append('file', fs.createReadStream(testImage));
        
        const uploadRes = await axios.post(`${API_URL}/api/upload`, formData, {
            headers: formData.getHeaders(),
            timeout: 10000
        });
        
        const uploadId = uploadRes.data.uploadId;
        console.log(`✅ 获得 uploadId: ${uploadId} (${Date.now() - uploadStart}ms)\n`);
        
        // 2. 轮询上传状态
        console.log('⏱️  等待上传完成...');
        let status = 'pending';
        let attempts = 0;
        const maxAttempts = 20; // 最多等待10秒
        
        while (status === 'pending' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const statusRes = await axios.get(`${API_URL}/api/upload/${uploadId}`);
            status = statusRes.data.status;
            attempts++;
            
            if (status === 'completed') {
                const totalTime = Date.now() - uploadStart;
                console.log(`✅ 上传完成！总耗时: ${totalTime}ms`);
                console.log(`📦 fileID: ${statusRes.data.fileID}\n`);
                
                if (totalTime <= 5000) {
                    console.log('🎉 性能正常！（≤5秒）');
                } else {
                    console.log('⚠️  超时！应该≤5秒，实际用了', totalTime, 'ms');
                }
                return;
            } else if (status === 'failed') {
                console.error('❌ 上传失败:', statusRes.data.error);
                return;
            }
        }
        
        console.error(`❌ 上传超时！等待了 ${attempts * 0.5} 秒仍未完成`);
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        if (error.response) {
            console.error('服务器响应:', error.response.data);
        }
    }
}

testUpload();
