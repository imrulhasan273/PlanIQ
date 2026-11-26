package pgbackup

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/imrulhasan273/PlanIQ/pkg/livedb"
)

func resolveToolPath(tools ToolchainInfo, name string) string {
	if t, ok := tools.Tools[name]; ok && t.Available && t.Path != "" {
		return t.Path
	}
	return exeName(name)
}

func quoteArgForDisplay(a string) string {
	if a == "" {
		return `""`
	}
	if strings.ContainsAny(a, " \t\"'&|<>^") {
		return `"` + strings.ReplaceAll(a, `"`, `\"`) + `"`
	}
	return a
}

// FormatCommandForDisplay formats a binary path and args into a readable CLI preview (without secrets).
func FormatCommandForDisplay(bin string, args []string) string {
	parts := make([]string, 0, len(args)+1)
	parts = append(parts, quoteArgForDisplay(filepath.Base(bin)))
	for _, a := range args {
		parts = append(parts, quoteArgForDisplay(a))
	}
	return strings.Join(parts, " ")
}

// SplitExtraArgs parses shell-style extra CLI flags while respecting single and double quotes.
func SplitExtraArgs(raw string) []string {
	var args []string
	var cur strings.Builder
	var quote rune
	inToken := false

	for _, r := range raw {
		switch {
		case quote != 0:
			if r == quote {
				quote = 0
			} else {
				cur.WriteRune(r)
			}
			inToken = true
		case r == '"' || r == '\'':
			quote = r
			inToken = true
		case unicode.IsSpace(r):
			if inToken {
				args = append(args, cur.String())
				cur.Reset()
				inToken = false
			}
		default:
			cur.WriteRune(r)
			inToken = true
		}
	}
	if inToken {
		args = append(args, cur.String())
	}
	return args
}

func baseConnArgs(cfg livedb.ConnectionConfig) []string {
	port := cfg.Port
	if port == 0 {
		port = 5432
	}
	args := []string{}
	if strings.TrimSpace(cfg.Server) != "" {
		args = append(args, "-h", strings.TrimSpace(cfg.Server))
	}
	args = append(args, "-p", strconv.Itoa(port))
	if strings.TrimSpace(cfg.Username) != "" {
		args = append(args, "-U", strings.TrimSpace(cfg.Username))
	}
	return args
}

// BuildChildEnv returns the OS environment augmented with PGPASSWORD / PGSSLMODE without leaking secrets in args.
func BuildChildEnv(cfg livedb.ConnectionConfig) []string {
	env := os.Environ()
	if cfg.Password != "" {
		env = append(env, "PGPASSWORD="+cfg.Password)
	}
	sslMode := "disable"
	if cfg.Encrypt {
		if cfg.TrustServerCertificate {
			sslMode = "require"
		} else {
			sslMode = "verify-full"
		}
	}
	env = append(env, "PGSSLMODE="+sslMode)
	return env
}

// BuildRestoreChildEnv augments BuildChildEnv with session-only PGOPTIONS for Turbo Restore mode.
func BuildRestoreChildEnv(cfg livedb.ConnectionConfig, boost bool, boostMem string) []string {
	env := BuildChildEnv(cfg)
	if boost {
		mem := strings.TrimSpace(boostMem)
		if mem == "" {
			mem = "512MB"
		}
		env = append(env, fmt.Sprintf("PGOPTIONS=-c synchronous_commit=off -c maintenance_work_mem=%s", mem))
	}
	return env
}

func formatFlag(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "directory", "d":
		return "directory"
	case "tar", "t":
		return "tar"
	case "plain", "p", "sql":
		return "plain"
	default:
		return "custom"
	}
}

func appendCompressionFlags(args []string, tools ToolchainInfo, compression string, level int, warnings *[]string) []string {
	comp := strings.ToLower(strings.TrimSpace(compression))
	if comp == "" || comp == "none" {
		return args
	}
	if (comp == "zstd" || comp == "lz4") && !tools.Capabilities.SupportsZstdLz4 {
		*warnings = append(*warnings, fmt.Sprintf("Compression '%s' requires PostgreSQL client tools v15+. Detected v%d; omit or switch to gzip.", comp, tools.ClientMajorVersion))
		return args
	}
	if tools.ClientMajorVersion >= 16 || comp == "zstd" || comp == "lz4" {
		if level > 0 {
			return append(args, "--compress", fmt.Sprintf("%s:%d", comp, level))
		}
		return append(args, "--compress", comp)
	}
	// PG <= 15 gzip numeric level
	if comp == "gzip" {
		if level <= 0 {
			level = 6
		}
		return append(args, "-Z", strconv.Itoa(level))
	}
	return args
}

