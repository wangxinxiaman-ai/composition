// Simulation environment for verification
const assert = require('assert');

// 1. Mock Browser Environment
global.FileReader = class FileReader {
    readAsDataURL(file) {
        setTimeout(() => {
            this.result = `data:image/png;base64,mockbase64data_${file.name}`;
            if (this.onload) this.onload();
        }, 10);
    }
};

// Mock Console and Debug Log
const logs = [];
function logDebug(msg, type = 'info') {
    logs.push(`[${type.toUpperCase()}] ${msg}`);
    console.log(`[${type.toUpperCase()}] ${msg}`);
}
global.console = {
    ...console,
    warn: (msg, e) => console.log(`[WARN] ${msg}`, e),
    error: (msg, e) => console.log(`[ERROR] ${msg}`, e)
};

// 2. Mock CloudBase App (Always Fails)
const app = {
    uploadFile: async () => {
        // Simulate Network Error with missing properties (common in CORS/Network issues)
        const err = new Error('Network Error');
        // err.code is undefined
        // err.name might be just 'Error'
        throw err;
    }
};

// 3. Mock Fetch (Verify Payload)
let submittedPayload = null;
global.fetch = async (url, options) => {
    if (url.includes('/api/correct')) {
        submittedPayload = JSON.parse(options.body);
        return {
            ok: true,
            json: async () => ({ taskId: 'mock_task_id' })
        };
    }
    return { ok: true };
};

// 4. Test Data
const students = [
    { name: 'Student1', images: [{ name: 'img1.png' }, { name: 'img2.png' }] }
];
const selected = '小学记叙文';
const API_BASE_URL = '';

// 5. The Exact Logic from home.html (Paste & Adapt)
async function runTest() {
    console.log('--- STARTING TEST ---');
    
    // Copy-pasted logic structure from home.html
    const promises = students.map(async (s, index) => {
        const sName = s.name || `学生 ${index + 1}`;
        logDebug(`准备处理: ${sName}`);
        
        try {
            let fileIDs = [];
            let fallbackDataUrls = []; // Define here to capture fallbacks
            
            // Upload images to Cloud Storage
            if (app) {
                try {
                    fileIDs = await Promise.all(s.images.map(async (f, imgIdx) => {
                        const cloudPath = `uploads/${Date.now()}_${index}_${imgIdx}_${f.name}`;
                        logDebug(`[${sName}] 上传图片 ${imgIdx + 1}/${s.images.length}...`);
                        
                        // Retry mechanism
                        let lastError;
                        for(let i=0; i<3; i++) {
                            try {
                                const res = await app.uploadFile({
                                    cloudPath: cloudPath,
                                    filePath: f
                                });
                                return res.fileID;
                            } catch(e) {
                                lastError = e;
                                console.error(`[${sName}] Upload failed (attempt ${i+1}/3). Details:`, e);
                                logDebug(`[${sName}] 上传失败详情: ${e.name || 'Error'} - ${e.message} (Code: ${e.code || 'N/A'})`, 'error');
                                await new Promise(r => setTimeout(r, 100)); // Fast timeout for test
                            }
                        }
                        throw lastError || new Error('Upload failed after retries');
                    }));
                    logDebug(`[${sName}] 图片上传完成，共 ${fileIDs.length} 张`);
                } catch (uploadErr) {
                    // SDK 上传彻底失败，降级为 Base64
                    logDebug(`[${sName}] SDK 上传失败 (${uploadErr.message})，正在降级使用 Base64 传输...`, 'warn');
                    const dataUrls = await Promise.all(s.images.map(f => new Promise((resolve) => { 
                        const r = new FileReader(); 
                        r.onload = () => resolve(r.result); 
                        r.readAsDataURL(f); 
                    })));
                    fallbackDataUrls = dataUrls;
                    fileIDs = []; // Clear fileIDs as we are using base64
                }
            } else {
                 // SDK not loaded Fallback logic... (omitted for this test case as app exists)
            }

            const payload = { 
                choice: selected, 
                title: '', 
                studentName: sName, 
                fileIds: fileIDs, 
                imageDataUrls: fallbackDataUrls.length > 0 ? fallbackDataUrls : []
            };
            
            // Submit Task logic...
            const apiUrl = '/api/correct';
            // Simplified submit for test
            await fetch(apiUrl, { 
                method:'POST', 
                headers:{ 'Content-Type':'application/json' }, 
                body: JSON.stringify(payload) 
            });
            
        } catch (err) {
            console.error('Process failed:', err);
        }
    });

    await Promise.all(promises);
    
    console.log('--- TEST FINISHED ---');
    
    // Assertions
    console.log('\n--- VERIFICATION ---');
    if (submittedPayload && submittedPayload.imageDataUrls && submittedPayload.imageDataUrls.length === 2) {
        console.log('✅ SUCCESS: Payload contains 2 Base64 images.');
        console.log('Sample Data URL:', submittedPayload.imageDataUrls[0]);
    } else {
        console.error('❌ FAILED: Payload missing Base64 images.', submittedPayload);
        process.exit(1);
    }
    
    if (submittedPayload.fileIds.length === 0) {
        console.log('✅ SUCCESS: fileIds is empty (correctly fell back).');
    } else {
        console.error('❌ FAILED: fileIds should be empty.', submittedPayload.fileIds);
        process.exit(1);
    }
    
    const hasWarnLog = logs.some(l => l.includes('SDK 上传失败') && l.includes('降级使用 Base64'));
    if (hasWarnLog) {
        console.log('✅ SUCCESS: Logged warning about fallback.');
    } else {
        console.error('❌ FAILED: Missing warning log.');
        process.exit(1);
    }
}

runTest();
