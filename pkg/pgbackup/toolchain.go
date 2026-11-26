package pgbackup

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

var toolNames = []string{
	"pg_dump",
	"pg_dumpall",
	"pg_restore",
	"pg_basebackup",
	"pg_verifybackup",
	"pg_combinebackup",
	"psql",
}

var pgVersionRegex = regexp.MustCompile(`(\d+)(?:\.\d+)?`)

// ParsePgMajorVersion extracts the PostgreSQL major version number from `<tool> --version`.
func ParsePgMajorVersion(versionOutput string) int {
	// Expected forms:
	//   "pg_dump (PostgreSQL) 17.2"
	//   "pg_dump (PostgreSQL) 18devel"
	//   "pg_dump (PostgreSQL) 19beta1"
	//   "pg_dump (PostgreSQL) 16.4 (Ubuntu 16.4-1.pgdg22.04+1)"
	idx := strings.Index(versionOutput, ")")
	tail := versionOutput
	if idx != -1 && idx+1 < len(versionOutput) {
		tail = versionOutput[idx+1:]
	}
	match := pgVersionRegex.FindStringSubmatch(tail)
	if len(match) < 2 {
		return 0
	}
	v, err := strconv.Atoi(match[1])
	if err != nil {
		return 0
	}
	return v
}

// CapabilitiesForVersion returns PostgreSQL client feature gates for a given client major version.
func CapabilitiesForVersion(clientMajor int) ToolchainCapabilities {
	return ToolchainCapabilities{
		SupportsZstdLz4:         clientMajor >= 15,
		SupportsIncremental:     clientMajor >= 17,
		SupportsFilterFile:      clientMajor >= 17,
		SupportsNonTextDumpall:  clientMajor >= 18,
		SupportsStatisticsFlags: clientMajor >= 18,
		ForwardCompatiblePG19:   clientMajor >= 19,
	}
}

func exeName(base string) string {
	if runtime.GOOS == "windows" && !strings.HasSuffix(strings.ToLower(base), ".exe") {
		return base + ".exe"
	}
	return base
}

func candidateBinDirs(customBinDir string) []struct {
	dir    string
	source string
} {
	var list []struct {
		dir    string
		source string
	}
	seen := make(map[string]bool)
	add := func(dir, source string) {
		dir = strings.TrimSpace(dir)
		if dir == "" {
			return
		}
		clean := filepath.Clean(dir)
		key := strings.ToLower(clean)
		if seen[key] {
			return
		}
		if st, err := os.Stat(clean); err == nil && st.IsDir() {
			seen[key] = true
			list = append(list, struct {
				dir    string
				source string
			}{dir: clean, source: source})
		}
	}

	if customBinDir != "" {
		add(customBinDir, "custom")
	}

	if p, err := exec.LookPath(exeName("pg_dump")); err == nil {
		add(filepath.Dir(p), "path")
	}

	versions := []string{"19", "18", "17", "16", "15", "14", "13"}
	switch runtime.GOOS {
	case "windows":
		progFiles := []string{os.Getenv("ProgramFiles"), `C:\Program Files`, os.Getenv("ProgramFiles(x86)")}
		for _, v := range versions {
			for _, pf := range progFiles {
				if pf != "" {
					add(filepath.Join(pf, "PostgreSQL", v, "bin"), "auto")
				}
			}
		}
	case "darwin":
		for _, v := range versions {
			add(fmt.Sprintf("/opt/homebrew/opt/postgresql@%s/bin", v), "auto")
			add(fmt.Sprintf("/usr/local/opt/postgresql@%s/bin", v), "auto")
			add(fmt.Sprintf("/Library/PostgreSQL/%s/bin", v), "auto")
			add(fmt.Sprintf("/Applications/Postgres.app/Contents/Versions/%s/bin", v), "auto")
		}
		add("/opt/homebrew/bin", "auto")
		add("/usr/local/bin", "auto")
	default:
		for _, v := range versions {
			add(fmt.Sprintf("/usr/lib/postgresql/%s/bin", v), "auto")
			add(fmt.Sprintf("/usr/pgsql-%s/bin", v), "auto")
		}
		add("/usr/bin", "auto")
		add("/usr/local/bin", "auto")
	}

	return list
}