func buildPgDumpArgs(cfg livedb.ConnectionConfig, tools ToolchainInfo, catalog *BackupCatalog, dbName string, outPath string, filterFilePath string, req LogicalBackupRequest, warnings *[]string) []string {
	args := baseConnArgs(cfg)
	fmtVal := formatFlag(req.Format)
	args = append(args, "--format="+fmtVal)

	// Compression (applicable for custom / directory; warn on tar + zstd if needed)
	if fmtVal != "plain" {
		args = appendCompressionFlags(args, tools, req.Compression, req.CompressionLevel, warnings)
	} else if req.Compression != "" && req.Compression != "none" {
		*warnings = append(*warnings, "Plain SQL format uses uncompressed output cleanly; compression flags are skipped for --format=plain.")
	}

	if fmtVal == "directory" && req.ParallelJobs > 1 {
		args = append(args, "--jobs="+strconv.Itoa(req.ParallelJobs))
	} else if fmtVal != "directory" && req.ParallelJobs > 1 {
		*warnings = append(*warnings, "Parallel jobs (-j) only apply to Directory format (--format=directory).")
	}

	// Content mode
	switch req.ContentMode {
	case "schema_only":
		args = append(args, "--schema-only")
	case "data_only":
		args = append(args, "--data-only")
	case "statistics_only":
		if tools.Capabilities.SupportsStatisticsFlags {
			args = append(args, "--statistics-only")
		} else {
			*warnings = append(*warnings, "--statistics-only requires PostgreSQL 18+ client tools.")
		}
	case "sections":
		for _, sec := range req.Sections {
			s := strings.TrimSpace(sec)
			if s == "pre-data" || s == "data" || s == "post-data" {
				args = append(args, "--section="+s)
			}
		}
	}

	if req.ContentMode != "statistics_only" {
		if req.IncludeStatistics {
			if tools.Capabilities.SupportsStatisticsFlags {
				args = append(args, "--statistics")
			} else {
				*warnings = append(*warnings, "--statistics requires PostgreSQL 18+ client tools.")
			}
		} else if req.NoStatistics && tools.Capabilities.SupportsStatisticsFlags {
			args = append(args, "--no-statistics")
		}
	}

	// Object scoping
	switch req.Mode {
	case "schema":
		for _, s := range req.Schemas {
			if strings.TrimSpace(s) != "" {
				args = append(args, "--schema="+strings.TrimSpace(s))
			}
		}
		for _, s := range req.ExcludeSchemas {
			if strings.TrimSpace(s) != "" {
				args = append(args, "--exclude-schema="+strings.TrimSpace(s))
			}
		}
	case "table":
		for _, s := range req.Schemas {
			if strings.TrimSpace(s) != "" {
				args = append(args, "--schema="+strings.TrimSpace(s))
			}
		}
		for _, t := range req.Tables {
			if strings.TrimSpace(t) != "" {
				args = append(args, "--table="+strings.TrimSpace(t))
			}
		}
		for _, t := range req.ExcludeTables {
			if strings.TrimSpace(t) != "" {
				args = append(args, "--exclude-table="+strings.TrimSpace(t))
			}
		}
	case "tablespace":
		selectedTS := make(map[string]bool)
		for _, ts := range req.Tablespaces {
			if strings.TrimSpace(ts) != "" {
				selectedTS[strings.TrimSpace(ts)] = true
			}
		}
		matched := 0
		if catalog != nil && len(selectedTS) > 0 {
			for _, tbl := range catalog.Tables {
				if selectedTS[tbl.Tablespace] {
					args = append(args, "--table="+tbl.Schema+"."+tbl.Name)
					matched++
				}
			}
		}
		if len(selectedTS) > 0 && matched == 0 {
			*warnings = append(*warnings, "No tables/views found in the selected tablespace(s) for database '"+dbName+"'.")
		}
	}

	for _, t := range req.ExcludeTableData {
		if strings.TrimSpace(t) != "" {
			args = append(args, "--exclude-table-data="+strings.TrimSpace(t))
		}
	}

	if req.Clean {
		if fmtVal == "plain" && req.CreateDB {
			args = append(args, "--clean")
		} else {
			args = append(args, "--clean")
		}
		if req.IfExists {
			args = append(args, "--if-exists")
		}
	}
	if req.CreateDB {
		args = append(args, "--create")
	}
	if req.NoOwner {
		args = append(args, "--no-owner")
	}
	if req.NoPrivileges {
		args = append(args, "--no-privileges")
	}
	if req.NoTablespaces {
		args = append(args, "--no-tablespaces")
	}
	if !req.IncludeBlobs && req.ContentMode != "schema_only" && req.ContentMode != "statistics_only" {
		args = append(args, "--no-blobs")
	}
	if req.Inserts {
		args = append(args, "--inserts")
	}
	if req.ColumnInserts {
		args = append(args, "--column-inserts")
	}
	if req.RowsPerInsert > 0 {
		args = append(args, "--rows-per-insert="+strconv.Itoa(req.RowsPerInsert))
	}
	if strings.TrimSpace(req.LockWaitTimeout) != "" {
		args = append(args, "--lock-wait-timeout="+strings.TrimSpace(req.LockWaitTimeout))
	}
	if strings.TrimSpace(req.Encoding) != "" {
		args = append(args, "--encoding="+strings.TrimSpace(req.Encoding))
	}
	if len(req.FilterRules) > 0 {
		if !tools.Capabilities.SupportsFilterFile {
			*warnings = append(*warnings, fmt.Sprintf("--filter requires PostgreSQL 17+ client tools (detected v%d).", tools.ClientMajorVersion))
		}
		fp := filterFilePath
		if fp == "" {
			fp = "<planiq-filter.txt>"
		}
		args = append(args, "--filter="+fp)
	}

	if strings.TrimSpace(req.ExtraArgs) != "" {
		args = append(args, SplitExtraArgs(req.ExtraArgs)...)
	}

	if outPath != "" {
		args = append(args, "--file="+outPath)
	}
	args = append(args, dbName)
	return args
}

