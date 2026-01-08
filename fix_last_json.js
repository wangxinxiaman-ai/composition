const fs = require('fs');
const path = require('path');

function tryParse(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
        return parsed;
    } catch (e) {
        const firstOpen = text.indexOf('{');
        if (firstOpen !== -1) {
            const potentialJson = text.slice(firstOpen);
            for (let i = potentialJson.length - 1; i >= 0; i--) {
                if (potentialJson[i] === '}') {
                    const candidate = potentialJson.slice(0, i + 1);
                    try {
                        parsed = JSON.parse(candidate);
                        return parsed;
                    } catch (e2) {}
                }
            }
        }
    }
    return null;
}

const contentPath = path.join(__dirname, 'data', 'corrections', '20251217-102522.content.txt');
const jsonPath = path.join(__dirname, 'data', 'corrections', '20251217-102522.json');

if (fs.existsSync(contentPath)) {
    const content = fs.readFileSync(contentPath, 'utf8');
    const result = tryParse(content);
    if (result) {
        // 修复：处理原文中的 literal \n
        if (result['原文'] && typeof result['原文'] === 'string') {
            result['原文'] = result['原文'].replace(/\\n/g, '\n');
        }

        // 保留原有的 image_url 等字段（如果有的话，需要从旧 json 合并，但旧 json 是坏的...）
        // 幸运的是 content.txt 里只有 AI 返回的文本。
        // 我们检查一下旧的 json 文件看看有没有其他元数据需要保留
        let oldData = {};
        try {
            if (fs.existsSync(jsonPath)) {
                oldData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            }
        } catch(e) {}
        
        // 合并 image_url 等非 AI 生成的字段
        if (oldData.image_url) result.image_url = oldData.image_url;
        if (oldData.saved_file) result.saved_file = oldData.saved_file;
        if (oldData.saved_files) result.saved_files = oldData.saved_files;

        fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');
        console.log("JSON file repaired successfully.");
    } else {
        console.log("Failed to repair JSON.");
    }
}