func probeToolBinary(fullPath, name string) ToolBinaryInfo {
	info := ToolBinaryInfo{
		Name:      name,
		Path:      fullPath,
		Available: false,
	}
	if fullPath == "" {
		return info
	}
	if _, err := os.Stat(fullPath); err != nil {
		return info
	}
	info.Available = true

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, fullPath, "--version").CombinedOutput()
	if err == nil {
		raw := strings.TrimSpace(string(out))
		if lineEnd := strings.IndexByte(raw, '\n'); lineEnd != -1 {
			raw = strings.TrimSpace(raw[:lineEnd])
		}
		info.VersionRaw = raw
		info.MajorVersion = ParsePgMajorVersion(raw)
	}
	return info
}

// DetectToolchain locates PostgreSQL client utilities and compares versions against the connected server.
func DetectToolchain(customBinDir string, serverVersionNum int, serverVersionRaw string) ToolchainInfo {
	serverMajor := 0
	if serverVersionNum > 0 {
		serverMajor = serverVersionNum / 10000
	} else if serverVersionRaw != "" {
		if m := pgVersionRegex.FindStringSubmatch(serverVersionRaw); len(m) >= 2 {
			if v, err := strconv.Atoi(m[1]); err == nil {
				serverMajor = v
			}
		}
	}

	cpus := runtime.NumCPU()
	recJobs := cpus / 2
	if recJobs < 2 {
		recJobs = 2
	}
	if recJobs > 8 {
		recJobs = 8
	}

	result := ToolchainInfo{
		CustomBinDir:       strings.TrimSpace(customBinDir),
		Source:             "missing",
		ServerMajorVersion: serverMajor,
		ServerVersionRaw:   serverVersionRaw,
		HostOS:             runtime.GOOS,
		CPUCount:           cpus,
		RecommendedJobs:    recJobs,
		Tools:              make(map[string]ToolBinaryInfo, len(toolNames)),
	}

	candidates := candidateBinDirs(customBinDir)
	chosenDir := ""
	chosenSource := "missing"

	for _, c := range candidates {
		pgDumpPath := filepath.Join(c.dir, exeName("pg_dump"))
		if _, err := os.Stat(pgDumpPath); err == nil {
			chosenDir = c.dir
			chosenSource = c.source
			break
		}
	}

	// Even if chosenDir wasn't found via pg_dump, keep custom dir reference if provided
	if chosenDir == "" && len(candidates) > 0 {
		chosenDir = candidates[0].dir
		chosenSource = candidates[0].source
	}

	result.BinDir = chosenDir
	result.Source = chosenSource

	for _, name := range toolNames {
		var fullPath string
		if chosenDir != "" {
			candidate := filepath.Join(chosenDir, exeName(name))
			if _, err := os.Stat(candidate); err == nil {
				fullPath = candidate
			}
		}
		if fullPath == "" {
			if lookedUp, err := exec.LookPath(exeName(name)); err == nil {
				fullPath = lookedUp
			}
		}
		result.Tools[name] = probeToolBinary(fullPath, name)
	}

	pgDump := result.Tools["pg_dump"]
	if pgDump.Available {
		result.ClientMajorVersion = pgDump.MajorVersion
		result.ClientVersionRaw = pgDump.VersionRaw
	} else if psql, ok := result.Tools["psql"]; ok && psql.Available {
		result.ClientMajorVersion = psql.MajorVersion
		result.ClientVersionRaw = psql.VersionRaw
	}

	result.Capabilities = CapabilitiesForVersion(result.ClientMajorVersion)

	if !pgDump.Available {
		result.Compatible = false
		if result.CustomBinDir != "" {
			result.CompatibilityWarning = fmt.Sprintf("pg_dump was not found in configured bin folder (%s) or system PATH. Select a valid PostgreSQL bin directory.", result.CustomBinDir)
		} else {
			result.CompatibilityWarning = "PostgreSQL client tools (pg_dump, pg_restore, psql) were not found in PATH or standard installation paths. Click 'Configure bin/' to point to PostgreSQL bin."
		}
		return result
	}

	if serverMajor > 0 && result.ClientMajorVersion > 0 && result.ClientMajorVersion < serverMajor {
		result.Compatible = false
		result.CompatibilityWarning = fmt.Sprintf("Client pg_dump v%d is older than server PostgreSQL v%d. PostgreSQL requires client tools >= server major version for pg_dump/pg_basebackup.", result.ClientMajorVersion, serverMajor)
		return result
	}

	result.Compatible = true
	return result
}