func buildPgDumpAllArgs(cfg livedb.ConnectionConfig, tools ToolchainInfo, req LogicalBackupRequest, outPath string, warnings *[]string) []string {
	args := baseConnArgs(cfg)

	switch req.Mode {
	case "cluster_globals":
		args = append(args, "--globals-only")
	case "cluster_roles":
		args = append(args, "--roles-only")
	case "cluster_tablespaces":
		args = append(args, "--tablespaces-only")
	}

	if req.ContentMode == "schema_only" {
		args = append(args, "--schema-only")
	} else if req.ContentMode == "data_only" && req.Mode == "cluster_full" {
		args = append(args, "--data-only")
	} else if req.ContentMode == "statistics_only" {
		if tools.Capabilities.SupportsStatisticsFlags {
			args = append(args, "--statistics-only")
		} else {
			*warnings = append(*warnings, "--statistics-only requires PostgreSQL 18+ client tools.")
		}
	}

	if req.Format != "" && req.Format != "plain" {
		if tools.Capabilities.SupportsNonTextDumpall && req.Mode == "cluster_full" {
			args = append(args, "--format="+formatFlag(req.Format))
		} else if !tools.Capabilities.SupportsNonTextDumpall {
			*warnings = append(*warnings, fmt.Sprintf("pg_dumpall non-text format (--format=%s) requires PostgreSQL 18+ (detected v%d); pg_dumpall uses plain SQL on v17 and earlier.", req.Format, tools.ClientMajorVersion))
		}
	}

	for _, exDB := range req.ExcludeDatabases {
		if strings.TrimSpace(exDB) != "" {
			args = append(args, "--exclude-database="+strings.TrimSpace(exDB))
		}
	}

	if req.Clean {
		args = append(args, "--clean")
		if req.IfExists {
			args = append(args, "--if-exists")
		}
	}
	if req.NoOwner {
		args = append(args, "--no-owner")
	}
	if req.NoPrivileges {
		args = append(args, "--no-privileges")
	}
	if req.NoTablespaces {
		args = append(args, "--no-tablespaces")
	}
	if req.Inserts {
		args = append(args, "--inserts")
	}
	if req.ColumnInserts {
		args = append(args, "--column-inserts")
	}
	if strings.TrimSpace(req.LockWaitTimeout) != "" {
		args = append(args, "--lock-wait-timeout="+strings.TrimSpace(req.LockWaitTimeout))
	}
	if strings.TrimSpace(req.ExtraArgs) != "" {
		args = append(args, SplitExtraArgs(req.ExtraArgs)...)
	}
	if outPath != "" {
		args = append(args, "--file="+outPath)
	}
	return args
}

func dumpExtension(format string) string {
	switch formatFlag(format) {
	case "directory":
		return "_dir"
	case "tar":
		return ".tar"
	case "plain":
		return ".sql"
	default:
		return ".dump"
	}
}

