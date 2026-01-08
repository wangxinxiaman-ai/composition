// 服务诊断工具 - 测试 CloudRun 服务状态
const https = require('https');

const BASE_URL = 'https://composition-backend-199064-5-1376977951.sh.run.tcloudbase.com';

// 颜色输出
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(color, ...args) {
    console.log(color + args.join(' ') + colors.reset);
}

// 发送 HTTP 请求
function testEndpoint(path, timeout = 10000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const url = `${BASE_URL}${path}`;
        
        log(colors.blue, `\n[${new Date().toLocaleTimeString()}] Testing:`, url);
        
        const req = https.get(url, { timeout }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const duration = Date.now() - startTime;
                try {
                    const json = JSON.parse(data);
                    log(colors.green, `✓ Success (${duration}ms) - Status: ${res.statusCode}`);
                    console.log(JSON.stringify(json, null, 2));
                    resolve({ success: true, status: res.statusCode, data: json, duration });
                } catch (e) {
                    log(colors.yellow, `⚠ Response (${duration}ms) - Status: ${res.statusCode}`);
                    console.log(data.substring(0, 500));
                    resolve({ success: false, status: res.statusCode, data, duration });
                }
            });
        });

        req.on('error', (err) => {
            const duration = Date.now() - startTime;
            log(colors.red, `✗ Error (${duration}ms):`, err.message);
            resolve({ success: false, error: err.message, duration });
        });

        req.on('timeout', () => {
            req.destroy();
            const duration = Date.now() - startTime;
            log(colors.red, `✗ Timeout (${duration}ms)`);
            resolve({ success: false, error: 'timeout', duration });
        });
    });
}

// 主测试流程
async function runTests() {
    log(colors.blue, '='.repeat(60));
    log(colors.blue, 'CloudRun 服务诊断测试');
    log(colors.blue, '='.repeat(60));
    
    const tests = [
        { name: '1. Health Check', path: '/health', timeout: 10000 },
        { name: '2. Database Test', path: '/api/test-db', timeout: 35000 },
        { name: '3. Root Path', path: '/', timeout: 10000 }
    ];

    for (const test of tests) {
        log(colors.yellow, `\n${test.name}`);
        await testEndpoint(test.path, test.timeout);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
    }

    log(colors.blue, '\n' + '='.repeat(60));
    log(colors.blue, '测试完成');
    log(colors.blue, '='.repeat(60));
}

// 运行测试
runTests().catch(err => {
    log(colors.red, 'Test runner error:', err);
    process.exit(1);
});
