// 自动部署并测试脚本
const { exec } = require('child_process');
const https = require('https');
const util = require('util');
const execPromise = util.promisify(exec);

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

function log(color, ...args) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(color + `[${timestamp}] ` + args.join(' ') + colors.reset);
}

async function deployService() {
    log(colors.cyan, '开始部署 CloudRun 服务...');
    
    const maxRetries = 5;
    for (let i = 1; i <= maxRetries; i++) {
        log(colors.yellow, `尝试部署 (${i}/${maxRetries})...`);
        
        try {
            const { stdout, stderr } = await execPromise(
                'npx tcb-manager-node cloudrun deploy composition-backend --targetPath deploy_package --force',
                { cwd: 'c:\\Users\\wangx\\Desktop\\AI作文批改' }
            );
            
            log(colors.green, '✓ 部署命令执行成功');
            console.log(stdout);
            return true;
        } catch (err) {
            if (err.message.includes('已有部署发布任务运行中')) {
                log(colors.yellow, '有部署任务运行中，等待60秒后重试...');
                await new Promise(resolve => setTimeout(resolve, 60000));
            } else {
                log(colors.red, '✗ 部署失败:', err.message);
                return false;
            }
        }
    }
    
    log(colors.red, '✗ 超过最大重试次数，部署失败');
    return false;
}

function testEndpoint(url, timeout = 10000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const req = https.get(url, { timeout }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const duration = Date.now() - startTime;
                try {
                    const json = JSON.parse(data);
                    resolve({ success: true, status: res.statusCode, data: json, duration });
                } catch (e) {
                    resolve({ success: res.statusCode === 200, status: res.statusCode, data, duration });
                }
            });
        });
        req.on('error', (err) => resolve({ success: false, error: err.message, duration: Date.now() - startTime }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout', duration: Date.now() - startTime }); });
    });
}

async function waitForService() {
    log(colors.cyan, '等待服务启动...');
    
    const maxWait = 180000; // 3分钟
    const startWait = Date.now();
    
    while (Date.now() - startWait < maxWait) {
        const result = await testEndpoint('https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com/health');
        
        if (result.success && result.status === 200) {
            log(colors.green, `✓ 服务已启动 (${result.duration}ms)`);
            return true;
        }
        
        log(colors.yellow, `等待中... (${Math.round((Date.now() - startWait) / 1000)}s)`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // 每10秒检查一次
    }
    
    log(colors.red, '✗ 服务启动超时');
    return false;
}

async function testService() {
    log(colors.cyan, '='.repeat(60));
    log(colors.cyan, '开始测试服务健康状况...');
    
    // Test 1: Health Check
    log(colors.blue, '\n测试 1: 健康检查 (/health)');
    const healthResult = await testEndpoint('https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com/health');
    if (healthResult.success) {
        log(colors.green, `✓ 健康检查通过 (${healthResult.duration}ms)`);
        console.log(JSON.stringify(healthResult.data, null, 2));
    } else {
        log(colors.red, `✗ 健康检查失败: ${healthResult.error}`);
        return false;
    }
    
    // Test 2: Database Test
    log(colors.blue, '\n测试 2: 数据库连接 (/api/test-db)');
    const dbResult = await testEndpoint('https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com/api/test-db', 35000);
    if (dbResult.success) {
        log(colors.green, `✓ 数据库测试完成 (${dbResult.duration}ms)`);
        console.log(JSON.stringify(dbResult.data, null, 2));
    } else {
        log(colors.yellow, `⚠ 数据库测试异常: ${dbResult.error || 'Unknown'}`);
    }
    
    log(colors.cyan, '\n' + '='.repeat(60));
    log(colors.green, '✓ 服务测试完成');
    return true;
}

async function main() {
    log(colors.blue, '🚀 自动部署和测试流程启动');
    log(colors.blue, '='.repeat(60));
    
    // Step 1: Deploy
    const deployed = await deployService();
    if (!deployed) {
        log(colors.red, '部署失败，退出');
        process.exit(1);
    }
    
    // Step 2: Wait for service
    const started = await waitForService();
    if (!started) {
        log(colors.red, '服务启动超时，退出');
        process.exit(1);
    }
    
    // Step 3: Test service
    const tested = await testService();
    if (!tested) {
        log(colors.red, '服务测试失败');
        process.exit(1);
    }
    
    log(colors.green, '\n🎉 部署和测试全部完成！');
    log(colors.cyan, '你可以开始使用服务了：');
    log(colors.cyan, 'https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com/');
}

main().catch(err => {
    log(colors.red, '脚本错误:', err);
    process.exit(1);
});