// BuildLogicalBackupPlan builds one or more commands plus manifest metadata (for multi_db).
func BuildLogicalBackupPlan(
	cfg livedb.ConnectionConfig,
	tools ToolchainInfo,
	catalog *BackupCatalog,
	req LogicalBackupRequest,
	optionalFilterPath ...string,
) ([]PlannedCommand, *MultiDbManifest, BackupCommandPreview, error) {
	filterPath := ""
	if len(optionalFilterPath) > 0 {
		filterPath = optionalFilterPath[0]
	}
	var warnings []string
	if !tools.Compatible && tools.CompatibilityWarning != "" {
		warnings = append(warnings, tools.CompatibilityWarning)
	}

	switch req.Mode {
	case "cluster_full", "cluster_globals", "cluster_roles", "cluster_tablespaces":
		bin := resolveToolPath(tools, "pg_dumpall")
		args := buildPgDumpAllArgs(cfg, tools, req, req.OutputPath, &warnings)
		cmd := PlannedCommand{
			StepLabel: "pg_dumpall (" + req.Mode + ")",
			Binary:    bin,
			Args:      args,
			Output:    req.OutputPath,
		}
		preview := BackupCommandPreview{
			Command:        bin,
			Args:           args,
			DisplayCommand: FormatCommandForDisplay(bin, args),
			Warnings:       warnings,
		}
		return []PlannedCommand{cmd}, nil, preview, nil

	case "multi_db":
		dbs := make([]string, 0, len(req.Databases))
		for _, d := range req.Databases {
			if strings.TrimSpace(d) != "" {
				dbs = append(dbs, strings.TrimSpace(d))
			}
		}
		if len(dbs) == 0 {
			return nil, nil, BackupCommandPreview{Warnings: warnings}, fmt.Errorf("select at least one database for multi-database backup")
		}
		outDir := strings.TrimSpace(req.OutputPath)
		if outDir == "" {
			outDir = "planiq_multi_backup"
		}
		manifest := &MultiDbManifest{
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
			Server:    cfg.Server,
			Format:    formatFlag(req.Format),
		}
		var cmds []PlannedCommand
		var displayLines []string

		if req.IncludeGlobals {
			globalsPath := filepath.Join(outDir, "globals.sql")
			gBin := resolveToolPath(tools, "pg_dumpall")
			gReq := LogicalBackupRequest{Mode: "cluster_globals", NoOwner: req.NoOwner, NoPrivileges: req.NoPrivileges}
			gArgs := buildPgDumpAllArgs(cfg, tools, gReq, globalsPath, &warnings)
			manifest.GlobalsFile = "globals.sql"
			cmds = append(cmds, PlannedCommand{
				StepLabel: "Globals (pg_dumpall --globals-only)",
				Binary:    gBin,
				Args:      gArgs,
				Output:    globalsPath,
			})
			displayLines = append(displayLines, FormatCommandForDisplay(gBin, gArgs))
		}

		dumpBin := resolveToolPath(tools, "pg_dump")
		ext := dumpExtension(req.Format)
		for _, dbName := range dbs {
			fileOut := filepath.Join(outDir, dbName+ext)
			dbArgs := buildPgDumpArgs(cfg, tools, catalog, dbName, fileOut, filterPath, req, &warnings)
			manifest.Entries = append(manifest.Entries, MultiDbManifestEntry{
				Database:   dbName,
				Format:     formatFlag(req.Format),
				OutputPath: dbName + ext,
			})
			cmds = append(cmds, PlannedCommand{
				StepLabel: "Dump DB: " + dbName,
				Binary:    dumpBin,
				Args:      dbArgs,
				Output:    fileOut,
			})
			displayLines = append(displayLines, FormatCommandForDisplay(dumpBin, dbArgs))
		}

		preview := BackupCommandPreview{
			Command:        cmds[0].Binary,
			Args:           cmds[0].Args,
			DisplayCommand: strings.Join(displayLines, "\n"),
			Warnings:       warnings,
		}
		return cmds, manifest, preview, nil

	default:
		dbName := strings.TrimSpace(req.Database)
		if dbName == "" {
			dbName = cfg.Database
		}
		if dbName == "" {
			dbName = "postgres"
		}
		bin := resolveToolPath(tools, "pg_dump")
		args := buildPgDumpArgs(cfg, tools, catalog, dbName, req.OutputPath, filterPath, req, &warnings)
		cmd := PlannedCommand{
			StepLabel: "pg_dump (" + dbName + ")",
			Binary:    bin,
			Args:      args,
			Output:    req.OutputPath,
		}
		preview := BackupCommandPreview{
			Command:        bin,
			Args:           args,
			DisplayCommand: FormatCommandForDisplay(bin, args),
			Warnings:       warnings,
		}
		return []PlannedCommand{cmd}, nil, preview, nil
	}
}

