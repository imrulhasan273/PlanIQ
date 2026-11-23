package configdb

import (
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
