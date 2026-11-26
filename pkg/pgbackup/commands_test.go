package pgbackup

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/imrulhasan273/PlanIQ/pkg/livedb"
)

func mockToolchain(major int) ToolchainInfo {
	return ToolchainInfo{
		ClientMajorVersion: major,
		Compatible:         true,
		Capabilities:       CapabilitiesForVersion(major),
		Tools: map[string]ToolBinaryInfo{
			"pg_dump":          {Name: "pg_dump", Path: "/usr/bin/pg_dump", Available: true, MajorVersion: major},
			"pg_dumpall":       {Name: "pg_dumpall", Path: "/usr/bin/pg_dumpall", Available: true, MajorVersion: major},
			"pg_restore":       {Name: "pg_restore", Path: "/usr/bin/pg_restore", Available: true, MajorVersion: major},
			"pg_basebackup":    {Name: "pg_basebackup", Path: "/usr/bin/pg_basebackup", Available: true, MajorVersion: major},
			"pg_verifybackup":  {Name: "pg_verifybackup", Path: "/usr/bin/pg_verifybackup", Available: true, MajorVersion: major},
			"pg_combinebackup": {Name: "pg_combinebackup", Path: "/usr/bin/pg_combinebackup", Available: true, MajorVersion: major},
			"psql":             {Name: "psql", Path: "/usr/bin/psql", Available: true, MajorVersion: major},
		},
	}
}

func mockCfg() livedb.ConnectionConfig {
	return livedb.ConnectionConfig{
		Engine:   "postgresql",
		Server:   "127.0.0.1",
		Port:     5432,
		Database: "appdb",
		Username: "postgres",
		Password: "top-secret-password",
	}
}