// BuildPhysicalBackupPlan builds pg_basebackup (full or PG 17+ incremental), pg_combinebackup, or pg_verifybackup.
func BuildPhysicalBackupPlan(
	cfg livedb.ConnectionConfig,
	tools ToolchainInfo,
	req PhysicalBackupRequest,
) ([]PlannedCommand, BackupCommandPreview, error) {
	var warnings []string

	switch req.Operation {
	case "combine":
		if !tools.Capabilities.SupportsIncremental {
			warnings = append(warnings, fmt.Sprintf("pg_combinebackup requires PostgreSQL 17+ client tools (detected v%d).", tools.ClientMajorVersion))
		}
		bin := resolveToolPath(tools, "pg_combinebackup")
		args := []string{}
		if strings.TrimSpace(req.OutputDir) != "" {
			args = append(args, "-o", strings.TrimSpace(req.OutputDir))
		}
		for _, d := range req.CombineSourceDirs {
			if strings.TrimSpace(d) != "" {
				args = append(args, strings.TrimSpace(d))
			}
		}
		cmd := PlannedCommand{StepLabel: "pg_combinebackup", Binary: bin, Args: args, Output: req.OutputDir}
		return []PlannedCommand{cmd}, BackupCommandPreview{
			Command:        bin,
			Args:           args,
			DisplayCommand: FormatCommandForDisplay(bin, args),
			Warnings:       warnings,
		}, nil

	case "verify":
		bin := resolveToolPath(tools, "pg_verifybackup")
		args := []string{}
		if req.VerifyNoParseWals {
			args = append(args, "-n")
		}
		if strings.TrimSpace(req.VerifyBackupDir) != "" {
			args = append(args, strings.TrimSpace(req.VerifyBackupDir))
		}
		cmd := PlannedCommand{StepLabel: "pg_verifybackup", Binary: bin, Args: args, Output: req.VerifyBackupDir}
		return []PlannedCommand{cmd}, BackupCommandPreview{
			Command:        bin,
			Args:           args,
			DisplayCommand: FormatCommandForDisplay(bin, args),
			Warnings:       warnings,
		}, nil

	default: // "basebackup" or "incremental"
		if req.Operation == "incremental" && !tools.Capabilities.SupportsIncremental {
			warnings = append(warnings, fmt.Sprintf("Incremental base backup (--incremental) requires PostgreSQL 17+ (detected client v%d).", tools.ClientMajorVersion))
		}
		bin := resolveToolPath(tools, "pg_basebackup")
		args := baseConnArgs(cfg)
		if strings.TrimSpace(req.OutputDir) != "" {
			args = append(args, "-D", strings.TrimSpace(req.OutputDir))
		}
		fmtFlag := "p"
		if strings.ToLower(req.Format) == "tar" {
			fmtFlag = "t"
		}
		args = append(args, "-F", fmtFlag)

		wal := strings.ToLower(strings.TrimSpace(req.WalMethod))
		if wal != "fetch" && wal != "none" {
			wal = "stream"
		}
		args = append(args, "-X", wal)

		chk := strings.ToLower(strings.TrimSpace(req.Checkpoint))
		if chk != "spread" {
			chk = "fast"
		}
		args = append(args, "-c", chk, "--progress", "--verbose")

		comp := strings.ToLower(strings.TrimSpace(req.Compression))
		if comp != "" && comp != "none" {
			if req.CompressionLevel > 0 {
				args = append(args, "--compress", fmt.Sprintf("%s:%d", comp, req.CompressionLevel))
			} else {
				args = append(args, "--compress", comp)
			}
		}
		if strings.TrimSpace(req.MaxRate) != "" {
			args = append(args, "--max-rate="+strings.TrimSpace(req.MaxRate))
		}
		if mc := strings.TrimSpace(req.ManifestChecksums); mc != "" {
			args = append(args, "--manifest-checksums="+mc)
		}
		for _, m := range req.TablespaceMappings {
			oldD := strings.TrimSpace(m.OldDir)
			newD := strings.TrimSpace(m.NewDir)
			if oldD != "" && newD != "" {
				args = append(args, "-T", oldD+"="+newD)
			}
		}
		if req.Operation == "incremental" && strings.TrimSpace(req.IncrementalManifestPath) != "" {
			args = append(args, "--incremental="+strings.TrimSpace(req.IncrementalManifestPath))
		}

		cmd := PlannedCommand{
			StepLabel: "pg_basebackup (" + req.Operation + ")",
			Binary:    bin,
			Args:      args,
			Output:    req.OutputDir,
		}
		return []PlannedCommand{cmd}, BackupCommandPreview{
			Command:        bin,
			Args:           args,
			DisplayCommand: FormatCommandForDisplay(bin, args),
			Warnings:       warnings,
		}, nil
	}
}

func buildPgRestoreArgs(cfg livedb.ConnectionConfig, tools ToolchainInfo, req RestoreRequest, sourcePath string, targetDB string, listFilePath string, forceCreate bool, warnings *[]string) []string {
	args := baseConnArgs(cfg)

	db := strings.TrimSpace(targetDB)
	if db == "" {
		db = cfg.Database
	}
	if db == "" {
		db = "postgres"
	}

	if req.CreateDB || forceCreate {
		// With --create, pg_restore connects to maintenance DB "postgres" to CREATE DATABASE before switching
		args = append(args, "--create", "-d", "postgres")
	} else {
		args = append(args, "-d", db)
	}

	if req.Clean {
		args = append(args, "--clean")
		if req.IfExists {
			args = append(args, "--if-exists")
		}
	}

	if req.SingleTransaction && req.ParallelJobs > 1 {
		*warnings = append(*warnings, "pg_restore cannot combine --single-transaction with --jobs > 1; ignoring --jobs when Single Transaction is enabled.")
		args = append(args, "--single-transaction")
	} else {
		if req.SingleTransaction {
			args = append(args, "--single-transaction")
		}
		if req.ParallelJobs > 1 {
			args = append(args, "--jobs="+strconv.Itoa(req.ParallelJobs))
		}
	}

	if req.ExitOnError {
		args = append(args, "--exit-on-error")
	}
	if req.NoOwner {
		args = append(args, "--no-owner")
	}
	if req.NoPrivileges {
		args = append(args, "--no-privileges")
	}
	if req.NoTablespaces {
		args = append(args, "--no-tablespaces")
	}
	if req.DisableTriggers {
		args = append(args, "--disable-triggers")
	}

	switch req.ContentMode {
	case "schema_only":
		args = append(args, "--schema-only")
	case "data_only":
		args = append(args, "--data-only")
	}

	for _, sec := range req.Sections {
		if s := strings.TrimSpace(sec); s != "" {
			args = append(args, "--section="+s)
		}
	}
	for _, s := range req.Schemas {
		if strings.TrimSpace(s) != "" {
			args = append(args, "--schema="+strings.TrimSpace(s))
		}
	}
	for _, t := range req.Tables {
		if strings.TrimSpace(t) != "" {
			args = append(args, "--table="+strings.TrimSpace(t))
		}
	}

	if req.IncludeStatistics && tools.Capabilities.SupportsStatisticsFlags {
		args = append(args, "--statistics")
	} else if req.NoStatistics && tools.Capabilities.SupportsStatisticsFlags {
		args = append(args, "--no-statistics")
	}

	if listFilePath != "" {
		args = append(args, "--use-list="+listFilePath)
	}
	if strings.TrimSpace(req.ExtraArgs) != "" {
		args = append(args, SplitExtraArgs(req.ExtraArgs)...)
	}
	args = append(args, sourcePath)
	return args
}

