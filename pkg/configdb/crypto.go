package configdb

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const (
	encPrefix   = "enc:v1:"
	keyFileName = ".planiq_key"
	keyByteLen  = 32 // AES-256
)

// loadOrCreateKey loads a 32-byte AES-256 key from keyFileName inside dir,
// generating and persisting a new cryptographically random key on first run.
func loadOrCreateKey(dir string) ([]byte, error) {
	keyPath := filepath.Join(dir, keyFileName)
	raw, err := os.ReadFile(keyPath)
	if err == nil {
		decoded, decErr := hex.DecodeString(strings.TrimSpace(string(raw)))
		if decErr == nil && len(decoded) == keyByteLen {
			return decoded, nil
		}
	}

	key := make([]byte, keyByteLen)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("failed to generate encryption key: %w", err)
	}

	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create config directory: %w", err)
	}
	if err := os.WriteFile(keyPath, []byte(hex.EncodeToString(key)), 0600); err != nil {
		return nil, fmt.Errorf("failed to persist encryption key: %w", err)
	}
	return key, nil
}

// encryptSecret encrypts plaintext with AES-256-GCM and returns an "enc:v1:<base64>" string.
// Empty strings are returned unchanged so connections without stored passwords remain empty.
func encryptSecret(key []byte, plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	if len(key) != keyByteLen {
		return "", fmt.Errorf("invalid encryption key length: %d", len(key))
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return encPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// decryptSecret decrypts an "enc:v1:" AES-256-GCM payload.
// Legacy plaintext values without the "enc:v1:" prefix are returned unchanged for backward compatibility.
func decryptSecret(key []byte, stored string) (string, error) {
	if stored == "" || !strings.HasPrefix(stored, encPrefix) {
		return stored, nil
	}
	if len(key) != keyByteLen {
		return "", fmt.Errorf("invalid decryption key length: %d", len(key))
	}

	payload, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, encPrefix))
	if err != nil {
		return "", fmt.Errorf("invalid encrypted secret encoding: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(payload) < nonceSize {
		return "", fmt.Errorf("encrypted secret truncated")
	}

	nonce, ciphertext := payload[:nonceSize], payload[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("failed to decrypt secret: %w", err)
	}
	return string(plaintext), nil
}
