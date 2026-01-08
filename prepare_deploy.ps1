$ErrorActionPreference = "Stop"
$source = Get-Location
$dest = "$source\deploy_package"
$zip = "$source\deploy_package.zip"

Write-Host "Starting deployment packaging..."

# 1. Clean up old artifacts
if (Test-Path $dest) { 
    Write-Host "Removing old directory..."
    Remove-Item -Recurse -Force $dest 
}
if (Test-Path $zip) { 
    Write-Host "Removing old zip..."
    Remove-Item -Force $zip 
}

# 2. Create Destination Directory
New-Item -ItemType Directory -Path $dest | Out-Null

# 3. Copy Individual Files (Whitelist)
$files = @(
    "server.js",
    "package.json",
    "package-lock.json",
    "requirements.txt",
    "Dockerfile",
    "cloudbaserc.json",
    ".dockerignore",
    ".cloudignore"
)

foreach ($f in $files) {
    if (Test-Path "$source\$f") {
        Copy-Item "$source\$f" "$dest"
        Write-Host "Copied: $f"
    } else {
        Write-Host "Skipped (Not Found): $f" -ForegroundColor Yellow
    }
}

# 4. Copy Directories (Recursive)
$dirs = @("src", "templates", "public")
foreach ($d in $dirs) {
    if (Test-Path "$source\$d") {
        Copy-Item -Recurse "$source\$d" "$dest"
        Write-Host "Copied Directory: $d"
    } else {
        Write-Host "Skipped Directory (Not Found): $d" -ForegroundColor Yellow
    }
}

# 5. Compress
Write-Host "Compressing files to $zip ..."
Compress-Archive -Path "$dest\*" -DestinationPath $zip

# 6. Verify
if (Test-Path $zip) {
    $item = Get-Item $zip
    $size = "{0:N2} MB" -f ($item.Length / 1MB)
    Write-Host "SUCCESS: Deployment package created!" -ForegroundColor Green
    Write-Host "Path: $zip"
    Write-Host "Size: $size"
} else {
    Write-Error "FAILED to create zip file."
}
