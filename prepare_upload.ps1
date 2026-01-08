# Prepare Clean Upload Folder Script
$TargetDir = "J:\AI作文批改\upload_temp"

# 1. Clean up old temp folder
if (Test-Path $TargetDir) {
    Remove-Item -Recurse -Force $TargetDir
}
New-Item -ItemType Directory $TargetDir | Out-Null
Write-Host "Creating clean upload folder at: $TargetDir" -ForegroundColor Green

# 2. Define whitelist (Core Files Only)
$FilesToCopy = @(
    "server.js",
    "package.json",
    "package-lock.json",
    "Dockerfile",
    ".dockerignore",
    "requirements.txt"
)

$FoldersToCopy = @(
    "src",
    "public",
    "templates"
)

# 3. Copy Files
foreach ($file in $FilesToCopy) {
    if (Test-Path $file) {
        Copy-Item $file $TargetDir
        Write-Host "  + Copied $file"
    } else {
        Write-Host "  ! Warning: $file not found" -ForegroundColor Yellow
    }
}

# 4. Copy Folders
foreach ($folder in $FoldersToCopy) {
    if (Test-Path $folder) {
        Copy-Item -Recurse $folder "$TargetDir\$folder"
        Write-Host "  + Copied folder $folder"
    }
}

# 5. Create .cloudignore in target (Just in case)
Set-Content -Path "$TargetDir\.cloudignore" -Value "node_modules/`r`n.git/"

Write-Host "`n✅ Done! Please upload the folder: upload_temp" -ForegroundColor Cyan