func TestParsePgMajorVersion(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"pg_dump (PostgreSQL) 14.12", 14},
		{"pg_dump (PostgreSQL) 15.8 (Debian 15.8-1.pgdg120+1)", 15},
		{"pg_dump (PostgreSQL) 16.4", 16},
		{"pg_dump (PostgreSQL) 17.2", 17},
		{"pg_dump (PostgreSQL) 18beta1", 18},
		{"pg_dump (PostgreSQL) 19devel", 19},
		{"invalid output", 0},
	}
	for _, tc := range cases {
		if got := ParsePgMajorVersion(tc.in); got != tc.want {
			t.Errorf("ParsePgMajorVersion(%q) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

func TestCapabilitiesForVersion(t *testing.T) {
	c14 := CapabilitiesForVersion(14)
	if c14.SupportsZstdLz4 || c14.SupportsIncremental || c14.SupportsStatisticsFlags {
		t.Fatalf("unexpected capabilities for PG 14: %+v", c14)
	}
	c17 := CapabilitiesForVersion(17)
	if !c17.SupportsZstdLz4 || !c17.SupportsIncremental || !c17.SupportsFilterFile || c17.SupportsNonTextDumpall {
		t.Fatalf("unexpected capabilities for PG 17: %+v", c17)
	}
	c19 := CapabilitiesForVersion(19)
	if !c19.SupportsNonTextDumpall || !c19.SupportsStatisticsFlags || !c19.ForwardCompatiblePG19 {
		t.Fatalf("unexpected capabilities for PG 19: %+v", c19)
	}
}

func TestBuildLogicalBackupPlan_SingleDB_And_SecretIsolation(t *testing.T) {
	cfg := mockCfg()
	tools := mockToolchain(18)
	req := LogicalBackupRequest{
		Mode:              "table",
		Database:          "appdb",
		Tables:            []string{"public.orders", "public.order_items"},
		ContentMode:       "schema_only",
		Format:            "directory",
		Compression:       "zstd",
		CompressionLevel:  3,
		ParallelJobs:      4,
		NoOwner:           true,
		IncludeStatistics: true,
		OutputPath:        "/tmp/orders_dir",
	}

	cmds, manifest, preview, err := BuildLogicalBackupPlan(cfg, tools, nil, req)
	if err != nil {
		t.Fatalf("BuildLogicalBackupPlan failed: %v", err)
	}
	if manifest != nil || len(cmds) != 1 {
		t.Fatalf("expected 1 command and nil manifest, got %d cmds", len(cmds))
	}
	joined := strings.Join(cmds[0].Args, " ")
	for _, want := range []string{"--format=directory", "--compress zstd:3", "--jobs=4", "--schema-only", "--statistics", "--table=public.orders", "--no-owner"} {
		if !strings.Contains(joined, want) {
			t.Errorf("expected %q in args %q", want, joined)
		}
	}
	if strings.Contains(joined, cfg.Password) || strings.Contains(preview.DisplayCommand, cfg.Password) {
		t.Fatalf("password leaked into CLI args or preview!")
	}
}

func TestBuildLogicalBackupPlan_TablespaceScopeAndMultiDB(t *testing.T) {
	cfg := mockCfg()
	tools := mockToolchain(18)
	catalog := &BackupCatalog{
		Tables: []PgTableMeta{
			{Schema: "public", Name: "fast_events", Tablespace: "nvme_ts"},
			{Schema: "archive", Name: "old_logs", Tablespace: "pg_default"},
		},
	}

	// Tablespace mode resolves matching tables automatically
	cmds, _, _, err := BuildLogicalBackupPlan(cfg, tools, catalog, LogicalBackupRequest{
		Mode:        "tablespace",
		Database:    "appdb",
		Tablespaces: []string{"nvme_ts"},
		Format:      "custom",
		OutputPath:  "/tmp/nvme.dump",
	})
	if err != nil {
		t.Fatalf("tablespace plan failed: %v", err)
	}
	joined := strings.Join(cmds[0].Args, " ")
	if !strings.Contains(joined, "--table=public.fast_events") || strings.Contains(joined, "old_logs") {
		t.Fatalf("unexpected tablespace table selection: %s", joined)
	}

	// Multi-DB mode emits globals + per-DB pg_dump + manifest
	cmds, manifest, _, err := BuildLogicalBackupPlan(cfg, tools, catalog, LogicalBackupRequest{
		Mode:           "multi_db",
		Databases:      []string{"db1", "db2"},
		IncludeGlobals: true,
		Format:         "custom",
		OutputPath:     "/tmp/batch_out",
	})
	if err != nil {
		t.Fatalf("multi_db plan failed: %v", err)
	}
	if len(cmds) != 3 || manifest == nil || manifest.GlobalsFile != "globals.sql" || len(manifest.Entries) != 2 {
		t.Fatalf("unexpected multi_db plan: cmds=%d manifest=%+v", len(cmds), manifest)
	}
	if filepath.Base(cmds[1].Output) != "db1.dump" {
		t.Fatalf("expected db1.dump output, got %s", cmds[1].Output)
	}
}

func TestBuildPhysicalBackupPlan_IncrementalCombineVerify(t *testing.T) {
	cfg := mockCfg()
	tools := mockToolchain(17)

	cmds, _, err := BuildPhysicalBackupPlan(cfg, tools, PhysicalBackupRequest{
		Operation:               "incremental",
		OutputDir:               "/backups/inc1",
		Format:                  "plain",
		WalMethod:               "stream",
		Checkpoint:              "fast",
		Compression:             "server-zstd",
		IncrementalManifestPath: "/backups/base/backup_manifest",
		TablespaceMappings:      []TablespaceMapping{{OldDir: "/pg/ts1", NewDir: "/backups/ts1"}},
	})
	if err != nil {
		t.Fatalf("incremental plan failed: %v", err)
	}
	joined := strings.Join(cmds[0].Args, " ")
	for _, want := range []string{"--incremental=/backups/base/backup_manifest", "-T /pg/ts1=/backups/ts1", "--compress server-zstd"} {
		if !strings.Contains(joined, want) {
			t.Errorf("expected %q in %q", want, joined)
		}
	}

	cCmds, _, _ := BuildPhysicalBackupPlan(cfg, tools, PhysicalBackupRequest{
		Operation:         "combine",
		OutputDir:         "/backups/synthesized",
		CombineSourceDirs: []string{"/backups/base", "/backups/inc1"},
	})
	if cCmds[0].Args[0] != "-o" || cCmds[0].Args[1] != "/backups/synthesized" {
		t.Fatalf("unexpected combine args: %+v", cCmds[0].Args)
	}
}

func TestParseTocLines(t *testing.T) {
	raw := `;
; Archive created at 2026-11-26
215; 2615 2200 SCHEMA - public postgres
219; 1259 16400 TABLE public alerts postgres
3501; 0 16400 TABLE DATA public alerts postgres
3320; 2606 16420 CONSTRAINT public alerts alerts_pkey postgres
`
	entries := ParseTocLines(raw)
	if len(entries) != 4 {
		t.Fatalf("expected 4 TOC entries, got %d", len(entries))
	}
	if entries[0].ID != 215 || entries[0].ObjectType != "SCHEMA" || entries[0].Name != "public" {
		t.Fatalf("unexpected entry 0: %+v", entries[0])
	}
	if entries[2].ID != 3501 || entries[2].ObjectType != "TABLE DATA" || entries[2].Section != "data" || entries[2].Schema != "public" || entries[2].Name != "alerts" {
		t.Fatalf("unexpected TABLE DATA entry: %+v", entries[2])
	}
	if entries[3].Section != "post-data" {
		t.Fatalf("expected CONSTRAINT section post-data, got %s", entries[3].Section)
	}
}

func TestEnterpriseHelpers_Sha256_Filter_Script_DiskSpace(t *testing.T) {
	dir := t.TempDir()
	dumpFile := filepath.Join(dir, "sample.dump")
	if err := os.WriteFile(dumpFile, []byte("PGDMP_TEST_PAYLOAD"), 0o644); err != nil {
		t.Fatal(err)
	}

	scPath, sum, err := WriteSha256Sidecar(dumpFile)
	if err != nil || scPath == "" || len(sum) != 64 {
		t.Fatalf("WriteSha256Sidecar failed: err=%v sum=%s", err, sum)
	}
	vr, err := VerifySha256Sidecar(dumpFile)
	if err != nil || !vr.Matched {
		t.Fatalf("expected checksum verify match, got %+v err=%v", vr, err)
	}

	// Tamper file and verify mismatch detection
	_ = os.WriteFile(dumpFile, []byte("CORRUPTED"), 0o644)
	vr2, _ := VerifySha256Sidecar(dumpFile)
	if vr2.Matched {
		t.Fatalf("expected mismatch after file tamper")
	}

	// Filter rules file
	fPath, err := WriteFilterFile([]BackupFilterRule{
		{Action: "include", ObjectType: "table", Pattern: "public.orders*"},
		{Action: "exclude", ObjectType: "table_data", Pattern: "public.audit_log"},
	})
	if err != nil || fPath == "" {
		t.Fatalf("WriteFilterFile failed: %v", err)
	}
	defer os.Remove(fPath)
	rawFilter, _ := os.ReadFile(fPath)
	if !strings.Contains(string(rawFilter), "include table public.orders*") || !strings.Contains(string(rawFilter), "exclude table_data public.audit_log") {
		t.Fatalf("unexpected filter content:\n%s", string(rawFilter))
	}

	// Script generation for Windows PowerShell and Linux Bash (Ubuntu / AlmaLinux)
	cfg := mockCfg()
	ps := GenerateAutomationScript(cfg, ScriptExportRequest{TargetOS: "windows_ps1", RetentionDays: 14, IncludeSha256: true, Database: "appdb", Mode: "full_db"})
	if !strings.Contains(ps, "pg_dump.exe") || !strings.Contains(ps, "RetentionDays = 14") || !strings.Contains(ps, "Get-FileHash") {
		t.Fatalf("unexpected powershell script:\n%s", ps)
	}
	sh := GenerateAutomationScript(cfg, ScriptExportRequest{TargetOS: "linux_bash", RetentionDays: 7, IncludeSha256: true, Database: "appdb", Mode: "full_db"})
	if !strings.Contains(sh, "#!/usr/bin/env bash") || !strings.Contains(sh, "sha256sum") || !strings.Contains(sh, "RETENTION_DAYS=7") {
		t.Fatalf("unexpected bash script:\n%s", sh)
	}

	// Restore boost PGOPTIONS & post-restore ANALYZE
	env := BuildRestoreChildEnv(cfg, true, "1GB")
	if !strings.Contains(strings.Join(env, "\n"), "PGOPTIONS=-c synchronous_commit=off -c maintenance_work_mem=1GB") {
		t.Fatalf("expected PGOPTIONS boost env var")
	}
	rCmds, rPreview, err := BuildRestorePlan(cfg, mockToolchain(18), RestoreRequest{
		SourcePath:      dumpFile,
		SourceKind:      "archive",
		TargetDatabase:  "appdb",
		ParallelJobs:    4,
		RunAnalyzeAfter: true,
	}, "")
	if err != nil || len(rCmds) != 2 || !strings.Contains(rPreview.DisplayCommand, "ANALYZE VERBOSE;") {
		t.Fatalf("expected pg_restore + ANALYZE commands, got %d cmds preview=%s err=%v", len(rCmds), rPreview.DisplayCommand, err)
	}

	// Direct Clone plan
	dCmd, rCmd, aCmd, cPrev, err := BuildDirectClonePlan(cfg, cfg, mockToolchain(18), DirectCloneRequest{
		SourceDatabase:  "appdb",
		TargetDatabase:  "appdb_staging",
		CreateTargetDB:  true,
		RunAnalyzeAfter: true,
	})
	if err != nil || dCmd.Binary == "" || rCmd.Binary == "" || aCmd == nil || !strings.Contains(cPrev.DisplayCommand, "|") {
		t.Fatalf("unexpected direct clone plan: %+v err=%v", cPrev, err)
	}

	// Cross-platform Disk space check
	ds, err := GetFreeDiskSpace(dir, 1024)
	if err != nil || ds.FreeBytes <= 0 || !ds.Sufficient {
		t.Fatalf("GetFreeDiskSpace failed on temp dir: %+v err=%v", ds, err)
	}
}
