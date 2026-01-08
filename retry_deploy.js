// 简单的重试部署脚本
const colors = {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

function log(color, ...args) {
    console.log(color + `[${new Date().toLocaleTimeString()}] ` + args.join(' ') + colors.reset);
}

async function wait(seconds) {
    log(colors.yellow, `等待 ${seconds} 秒...`);
    for (let i = seconds; i > 0; i--) {
        if (i % 10 === 0 || i <= 5) {
            process.stdout.write(`\r${colors.cyan}倒计时: ${i}秒${colors.reset}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log();
    log(colors.green, '等待完成');
}

wait(60).then(() => {
    log(colors.green, '✓ 现在可以重新部署了');
    log(colors.cyan, '请告诉我："继续部署"');
});
