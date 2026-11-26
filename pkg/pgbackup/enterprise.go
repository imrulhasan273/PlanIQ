package pgbackup

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/imrulhasan273/PlanIQ/pkg/livedb"
)

func formatHumanBytes(b int64) string {
	if b <= 0 {
		return "0 B"
	}
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

func computeTargetSha256(targetPath string) (string, error) {
	st, err := os.Stat(targetPath)
	if err != nil {
		return "", err
	}
	if !st.IsDir() {
		f, err := os.Open(targetPath)
		if err != nil {
			return "", err
		}
		defer f.Close()
		h := sha256.New()
		if _, err := io.Copy(h, f); err != nil {
			return "", err
		}
		return hex.EncodeToString(h.Sum(nil)), nil
	}

	// Directory backup: hash relative filenames + contents in sorted deterministic order
	var files []string
	err = filepath.WalkDir(targetPath, func(p string, d fs.DirEntry, wErr error) error {
		if wErr != nil || d.IsDir() {
			return wErr
		}
		files = append(files, p)
		return nil
	})
	if err != nil {
		return "", err
	}
	sort.Strings(files)

	master := sha256.New()
	for _, absFile := range files {
		rel, _ := filepath.Rel(targetPath, absFile)
		master.Write([]byte(filepath.ToSlash(rel)))
		master.Write([]byte{0})
		f, err := os.Open(absFile)
		if err != nil {
			return "", err
		}
		if _, err := io.Copy(master, f); err != nil {
			_ = f.Close()
			return "", err
		}
		_ = f.Close()
		master.Write([]byte{0})
	}
	return hex.EncodeToString(master.Sum(nil)), nil
}

// WriteSha256Sidecar writes `<targetPath>.sha256` alongside a logical backup file or folder.
func WriteSha256Sidecar(targetPath string) (string, string, error) {
	sum, err := computeTargetSha256(targetPath)
	if err != nil {
		return "", "", err
	}
	sidecarPath := strings.TrimRight(targetPath, `/\`) + ".sha256"
	content := fmt.Sprintf("%s  %s\n", sum, filepath.Base(strings.TrimRight(targetPath, `/\`)))
	if err := os.WriteFile(sidecarPath, []byte(content), 0o644); err != nil {
		return "", "", err
	}
	return sidecarPath, sum, nil
}

// VerifySha256Sidecar validates `<targetPath>.sha256` against the current backup file/directory.
func VerifySha256Sidecar(targetPath string) (ChecksumVerifyResult, error) {
	clean := strings.TrimRight(strings.TrimSpace(targetPath), `/\`)
	sidecarPath := clean + ".sha256"
	res := ChecksumVerifyResult{
		TargetPath:  clean,
		SidecarPath: sidecarPath,
	}
	raw, err := os.ReadFile(sidecarPath)
	if err != nil {
		res.Message = fmt.Sprintf("Checksum file not found (%s): %v", sidecarPath, err)
		return res, nil
	}
	fields := strings.Fields(string(raw))
	if len(fields) == 0 {
		res.Message = "Checksum sidecar file is empty."
		return res, nil
	}
	expected := strings.ToLower(strings.TrimSpace(fields[0]))
	actual, err := computeTargetSha256(clean)
	if err != nil {
		res.Expected = expected
		res.Message = fmt.Sprintf("Failed to read backup target: %v", err)
		return res, nil
	}
	res.Expected = expected
	res.Actual = actual
	res.Matched = (expected == actual)
	if res.Matched {
		res.Message = fmt.Sprintf("SHA-256 verified (%s…)", actual[:16])
	} else {
		res.Message = fmt.Sprintf("SHA-256 MISMATCH! Expected %s, got %s", expected[:16], actual[:16])
	}
	return res, nil
}

// WriteFilterFile generates a PostgreSQL 17+ `--filter` rules file.
func WriteFilterFile(rules []BackupFilterRule) (string, error) {
	var lines []string
	for _, r := range rules {
		act := strings.ToLower(strings.TrimSpace(r.Action))
		if act != "include" && act != "exclude" {
			act = "include"
		}
		obj := strings.ToLower(strings.TrimSpace(r.ObjectType))
		if obj == "" {
			obj = "table"
		}
		pat := strings.TrimSpace(r.Pattern)
		if pat == "" {
			continue
		}
		lines = append(lines, fmt.Sprintf("%s %s %s", act, obj, pat))
	}
	if len(lines) == 0 {
		return "", nil
	}
	f, err := os.CreateTemp("", "planiq-pgfilter-*.txt")
	if err != nil {
		return "", err
	}
	defer f.Close()
	for _, line := range lines {
		if _, err := fmt.Fprintln(f, line); err != nil {
			return "", err
		}
	}
	return f.Name(), nil
}

// FetchPitrStatus inspects live WAL archiving configuration and pg_stat_archiver metrics.
func FetchPitrStatus(ctx context.Context, cfg livedb.ConnectionConfig) (*PitrStatus, error) {
	qCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	db, err := sql.Open("pgx", buildReadOnlyPGConnStr(cfg, cfg.Database))
	if err != nil {
		return nil, err
	}
	defer db.Close()

	st := &PitrStatus{}
	_ = db.QueryRowContext(qCtx, `SHOW wal_level;`).Scan(&st.WalLevel)
	_ = db.QueryRowContext(qCtx, `SHOW archive_mode;`).Scan(&st.ArchiveMode)
	_ = db.QueryRowContext(qCtx, `SHOW archive_command;`).Scan(&st.ArchiveCommand)

	_ = db.QueryRowContext(qCtx, `
		SELECT
			COALESCE(archived_count, 0),
			COALESCE(failed_count, 0),
			COALESCE(last_archived_wal, ''),
			COALESCE(to_char(last_archived_time AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS "UTC"'), ''),
			COALESCE(last_failed_wal, ''),
			COALESCE(to_char(last_failed_time AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS "UTC"'), '')
		FROM pg_stat_archiver;
	`).Scan(
		&st.ArchivedCount,
		&st.FailedCount,
		&st.LastArchivedWal,
		&st.LastArchivedTime,
		&st.LastFailedWal,
		&st.LastFailedTime,
	)
	return st, nil
}

// GenerateAutomationScript builds a standalone Windows PowerShell (.ps1) or Linux Bash (.sh) backup script.
func GenerateAutomationScript(cfg livedb.ConnectionConfig, req ScriptExportRequest) string {
	ret := req.RetentionDays
	if ret <= 0 {
		ret = 7
	}
	host := cfg.Server
	if host == "" {
		host = "localhost"
	}
	port := cfg.Port
	if port == 0 {
		port = 5432
	}
	user := cfg.Username
	if user == "" {
		user = "postgres"
	}
	db := req.Database
	if db == "" {
		db = cfg.Database
	}
	if db == "" {
		db = "postgres"
	}

	if req.TargetOS == "linux_bash" {
		outDir := req.OutputPath
		if outDir == "" {
			outDir = "/var/backups/postgresql"
		}
		if ext := filepath.Ext(outDir); ext != "" {
			outDir = filepath.Dir(outDir)
		}
		shaBlock := ""
		if req.IncludeSha256 {
			shaBlock = `
# Write SHA-256 verification checksum
if [ -d "$TARGET_PATH" ]; then
  find "$TARGET_PATH" -type f -print0 | sort -z | xargs -0 sha256sum > "${TARGET_PATH}.sha256"
else
  sha256sum "$TARGET_PATH" > "${TARGET_PATH}.sha256"
fi
echo "[PlanIQ] Wrote checksum: ${TARGET_PATH}.sha256"`
		}

		return fmt.Sprintf(`#!/usr/bin/env bash
# PlanIQ Automated PostgreSQL Backup Script (Ubuntu / AlmaLinux / RHEL)
# Database: %s | Mode: %s | Retention: %d days
# Schedule via crontab -e:
#   0 2 * * * PGPASSWORD='YOUR_PASSWORD' /opt/planiq/backup_%s.sh >> /var/log/pg_backup.log 2>&1

set -euo pipefail

PGHOST="${PGHOST:-%s}"
PGPORT="${PGPORT:-%d}"
PGUSER="${PGUSER:-%s}"
export PGPASSWORD="${PGPASSWORD:-}"
BACKUP_ROOT="%s"
RETENTION_DAYS=%d
STAMP="$(date +%%Y%%m%%d_%%H%%M%%S)"

mkdir -p "$BACKUP_ROOT"
TARGET_PATH="${BACKUP_ROOT}/%s_${STAMP}"

echo "[PlanIQ] Starting PostgreSQL backup at $(date -Iseconds) -> $TARGET_PATH"
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" --format=directory --compress=zstd:3 --jobs=4 --file="$TARGET_PATH" "%s"
%s

echo "[PlanIQ] Pruning backups older than ${RETENTION_DAYS} days in $BACKUP_ROOT..."
find "$BACKUP_ROOT" -maxdepth 1 -mtime +"$RETENTION_DAYS" -name "%s_*" -exec rm -rf {} +
echo "[PlanIQ] Completed successfully at $(date -Iseconds)."
`, db, req.Mode, ret, db, host, port, user, outDir, ret, db, db, shaBlock, db)
	}

	// Windows PowerShell (.ps1)
	outDir := req.OutputPath
	if outDir == "" {
		outDir = `D:\Backups\PostgreSQL`
	}
	if ext := filepath.Ext(outDir); ext != "" {
		outDir = filepath.Dir(outDir)
	}
	shaPs := ""
	if req.IncludeSha256 {
		shaPs = `
if (Test-Path $TargetPath -PathType Container) {
    Get-ChildItem -Path $TargetPath -File | Sort-Object Name | Get-FileHash -Algorithm SHA256 | Out-File "$TargetPath.sha256" -Encoding utf8
} else {
    Get-FileHash -Path $TargetPath -Algorithm SHA256 | Out-File "$TargetPath.sha256" -Encoding utf8
}
Write-Host "[PlanIQ] Wrote checksum: $TargetPath.sha256"`
	}

	return fmt.Sprintf(`# PlanIQ Automated PostgreSQL Backup Script (Windows PowerShell)
# Database: %s | Mode: %s | Retention: %d days
# Schedule via Windows Task Scheduler:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Scripts\backup_%s.ps1"

$ErrorActionPreference = "Stop"

$env:PGHOST = if ($env:PGHOST) { $env:PGHOST } else { "%s" }
$env:PGPORT = if ($env:PGPORT) { $env:PGPORT } else { "%d" }
$env:PGUSER = if ($env:PGUSER) { $env:PGUSER } else { "%s" }
# Set $env:PGPASSWORD in Task Scheduler environment or Windows Credential Manager before running:
if (-not $env:PGPASSWORD) { Write-Warning "PGPASSWORD is not set; using .pgpass / pgpass.conf if available." }

$BackupRoot = "%s"
$RetentionDays = %d
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
$TargetPath = Join-Path $BackupRoot ("%s_" + $Stamp)

Write-Host "[PlanIQ] Starting PostgreSQL backup -> $TargetPath"
& pg_dump.exe -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER --format=directory --compress=zstd:3 --jobs=4 --file="$TargetPath" "%s"
if ($LASTEXITCODE -ne 0) { throw "pg_dump exited with code $LASTEXITCODE" }
%s

Write-Host "[PlanIQ] Pruning backups older than $RetentionDays days..."
$Cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupRoot -Filter "%s_*" | Where-Object { $_.LastWriteTime -lt $Cutoff } | Remove-Item -Recurse -Force
Write-Host "[PlanIQ] Backup completed successfully."
`, db, req.Mode, ret, db, host, port, user, outDir, ret, db, db, shaPs, db)
}
