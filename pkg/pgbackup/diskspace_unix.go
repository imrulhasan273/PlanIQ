//go:build !windows

package pgbackup

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

func nearestExistingPath(targetPath string) string {
	p := strings.TrimSpace(targetPath)
	if p == "" {
		return ""
	}
	abs, err := filepath.Abs(p)
	if err == nil {
		p = abs
	}
	for {
		if _, err := os.Stat(p); err == nil {
			return p
		}
		parent := filepath.Dir(p)
		if parent == p || parent == "" {
			return p
		}
		p = parent
	}
}

// GetFreeDiskSpace reports available and total filesystem space on Linux (Ubuntu/AlmaLinux/RHEL) and macOS.
func GetFreeDiskSpace(targetPath string, estimatedBytes int64) (DiskSpaceInfo, error) {
	probe := nearestExistingPath(targetPath)
	if probe == "" {
		return DiskSpaceInfo{}, fmt.Errorf("empty target path")
	}
	var st syscall.Statfs_t
	if err := syscall.Statfs(probe, &st); err != nil {
		return DiskSpaceInfo{}, fmt.Errorf("statfs failed for %s: %w", probe, err)
	}
	free := int64(st.Bavail) * int64(st.Bsize)
	total := int64(st.Blocks) * int64(st.Bsize)

	info := DiskSpaceInfo{
		Path:           probe,
		FreeBytes:      free,
		TotalBytes:     total,
		EstimatedBytes: estimatedBytes,
		Sufficient:     true,
	}
	if estimatedBytes > 0 && free < estimatedBytes {
		info.Sufficient = false
		info.Warning = fmt.Sprintf(
			"Low disk space on %s: %s free, estimated uncompressed size is %s.",
			probe, formatHumanBytes(free), formatHumanBytes(estimatedBytes),
		)
	}
	return info, nil
}
