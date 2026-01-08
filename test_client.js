const http = require('http');

async function testConnection() {
    console.log('Testing connection to http://localhost:3001/api/correct...');
    
    // Create a minimal dummy payload
    const payload = JSON.stringify({
        title: "Test Essay",
        studentName: "Test Student",
        choice: "小学记叙文",
        imageDataUrls: [] // Empty for basic connection test
    });

    const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/correct',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            console.log(`STATUS: ${res.statusCode}`);
            console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
            
            let rawData = '';
            let receivedHeartbeats = 0;

            res.setEncoding('utf8');
            
            res.on('data', (chunk) => {
                console.log(`RECEIVED CHUNK (${chunk.length} chars): ${chunk.substring(0, 50).replace(/\n/g, '\\n')}...`);
                rawData += chunk;
                if (chunk.includes('<!-- h -->')) {
                    receivedHeartbeats++;
                }
            });

            res.on('end', () => {
                console.log('No more data in response.');
                console.log(`Total Heartbeats: ${receivedHeartbeats}`);
                
                // Try to extract JSON using the same regex as frontend
                const match = rawData.match(/___JSON_START___([\s\S]*?)___JSON_END___/);
                if (match && match[1]) {
                    try {
                        const json = JSON.parse(match[1]);
                        console.log('SUCCESS: JSON parsed correctly:', JSON.stringify(json).substring(0, 100) + '...');
                        resolve(true);
                    } catch (e) {
                        console.error('ERROR: Failed to parse extracted JSON:', e.message);
                        resolve(false);
                    }
                } else {
                    console.error('ERROR: JSON markers not found in response.');
                    // If error is AI call failed (expected since we didn't provide valid image), check for that
                    if (rawData.includes('AI 调用失败')) {
                         console.log('SUCCESS: Server responded with error JSON (expected behavior for dummy request)');
                         resolve(true);
                    } else {
                         console.log('Raw Data Tail:', rawData.substring(rawData.length - 200));
                         resolve(false);
                    }
                }
            });
        });

        req.on('error', (e) => {
            console.error(`PROBLEM WITH REQUEST: ${e.message}`);
            resolve(false);
        });

        // Write data to request body
        req.write(payload);
        req.end();
    });
}

testConnection().then(success => {
    if (success) {
        console.log('TEST PASSED: Server is reachable and responding correctly.');
        process.exit(0);
    } else {
        console.error('TEST FAILED: Server is not behaving as expected.');
        process.exit(1);
    }
});