const tcb = require('@cloudbase/node-sdk');
const fs = require('fs');
const path = require('path');

// Try to load local config if available, otherwise use defaults
let config = {};
try {
    config = require('./cloudbaserc.json');
} catch (e) {}

const app = tcb.init({
    env: 'cloud1-0gh78mpy39eccc0f' // Hardcoded from user's env
});

const db = app.database();

async function checkTaskStatus(taskId) {
    console.log(`🔍 Checking Task ID: ${taskId}`);
    try {
        const res = await db.collection('correction_tasks').doc(taskId).get();
        if (res.data && res.data.length > 0) {
            const task = res.data[0];
            console.log('✅ Task Found!');
            console.log('----------------------------------------');
            console.log(`Status: ${task.status}`);
            console.log(`Start Time: ${new Date(task.startTime).toLocaleString()}`);
            
            if (task.error) {
                console.error(`❌ Error: ${task.error}`);
            }
            
            if (task.logs && task.logs.length > 0) {
                console.log('📜 Execution Logs:');
                task.logs.forEach(log => console.log(`   ${log}`));
            } else {
                console.log('⚠️ No logs found (Process might have crashed before logging)');
            }
            
            if (task.result) {
                console.log('----------------------------------------');
                console.log('🎉 Result Summary:');
                console.log(`   Score: ${task.result['总分']}`);
                console.log(`   Review: ${task.result['综合评价'] ? task.result['综合评价'].substring(0, 50) + '...' : 'N/A'}`);
            }
        } else {
            console.log('❌ Task not found in database. It might not have been created yet.');
        }
    } catch (e) {
        console.error('🔥 Failed to query database:', e.message);
        console.log('Hint: Ensure you have TCB_SECRET_ID and TCB_SECRET_KEY env vars set locally if running outside CloudBase.');
    }
}

// Run for the specific task ID provided by user
checkTaskStatus('1767782468092pw739');
