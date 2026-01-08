const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const output = fs.createWriteStream(path.join(__dirname, 'deploy_package.zip'));
const archive = archiver('zip', {
  zlib: { level: 9 } // Sets the compression level.
});

output.on('close', function() {
  console.log('Archive created successfully.');
  console.log('Total bytes: ' + archive.pointer());
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);

// Define source directory
const sourceDir = path.join(__dirname, 'deploy_package');

// Add files from deploy_package directory
archive.directory(sourceDir, false);

console.log('Zipping files from ' + sourceDir + '...');
archive.finalize();
