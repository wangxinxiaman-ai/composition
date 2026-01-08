const tcb = require('@cloudbase/node-sdk');
const fs = require('fs');
const path = require('path');

console.log('=== CloudBase SDK 诊断 ===\n');

// 初始化 CloudBase（需要密钥，本地环境无法测试）
console.log('❌ 本地环境缺少 CloudBase 认证密钥！');
console.log('这个测试只能在 CloudRun 容器内运行。\n');
console.log('请使用浏览器直接测试：');
console.log('https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com\n');
process.exit(1);

async function testUpload() {
    try {
        // 准备测试文件
        const testFile = path.join(__dirname, '作文测试', '作文1-1.png');
        const buffer = fs.readFileSync(testFile);
        
        console.log(`2️⃣ 准备上传文件: ${path.basename(testFile)}`);
        console.log(`   文件大小: ${(buffer.length / 1024).toFixed(2)} KB\n`);
        
        // 测试上传
        console.log('3️⃣ 开始上传到 CloudBase 存储...');
        const startTime = Date.now();
        
        const cloudPath = `test/${Date.now()}-test.png`;
        
        const result = await tcbApp.uploadFile({
            cloudPath: cloudPath,
            fileContent: buffer
        });
        
        const duration = Date.now() - startTime;
        
        console.log(`✅ 上传成功！耗时: ${duration}ms`);
        console.log(`   fileID: ${result.fileID}`);
        console.log(`   cloudPath: ${cloudPath}\n`);
        
        return { success: true, fileID: result.fileID, duration };
        
    } catch (e) {
        console.error('❌ 上传失败:', e.message);
        console.error('错误详情:', e);
        return { success: false, error: e.message };
    }
}

testUpload().then(result => {
    console.log('=== 诊断完成 ===');
    console.log('结果:', result);
    process.exit(result.success ? 0 : 1);
});
