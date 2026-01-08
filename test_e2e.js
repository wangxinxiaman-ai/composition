const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Domain from `npx tcb env:domain:list`
// Note: CloudRun service usually maps to the root or a sub-path. 
// We'll try the service name as a path first, as that's common for default gateways.
// Or try the direct service domain if we can guess it.
const ENV_ID = 'cloud1-0gh78mpy39eccc0f';
const BASE_DOMAIN = 'cloud1-0gh78mpy39eccc0f-1376977951.tcloudbaseapp.com';
const SERVICE_NAME = 'composition-backend';

// Construct URL (Try Cloud Run Default Domain pattern)
// Pattern: https://<service_name>-<env_id>.<region>.run.tcloudbase.com
const REGION = 'ap-shanghai';
const RUN_DOMAIN = `${SERVICE_NAME}-${ENV_ID}.${REGION}.run.tcloudbase.com`;

const API_URL = `https://${RUN_DOMAIN}/api/correct`;
const POLL_URL_BASE = `https://${RUN_DOMAIN}/api/task/`;

console.log('🚀 Starting End-to-End Test');
console.log(`🎯 Target API: ${API_URL}`);

// Create a small 1x1 pixel red dot base64 PNG for testing
const SAMPLE_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function test() {
    try {
        console.log('1️⃣  Submitting Task...');
        const payload = {
            imageDataUrls: [SAMPLE_IMAGE],
            choice: "小学记叙文（含散文、日记）",
            studentName: "TestBot"
        };

        const res = await axios.post(API_URL, payload, {
            timeout: 10000 // 10s timeout
        });

        if (res.status !== 200) {
            throw new Error(`Submit failed with status ${res.status}: ${JSON.stringify(res.data)}`);
        }

        const taskId = res.data.taskId;
        console.log(`✅ Submit Success! Task ID: ${taskId}`);
        console.log(`   Initial Status: ${res.data.status}`);

        console.log('2️⃣  Polling for Result...');
        
        let attempts = 0;
        const maxAttempts = 20;
        
        const poll = setInterval(async () => {
            attempts++;
            try {
                const pollRes = await axios.get(POLL_URL_BASE + taskId);
                const task = pollRes.data;
                console.log(`   [${attempts}/${maxAttempts}] Status: ${task.status}`);
                
                if (task.logs && task.logs.length > 0) {
                    console.log(`      Latest Log: ${task.logs[task.logs.length - 1]}`);
                }

                if (task.status === 'completed') {
                    clearInterval(poll);
                    console.log('✅ Task Completed Successfully!');
                    console.log('🎉 Result Summary:', JSON.stringify(task.result).substring(0, 100) + '...');
                    process.exit(0);
                } else if (task.status === 'error') {
                    clearInterval(poll);
                    console.error('❌ Task Failed:', task.error);
                    process.exit(1);
                }

                if (attempts >= maxAttempts) {
                    clearInterval(poll);
                    console.error('⚠️  Polling Timeout');
                    process.exit(1);
                }
            } catch (e) {
                console.error('   Polling Error:', e.message);
            }
        }, 3000);

    } catch (e) {
        console.error('🔥 Fatal Error:', e.message);
        if (e.response) {
            console.error('   Response Data:', e.response.data);
        }
        process.exit(1);
    }
}

test();
