package configdb

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEncryptDecryptSecret_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	key, err := loadOrCreateKey(dir)
	if err != nil {
		t.Fatalf("loadOrCreateKey failed: %v", err)
	}
	if len(key) != keyByteLen {
		t.Fatalf("expected %d-byte key, got %d", keyByteLen, len(key))
	}

	secret := "S3cur3!DbP@ssw0rd#2026"
	encrypted, err := encryptSecret(key, secret)
	if err != nil {
		t.Fatalf("encryptSecret failed: %v", err)
	}
	if !strings.HasPrefix(encrypted, encPrefix) {
		t.Fatalf("expected prefix %q, got %q", encPrefix, encrypted)
	}
	if strings.Contains(encrypted, secret) {
		t.Fatalf("ciphertext unexpectedly contains plaintext")
	}

	decrypted, err := decryptSecret(key, encrypted)
	if err != nil {
		t.Fatalf("decryptSecret failed: %v", err)
	}
	if decrypted != secret {
		t.Fatalf("expected %q, got %q", secret, decrypted)
	}
}

func TestEncryptDecryptSecret_EmptyAndLegacyPlaintext(t *testing.T) {
	dir := t.TempDir()
	key, err := loadOrCreateKey(dir)
	if err != nil {
		t.Fatalf("loadOrCreateKey failed: %v", err)
	}

	encEmpty, err := encryptSecret(key, "")
	if err != nil || encEmpty != "" {
		t.Fatalf("expected empty string passthrough, got %q (err=%v)", encEmpty, err)
	}

	decEmpty, err := decryptSecret(key, "")
	if err != nil || decEmpty != "" {
		t.Fatalf("expected empty string passthrough on decrypt, got %q (err=%v)", decEmpty, err)
	}

	// Legacy unencrypted value should pass through smoothly for existing SQLite configs
	legacy := "legacy_plaintext_pw"
	decLegacy, err := decryptSecret(key, legacy)
	if err != nil || decLegacy != legacy {
		t.Fatalf("expected legacy plaintext passthrough %q, got %q (err=%v)", legacy, decLegacy, err)
	}
}