func buildPsqlRestoreArgs(cfg livedb.ConnectionConfig, req RestoreRequest, sourcePath string, targetDB string) []string {
	args := baseConnArgs(cfg)
	db := strings.TrimSpace(targetDB)
	if db == "" {
		db = cfg.Database
	}
	if db == "" {
		db = "postgres"
	}
	args = append(args, "-d", db, "-v", "ON_ERROR_STOP=1")
	if req.SingleTransaction {
		args = append(args, "--single-transaction")
	}
	if strings.TrimSpace(req.ExtraArgs) != "" {
		args = append(args, SplitExtraArgs(req.ExtraArgs)...)
	}
	args = append(args, "-f", sourcePath)
	return args
}

// ParseMultiDbManifest reads planiq-backup-manifest.json from a folder or direct file path.
func ParseMultiDbManifest(sourcePath string) (*MultiDbManifest, string, error) {
	p := strings.TrimSpace(sourcePath)
	if p == "" {
		return nil, "", fmt.Errorf("manifest path is empty")
	}
	baseDir := p
	if st, err := os.Stat(p); err == nil && st.IsDir() {
		baseDir = p
		p = filepath.Join(p, "planiq-backup-manifest.json")
	} else {
		baseDir = filepath.Dir(p)
	}
	raw, err := os.ReadFile(p)
	if err != nil {
		return nil, "", err
	}
	var m MultiDbManifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, "", err
	}
	return &m, baseDir, nil
}

// BuildRestorePlan builds restore CLI command(s) for archive, plain SQL, or multi-DB manifest restore.
func BuildRestorePlan(
	cfg livedb.ConnectionConfig,
	tools ToolchainInfo,
	req RestoreRequest,
	listFilePath string,
) ([]PlannedCommand, BackupCommandPreview, error) {
	var warnings []string

	switch req.SourceKind {
	case "plain_sql":
		bin := resolveToolPath(tools, "psql")
		args := buildPsqlRestoreArgs(cfg, req, req.SourcePath, req.TargetDatabase)
		cmds := []PlannedCommand{{StepLabel: "psql restore", Binary: bin, Args: args, Output: req.TargetDatabase}}
		displayLines := []string{FormatCommandForDisplay(bin, args)}
		if req.RunAnalyzeAfter {
			pBin := resolveToolPath(tools, "psql")
			aArgs := append(baseConnArgs(cfg), "-d", strings.TrimSpace(req.TargetDatabase), "-c", "ANALYZE VERBOSE;")
			cmds = append(cmds, PlannedCommand{StepLabel: "Post-restore ANALYZE", Binary: pBin, Args: aArgs, Output: req.TargetDatabase})
			displayLines = append(displayLines, FormatCommandForDisplay(pBin, aArgs))
		}
		return cmds, BackupCommandPreview{
			Command:        bin,
			Args:           args,
			DisplayCommand: strings.Join(displayLines, "\n"),
			Warnings:       warnings,
		}, nil

	case "multi_db_manifest":
		manifest, baseDir, err := ParseMultiDbManifest(req.SourcePath)
		if err != nil {
			return nil, BackupCommandPreview{}, fmt.Errorf("failed to read multi-db manifest: %w", err)
		}
		var cmds []PlannedCommand
		var displayLines []string
		if req.RestoreGlobals && manifest.GlobalsFile != "" {
			gPath := filepath.Join(baseDir, manifest.GlobalsFile)
			pBin := resolveToolPath(tools, "psql")
			gArgs := buildPsqlRestoreArgs(cfg, RestoreRequest{}, gPath, "postgres")
			cmds = append(cmds, PlannedCommand{StepLabel: "Restore Globals", Binary: pBin, Args: gArgs, Output: "postgres"})
			displayLines = append(displayLines, FormatCommandForDisplay(pBin, gArgs))
		}
		selected := make(map[string]bool)
		for _, db := range req.SelectedDatabases {
			selected[db] = true
		}
		for _, entry := range manifest.Entries {
			if len(selected) > 0 && !selected[entry.Database] {
				continue
			}
			fullPath := filepath.Join(baseDir, entry.OutputPath)
			if entry.Format == "plain" {
				pBin := resolveToolPath(tools, "psql")
				pArgs := buildPsqlRestoreArgs(cfg, req, fullPath, entry.Database)
				cmds = append(cmds, PlannedCommand{StepLabel: "Restore DB (psql): " + entry.Database, Binary: pBin, Args: pArgs, Output: entry.Database})
				displayLines = append(displayLines, FormatCommandForDisplay(pBin, pArgs))
			} else {
				rBin := resolveToolPath(tools, "pg_restore")
				rArgs := buildPgRestoreArgs(cfg, tools, req, fullPath, entry.Database, "", true, &warnings)
				cmds = append(cmds, PlannedCommand{StepLabel: "Restore DB: " + entry.Database, Binary: rBin, Args: rArgs, Output: entry.Database})
				displayLines = append(displayLines, FormatCommandForDisplay(rBin, rArgs))
			}
			if req.RunAnalyzeAfter {
				pBin := resolveToolPath(tools, "psql")
				aArgs := append(baseConnArgs(cfg), "-d", entry.Database, "-c", "ANALYZE VERBOSE;")
				cmds = append(cmds, PlannedCommand{StepLabel: "ANALYZE: " + entry.Database, Binary: pBin, Args: aArgs, Output: entry.Database})
				displayLines = append(displayLines, FormatCommandForDisplay(pBin, aArgs))
			}
		}
		if len(cmds) == 0 {
			return nil, BackupCommandPreview{Warnings: warnings}, fmt.Errorf("no databases matched in multi-db manifest")
		}
		return cmds, BackupCommandPreview{
			Command:        cmds[0].Binary,
			Args:           cmds[0].Args,
			DisplayCommand: strings.Join(displayLines, "\n"),
			Warnings:       warnings,
		}, nil

	default: // "archive"
		bin := resolveToolPath(tools, "pg_restore")
		useList := listFilePath
		if len(req.SelectedTocIDs) > 0 && useList == "" {
			useList = "<filtered-toc.list>"
		}
		args := buildPgRestoreArgs(cfg, tools, req, req.SourcePath, req.TargetDatabase, useList, false, &warnings)
		cmds := []PlannedCommand{{StepLabel: "pg_restore", Binary: bin, Args: args, Output: req.TargetDatabase}}
		displayLines := []string{FormatCommandForDisplay(bin, args)}
		if req.RunAnalyzeAfter {
			pBin := resolveToolPath(tools, "psql")
			targetDB := strings.TrimSpace(req.TargetDatabase)
			if targetDB == "" {
				targetDB = cfg.Database
			}
			aArgs := append(baseConnArgs(cfg), "-d", targetDB, "-c", "ANALYZE VERBOSE;")
			cmds = append(cmds, PlannedCommand{StepLabel: "Post-restore ANALYZE", Binary: pBin, Args: aArgs, Output: targetDB})
			displayLines = append(displayLines, FormatCommandForDisplay(pBin, aArgs))
		}
		return cmds, BackupCommandPreview{
			Command:        bin,
			Args:           args,
			DisplayCommand: strings.Join(displayLines, "\n"),
			Warnings:       warnings,
		}, nil
	}
}

