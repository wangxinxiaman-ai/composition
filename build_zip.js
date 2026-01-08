const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dest = path.join(__dirname, 'deploy_package');
const zipFile = path.join(__dirname, 'deploy_package.zip');

console.log('Building deployment package...');

// 1. Clean
if (fs.existsSync(dest)) {
    console.log('Cleaning old directory...');
    fs.rmSync(dest, { recursive: true, force: true });
}
if (fs.existsSync(zipFile)) {
    console.log('Cleaning old zip...');
    fs.rmSync(zipFile);
}

// 2. Create Dir
fs.mkdirSync(dest);

// 3. Copy Files
const files = [
    'server.js',
    'package.json',
    'package-lock.json',
    'requirements.txt',
    'Dockerfile',
    'cloudbaserc.json',
    '.dockerignore',
    '.cloudignore'
];

files.forEach(f => {
    if (fs.existsSync(f)) {
        fs.copyFileSync(f, path.join(dest, f));
        console.log(`Copied: ${f}`);
    }
});

// 4. Copy Dirs
const dirs = ['src', 'templates', 'public'];
function copyDir(src, d) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(d, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

dirs.forEach(d => {
    console.log(`Copying directory: ${d}`);
    copyDir(path.join(__dirname, d), path.join(dest, d));
});

console.log('Files copied successfully.');

// 5. Compress using PowerShell via Node (since Node doesn't have built-in zip)
try {
    console.log('Compressing...');
    // Use PowerShell's Compress-Archive
    const cmd = `powershell -Command "Compress-Archive -Path '${dest}\\*' -DestinationPath '${zipFile}' -Force"`;
    execSync(cmd, { stdio: 'inherit' });
    console.log('ZIP created successfully!');
} catch (e) {
    console.error('Failed to create ZIP:', e.message);
    process.exit(1);
}