func TestLoadOrCreateKey_PersistsAcrossCalls(t *testing.T) {
	dir := t.TempDir()
	key1, err := loadOrCreateKey(dir)
	if err != nil {
		t.Fatalf("first loadOrCreateKey failed: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, keyFileName)); err != nil {
		t.Fatalf("expected key file on disk: %v", err)
	}

	key2, err := loadOrCreateKey(dir)
	if err != nil {
		t.Fatalf("second loadOrCreateKey failed: %v", err)
	}
	if string(key1) != string(key2) {
		t.Fatalf("expected persisted key to match across reloads")
	}
}

func TestSaveAndGetDBConnection_AllowRbacWriteRoundTrip(t *testing.T) {
	dir := t.TempDir()
	key, err := loadOrCreateKey(dir)
	if err != nil {
		t.Fatalf("loadOrCreateKey failed: %v", err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "test_conn.db"))
	if err != nil {
		t.Fatalf("sql.Open failed: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE db_connections (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			server TEXT NOT NULL,
			port INTEGER NOT NULL DEFAULT 1433,
			database_name TEXT NOT NULL,
			auth_type TEXT NOT NULL DEFAULT 'sql',
			username TEXT DEFAULT '',
			password TEXT DEFAULT '',
			encrypt INTEGER NOT NULL DEFAULT 0,
			trust_server_certificate INTEGER NOT NULL DEFAULT 1,
			application_intent TEXT NOT NULL DEFAULT 'ReadOnly',
			timeout_seconds INTEGER NOT NULL DEFAULT 4,
			is_default INTEGER NOT NULL DEFAULT 0,
			engine TEXT NOT NULL DEFAULT 'sqlserver',
			allow_rbac_write INTEGER NOT NULL DEFAULT 0,
			allow_backup_restore INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
	`)
	if err != nil {
		t.Fatalf("create table failed: %v", err)
	}

	store := &Store{db: db, secretKey: key}
	saved, err := store.SaveDBConnection(DBConnectionProfile{
		Name:               "PG RBAC Test",
		Server:             "127.0.0.1",
		Port:               5432,
		Database:           "postgres",
		AuthType:           "sql",
		Username:           "postgres",
		Password:           "secret",
		Engine:             "postgresql",
		AllowRbacWrite:     true,
		AllowBackupRestore: true,
	})
	if err != nil {
		t.Fatalf("SaveDBConnection failed: %v", err)
	}

	list, err := store.GetDBConnections()
	if err != nil || len(list) != 1 {
		t.Fatalf("GetDBConnections failed: len=%d err=%v", len(list), err)
	}
	if !list[0].AllowRbacWrite {
		t.Fatalf("expected AllowRbacWrite=true, got false")
	}
	if !list[0].AllowBackupRestore {
		t.Fatalf("expected AllowBackupRestore=true, got false")
	}
	if list[0].ID != saved.ID {
		t.Fatalf("expected ID %q, got %q", saved.ID, list[0].ID)
	}
}

func TestBackupSettingsAndJobs_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(dir, "test_backup.db"))
	if err != nil {
		t.Fatalf("sql.Open failed: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE pg_backup_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE pg_backup_jobs (
			id TEXT PRIMARY KEY,
			started_at TEXT NOT NULL,
			finished_at TEXT DEFAULT '',
			duration_ms INTEGER NOT NULL DEFAULT 0,
			engine TEXT NOT NULL DEFAULT 'postgresql',
			server TEXT DEFAULT '',
			database_name TEXT DEFAULT '',
			operation TEXT NOT NULL,
			mode TEXT DEFAULT '',
			format TEXT DEFAULT '',
			output_path TEXT DEFAULT '',
			size_bytes INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL,
			exit_code INTEGER NOT NULL DEFAULT 0,
			command_preview TEXT DEFAULT '',
			error_message TEXT DEFAULT ''
		);
	`)
	if err != nil {
		t.Fatalf("create tables failed: %v", err)
	}

	store := &Store{db: db}
	if err := store.SetBackupBinDir(`C:\Program Files\PostgreSQL\18\bin`); err != nil {
		t.Fatalf("SetBackupBinDir failed: %v", err)
	}
	gotDir, err := store.GetBackupBinDir()
	if err != nil || gotDir != `C:\Program Files\PostgreSQL\18\bin` {
		t.Fatalf("GetBackupBinDir got %q err=%v", gotDir, err)
	}

	job := PgBackupJobRecord{
		ID:             "job_1",
		StartedAt:      "2026-11-26T10:00:00Z",
		FinishedAt:     "2026-11-26T10:00:05Z",
		DurationMs:     5000,
		Server:         "127.0.0.1",
		DatabaseName:   "postgres",
		Operation:      "backup",
		Mode:           "full_db",
		Format:         "custom",
		OutputPath:     `D:\backups\pg.dump`,
		SizeBytes:      102400,
		Status:         "succeeded",
		ExitCode:       0,
		CommandPreview: "pg_dump -Fc -f D:\\backups\\pg.dump postgres",
	}
	if err := store.SaveBackupJob(job); err != nil {
		t.Fatalf("SaveBackupJob failed: %v", err)
	}
	jobs, err := store.GetBackupJobs(10)
	if err != nil || len(jobs) != 1 || jobs[0].ID != "job_1" || jobs[0].SizeBytes != 102400 {
		t.Fatalf("GetBackupJobs mismatch: %+v err=%v", jobs, err)
	}
	if err := store.DeleteBackupJob("job_1"); err != nil {
		t.Fatalf("DeleteBackupJob failed: %v", err)
	}
	jobs, _ = store.GetBackupJobs(10)
	if len(jobs) != 0 {
		t.Fatalf("expected 0 jobs after delete, got %d", len(jobs))
	}

	_, err = db.Exec(`
		CREATE TABLE pg_backup_profiles (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			kind TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
	`)
	if err != nil {
		t.Fatalf("create pg_backup_profiles failed: %v", err)
	}
	prof, err := store.SaveBackupProfile(PgBackupProfile{
		Name:        "Turbo Zstd",
		Kind:        "logical",
		PayloadJSON: `{"format":"directory","compression":"zstd"}`,
	})
	if err != nil || prof.ID == "" {
		t.Fatalf("SaveBackupProfile failed: %v", err)
	}
	profs, err := store.GetBackupProfiles()
	if err != nil || len(profs) != 1 || profs[0].Name != "Turbo Zstd" {
		t.Fatalf("GetBackupProfiles mismatch: %+v err=%v", profs, err)
	}
	if err := store.DeleteBackupProfile(prof.ID); err != nil {
		t.Fatalf("DeleteBackupProfile failed: %v", err)
	}
	profs, _ = store.GetBackupProfiles()
	if len(profs) != 0 {
		t.Fatalf("expected 0 profiles after delete, got %d", len(profs))
	}
}