// BuildDirectClonePlan builds a streaming pg_dump | pg_restore pipeline across DBs or servers (zero disk I/O).
func BuildDirectClonePlan(
	srcCfg livedb.ConnectionConfig,
	dstCfg livedb.ConnectionConfig,
	tools ToolchainInfo,
	req DirectCloneRequest,
) (PlannedCommand, PlannedCommand, *PlannedCommand, BackupCommandPreview, error) {
	var warnings []string
	srcDB := strings.TrimSpace(req.SourceDatabase)
	if srcDB == "" {
		srcDB = srcCfg.Database
	}
	dstDB := strings.TrimSpace(req.TargetDatabase)
	if dstDB == "" {
		dstDB = srcDB + "_clone"
	}

	if srcCfg.Server == dstCfg.Server && srcCfg.Port == dstCfg.Port && strings.EqualFold(srcDB, dstDB) && !req.Clean {
		warnings = append(warnings, "Source and target database are identical on the same server; choose a different target database name.")
	}

	dumpArgs := baseConnArgs(srcCfg)
	dumpArgs = append(dumpArgs, "--format=custom", "--compress=lz4")
	if !tools.Capabilities.SupportsZstdLz4 {
		dumpArgs[len(dumpArgs)-1] = "--compress=1"
	}
	switch req.ContentMode {
	case "schema_only":
		dumpArgs = append(dumpArgs, "--schema-only")
	case "data_only":
		dumpArgs = append(dumpArgs, "--data-only")
	}
	for _, s := range req.Schemas {
		if strings.TrimSpace(s) != "" {
			dumpArgs = append(dumpArgs, "--schema="+strings.TrimSpace(s))
		}
	}
	for _, t := range req.Tables {
		if strings.TrimSpace(t) != "" {
			dumpArgs = append(dumpArgs, "--table="+strings.TrimSpace(t))
		}
	}
	if req.NoOwner {
		dumpArgs = append(dumpArgs, "--no-owner")
	}
	if req.NoPrivileges {
		dumpArgs = append(dumpArgs, "--no-privileges")
	}
	dumpArgs = append(dumpArgs, srcDB)

	restoreArgs := baseConnArgs(dstCfg)
	if req.CreateTargetDB {
		restoreArgs = append(restoreArgs, "--create", "-d", "postgres")
	} else {
		restoreArgs = append(restoreArgs, "-d", dstDB)
	}
	if req.Clean {
		restoreArgs = append(restoreArgs, "--clean", "--if-exists")
	}
	if req.NoOwner {
		restoreArgs = append(restoreArgs, "--no-owner")
	}
	if req.NoPrivileges {
		restoreArgs = append(restoreArgs, "--no-privileges")
	}
	restoreArgs = append(restoreArgs, "--exit-on-error")

	dumpBin := resolveToolPath(tools, "pg_dump")
	restoreBin := resolveToolPath(tools, "pg_restore")
	dumpCmd := PlannedCommand{StepLabel: "Stream Dump (" + srcDB + ")", Binary: dumpBin, Args: dumpArgs, Output: srcDB}
	restoreCmd := PlannedCommand{StepLabel: "Stream Restore (" + dstDB + ")", Binary: restoreBin, Args: restoreArgs, Output: dstDB}

	display := FormatCommandForDisplay(dumpBin, dumpArgs) + " |\n  " + FormatCommandForDisplay(restoreBin, restoreArgs)

	var analyzeCmd *PlannedCommand
	if req.RunAnalyzeAfter {
		pBin := resolveToolPath(tools, "psql")
		aArgs := append(baseConnArgs(dstCfg), "-d", dstDB, "-c", "ANALYZE VERBOSE;")
		analyzeCmd = &PlannedCommand{StepLabel: "Post-clone ANALYZE", Binary: pBin, Args: aArgs, Output: dstDB}
		display += "\n" + FormatCommandForDisplay(pBin, aArgs)
	}

	preview := BackupCommandPreview{
		Command:        dumpBin,
		Args:           dumpArgs,
		DisplayCommand: display,
		Warnings:       warnings,
	}
	return dumpCmd, restoreCmd, analyzeCmd, preview, nil
}

