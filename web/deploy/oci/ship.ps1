<#
.SYNOPSIS
    Copy the PharmaLink source from this Windows machine to the OCI VM.

.DESCRIPTION
    Packs the `web/` directory (minus node_modules, build output, local
    databases and .env) into a tarball, uploads it over SSH, and unpacks it at
    ~/pharmalink on the VM. Re-run it any time you change code — it overwrites
    the source but never touches the Docker volume holding the database.

    Uses the tar and scp that ship with Windows 10/11. No extra tooling.

.EXAMPLE
    .\ship.ps1 -VmIp 152.67.x.x -KeyPath ~\.ssh\oci_pharmalink

.EXAMPLE
    # Oracle Linux images use 'opc' instead of 'ubuntu' as the default user
    .\ship.ps1 -VmIp 152.67.x.x -KeyPath ~\.ssh\oci_pharmalink -User opc
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$VmIp,
    [Parameter(Mandatory = $true)][string]$KeyPath,
    [string]$User = 'ubuntu',
    [string]$RemoteDir = 'pharmalink'
)

$ErrorActionPreference = 'Stop'

# web/ is two levels up from deploy/oci/
$webRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$archive = Join-Path $env:TEMP 'pharmalink-src.tgz'

Write-Host "Packing $webRoot" -ForegroundColor Cyan

# Excluded: reinstalled or rebuilt on the VM (node_modules, .next), local-only
# state (*.db, .uploads), test artefacts, and .env — the VM gets its own so a
# dev secret is never shipped to a public host.
$excludes = @(
    '--exclude=./node_modules'
    '--exclude=./.next'
    '--exclude=./test-results'
    '--exclude=./playwright-report'
    '--exclude=./coverage'
    '--exclude=./.uploads'
    '--exclude=./.env'
    '--exclude=./deploy/oci/.env'
    '--exclude=./tsconfig.tsbuildinfo'
    '--exclude=./*.db'
    '--exclude=./*.db-journal'
    '--exclude=./prisma/*.db'
)

if (Test-Path $archive) { Remove-Item $archive -Force }
& tar -czf $archive @excludes -C $webRoot .
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }

$sizeMb = [math]::Round((Get-Item $archive).Length / 1MB, 1)
Write-Host "Archive: $sizeMb MB" -ForegroundColor Cyan

$target = "$User@$VmIp"
Write-Host "Uploading to ${target}:~/$RemoteDir" -ForegroundColor Cyan

& ssh -i $KeyPath -o StrictHostKeyChecking=accept-new $target "mkdir -p ~/$RemoteDir"
if ($LASTEXITCODE -ne 0) { throw "ssh failed with exit code $LASTEXITCODE" }

& scp -i $KeyPath $archive "${target}:/tmp/pharmalink-src.tgz"
if ($LASTEXITCODE -ne 0) { throw "scp failed with exit code $LASTEXITCODE" }

# Unpack, then normalise line endings on shell scripts — a tarball built on
# Windows can carry CRLF, which makes /bin/sh fail with a cryptic
# "bad interpreter" or "not found".
$remoteCmd = @(
    "tar -xzf /tmp/pharmalink-src.tgz -C ~/$RemoteDir"
    "rm -f /tmp/pharmalink-src.tgz"
    "find ~/$RemoteDir -name '*.sh' -exec sed -i 's/\r`$//' {} +"
    "chmod +x ~/$RemoteDir/docker-entrypoint.sh ~/$RemoteDir/deploy/oci/bootstrap.sh"
) -join ' && '

& ssh -i $KeyPath $target $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "remote unpack failed with exit code $LASTEXITCODE" }

Remove-Item $archive -Force

Write-Host ''
Write-Host 'Source is on the VM.' -ForegroundColor Green
Write-Host "  ssh -i $KeyPath $target" -ForegroundColor Green
Write-Host "  cd ~/$RemoteDir/deploy/oci && docker compose -f docker-compose.oci.yml up -d --build" -ForegroundColor Green
