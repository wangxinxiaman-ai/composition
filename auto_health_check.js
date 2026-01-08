// 自动健康检查 - 每30秒测试一次，直到成功
const https = require('https');

const BASE_URL = 'https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com';
const MAX_RETRIES = 10; // 最多重试10次（5分钟）
const RETRY_INTERVAL = 30000; // 30秒

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

function testEndpoint(path, timeout = 10000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const url = `${BASE_URL}${path}`;
        
        const req = https.get(url, { timeout }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const duration = Date.now() - startTime;
                try {
                    const json = JSON.parse(data);
                    resolve({ 
                        success: true, 
                        status: res.statusCode, 
                        data: json, 
                        duration 
                    });
                } catch (e) {
                    resolve({ 
                        success: res.statusCode === 200, 
                        status: res.statusCode, 
                        data, 
                        duration 
                    });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ 
                success: false, 
                error: err.message, 
                duration: Date.now() - startTime 
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ 
                success: false, 
                error: 'timeout', 
                duration: Date.now() - startTime 
            });
        });
    });
}

async function checkHealth() {
    log(colors.cyan, '='.repeat(60));
    log(colors.cyan, '开始健康检查...');
    
    const result = await testEndpoint('/health', 10000);
    
    if (result.success && result.status === 200) {
        log(colors.green, `✓ /health 端点正常 (${result.duration}ms)`);
        console.log(JSON.stringify(result.data, null, 2));
        return true;
    } else {
        log(colors.red, `✗ /health 失败 - Status: ${result.status || 'N/A'}, Error: ${result.error || 'Unknown'}`);
        return false;
    }
}

async function checkDatabase() {
    log(colors.cyan, '测试数据库连接...');
    
    const result = await testEndpoint('/api/test-db', 35000);
    
    if (result.success) {
        log(colors.green, `✓ 数据库测试通过 (${result.duration}ms)`);
        console.log(JSON.stringify(result.data, null, 2));
        return true;
    } else {
        log(colors.red, `✗ 数据库测试失败 - Error: ${result.error || 'Unknown'}`);
        return false;
    }
}

async function runAutoCheck() {
    log(colors.blue, '🚀 自动健康检查启动');
    log(colors.blue, `最多尝试 ${MAX_RETRIES} 次，每次间隔 ${RETRY_INTERVAL/1000} 秒`);
    log(colors.blue, '='.repeat(60));
    
    for (let i = 1; i <= MAX_RETRIES; i++) {
        log(colors.yellow, `\n第 ${i}/${MAX_RETRIES} 次检查`);
        
        const healthOk = await checkHealth();
        
        if (healthOk) {
            log(colors.green, '\n✓✓✓ 服务已完全启动！');
            
            // 额外测试数据库
            await checkDatabase();
            
            log(colors.green, '\n='.repeat(60));
            log(colors.green, '🎉 所有检查完成！服务可以使用了');
            log(colors.green, '='.repeat(60));
            process.exit(0);
        }
        
        if (i < MAX_RETRIES) {
            log(colors.yellow, `等待 ${RETRY_INTERVAL/1000} 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
        }
    }
    
    log(colors.red, '\n✗✗✗ 超过最大重试次数，服务可能存在问题');
    log(colors.red, '请检查 CloudRun 控制台日志：');
    log(colors.cyan, 'https://tcb.cloud.tencent.com/dev?envId=cloud1-0gh78mpy39eccc0f#/platform-run');
    process.exit(1);
}

runAutoCheck().catch(err => {
    log(colors.red, '脚本错误:', err);
    process.exit(1);
});
