# ===============================================================
# db-export.ps1 - dump the four Acceleron Plus databases on Windows
#
#   powershell -ExecutionPolicy Bypass -File scripts\db-export.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\db-export.ps1 -OutDir C:\temp\acceleron-db
#
# Reads host / port / user / password from .env.local (only the
# DATABASE_* lines), writes one plain-SQL dump per database (or pg_dump's
# archive format with -Format custom) plus
# uploads.tgz (project documents) into the output folder, and prints
# the scp command to copy it all to the server. Then run
# scripts/db-import.sh on the server - see DEPLOY.md -> "Moving the data".
#
# Dumps are taken with --no-owner --no-privileges so they restore into
# databases owned by the server's own login, whatever it is called.
# ===============================================================

param(
    [string]$OutDir = "",
    # "sql" (default): plain SQL, loads into the same PostgreSQL version or an
    #   OLDER one - e.g. a laptop on 17 into a server on 16.
    # "custom": pg_dump's compressed archive, same-or-newer server only.
    [ValidateSet("sql", "custom")]
    [string]$Format = "sql"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $root) "acceleron-db" }

# -- Connection settings from .env.local ----------------------------
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) { throw ".env.local not found in $root" }
$vars = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*(DATABASE_[A-Z_]+)\s*=\s*(.*?)\s*$') {
        # First occurrence wins, the same as the app's own .env loader.
        if (-not $vars.ContainsKey($matches[1])) { $vars[$matches[1]] = $matches[2].Trim('"').Trim("'") }
    }
}
function Setting($name, $default) { if ($vars[$name]) { $vars[$name] } else { $default } }

$pgHost = Setting "DATABASE_HOST" "127.0.0.1"
$pgPort = Setting "DATABASE_PORT" "5432"
$pgUser = Setting "DATABASE_USER" "postgres"
$databases = @(
    (Setting "DATABASE_IDENTITY_NAME"  "identity_db"),
    (Setting "DATABASE_PROJECT_NAME"   "project_db"),
    (Setting "DATABASE_ITSM_NAME"      "itsm_db"),
    (Setting "DATABASE_EXECUTION_NAME" "execution_db")
)
if (-not $vars["DATABASE_PASSWORD"]) { throw "DATABASE_PASSWORD is not set in .env.local" }

# -- Find pg_dump (PATH first, then the newest PostgreSQL install) --
$pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
if (-not $pgDump) {
    $pgDump = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
        Sort-Object { [int](($_.Directory.Parent.Name) -replace '[^\d].*$', '') } -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $pgDump) { throw "pg_dump not found. Add PostgreSQL's bin folder to PATH, e.g. C:\Program Files\PostgreSQL\16\bin" }

# pg_dump 18 can also write planner statistics, which only PostgreSQL 18
# can load. Leave them out: the import runs ANALYZE on the server instead.
$pgDumpVersion = & $pgDump --version
$pgDumpMajor = [int](([regex]::Match($pgDumpVersion, '\d+')).Value)
$extraArgs = @()
if ($pgDumpMajor -ge 18) { $extraArgs += "--no-statistics" }

Write-Host ""
Write-Host "  Using $pgDumpVersion"
Write-Host "  From  $pgUser@${pgHost}:$pgPort"
Write-Host "  Into  $OutDir"
Write-Host ""

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$env:PGPASSWORD = $vars["DATABASE_PASSWORD"]
try {
    foreach ($db in $databases) {
        if ($Format -eq "sql") {
            $file = Join-Path $OutDir "$db.sql"
            & $pgDump -h $pgHost -p $pgPort -U $pgUser -Fp --encoding=UTF8 --no-owner --no-privileges @extraArgs -f $file $db
        } else {
            $file = Join-Path $OutDir "$db.dump"
            & $pgDump -h $pgHost -p $pgPort -U $pgUser -Fc --no-owner --no-privileges -f $file $db
        }
        if ($LASTEXITCODE -ne 0) { throw "pg_dump failed for $db" }
        $size = "{0:N1} MB" -f ((Get-Item $file).Length / 1MB)
        Write-Host ("  OK {0,-14} {1}" -f $db, $size)
    }
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

# -- Project documents live on disk, not in the database ------------
$docs = Join-Path $root "uploads"
if ((Test-Path $docs) -and (Get-ChildItem $docs -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    tar -czf (Join-Path $OutDir "uploads.tgz") -C $root uploads
    if ($LASTEXITCODE -ne 0) { throw "Could not pack uploads" }
    Write-Host "  OK uploads.tgz   (project documents)"
} else {
    Write-Host "  - no uploaded documents to copy"
}

Write-Host ""
Write-Host "  Next - copy the folder to the server:"
Write-Host "    scp -r `"$OutDir`" deploy@your-server:/tmp/"
Write-Host "  then on the server:"
Write-Host "    cd /var/www/acceleron-plus && ./scripts/db-import.sh /tmp/$(Split-Path -Leaf $OutDir)"
Write-Host ""
