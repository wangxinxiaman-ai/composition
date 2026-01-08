const tcb = require('@cloudbase/node-sdk');
const config = require('./cloudbaserc.json');

const app = tcb.init({
    env: config.envId
});

const db = app.database();

async function checkTask() {
    try {
        const taskId = '17677813852792iyrr';
        console.log(`Checking task ${taskId}...`);
        const res = await db.collection('correction_tasks').doc(taskId).get();
        if (res.data && res.data.length > 0) {
            console.log('Task found:');
            console.log(JSON.stringify(res.data[0], null, 2));
        } else {
            console.log('Task not found.');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

checkTask();