var tocLineRegex = regexp.MustCompile(`^(\d+);\s+\d+\s+\d+\s+(.*)$`)

// ParseTocLines converts raw `pg_restore --list` output lines into structured TocEntry records.
func ParseTocLines(raw string) []TocEntry {
	var entries []TocEntry
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ";") {
			continue
		}
		m := tocLineRegex.FindStringSubmatch(line)
		if len(m) < 3 {
			continue
		}
		id, err := strconv.Atoi(m[1])
		if err != nil {
			continue
		}
		rest := strings.TrimSpace(m[2])
		// Rest pattern examples:
		//   TABLE public alerts postgres
		//   FK CONSTRAINT public alerts alerts_pkey postgres
		//   TABLE DATA public alerts postgres
		//   SCHEMA - public postgres
		//   EXTENSION - pg_stat_statements
		fields := strings.Fields(rest)
		entry := TocEntry{
			ID:      id,
			RawLine: line,
		}
		if len(fields) >= 4 {
			// Two-word types: TABLE DATA, FK CONSTRAINT, DEFAULT ACL, INDEX ATTACH, SEQUENCE SET, etc.
			twoWordTypes := map[string]bool{
				"TABLE": true, "FK": true, "DEFAULT": true, "INDEX": true, "SEQUENCE": true,
				"PROCEDURAL": true, "FOREIGN": true, "USER": true, "EVENT": true, "ROW": true,
				"MATERIALIZED": true, "TEXT": true,
			}
			if twoWordTypes[fields[0]] && len(fields) >= 5 {
				entry.ObjectType = fields[0] + " " + fields[1]
				entry.Schema = fields[2]
				entry.Name = fields[3]
				entry.Owner = fields[4]
			} else {
				entry.ObjectType = fields[0]
				entry.Schema = fields[1]
				entry.Name = fields[2]
				entry.Owner = fields[3]
			}
		} else if len(fields) == 3 {
			entry.ObjectType = fields[0]
			entry.Schema = fields[1]
			entry.Name = fields[2]
		} else {
			entry.ObjectType = rest
		}
		if entry.Schema == "-" {
			entry.Schema = ""
		}
		switch entry.ObjectType {
		case "TABLE DATA", "SEQUENCE SET":
			entry.Section = "data"
		case "INDEX", "CONSTRAINT", "FK CONSTRAINT", "TRIGGER", "POLICY", "ROW SECURITY", "DEFAULT ACL":
			entry.Section = "post-data"
		default:
			entry.Section = "pre-data"
		}
		entries = append(entries, entry)
	}
	return entries
}

// InspectArchiveTOC invokes `pg_restore --list` on an archive file or directory and returns parsed TOC entries.
func InspectArchiveTOC(ctx context.Context, tools ToolchainInfo, sourcePath string) ([]TocEntry, error) {
	bin := resolveToolPath(tools, "pg_restore")
	qCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	out, err := exec.CommandContext(qCtx, bin, "--list", sourcePath).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("pg_restore --list failed: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return ParseTocLines(string(out)), nil
}

// WriteFilteredTocList materializes a filtered --use-list temporary file matching SelectedTocIDs.
func WriteFilteredTocList(entries []TocEntry, selectedIDs []int) (string, error) {
	keep := make(map[int]bool, len(selectedIDs))
	for _, id := range selectedIDs {
		keep[id] = true
	}
	f, err := os.CreateTemp("", "planiq-toc-*.list")
	if err != nil {
		return "", err
	}
	defer f.Close()
	for _, e := range entries {
		if keep[e.ID] {
			if _, err := fmt.Fprintln(f, e.RawLine); err != nil {
				return "", err
			}
		}
	}
	return f.Name(), nil
}
