//go:build windows

package pgbackup

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var (
	modKernel32          = syscall.NewLazyDLL("kernel32.dll")
	procGetDiskFreeSpace = modKernel32.NewProc("GetDiskFreeSpaceExW")
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

// GetFreeDiskSpace reports available and total disk space for targetPath on Windows.
func GetFreeDiskSpace(targetPath string, estimatedBytes int64) (DiskSpaceInfo, error) {
	probe := nearestExistingPath(targetPath)
	if probe == "" {
		return DiskSpaceInfo{}, fmt.Errorf("empty target path")
	}
	vol := filepath.VolumeName(probe)
	if vol != "" {
		probe = vol + `\`
	}
	utf16Ptr, err := syscall.UTF16PtrFromString(probe)
	if err != nil {
		return DiskSpaceInfo{}, err
	}

	var freeBytesAvailable uint64
	var totalBytes uint64
	var totalFreeBytes uint64

	r1, _, callErr := procGetDiskFreeSpace.Call(
		uintptr(unsafe.Pointer(utf16Ptr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFreeBytes)),
	)
	if r1 == 0 {
		return DiskSpaceInfo{}, fmt.Errorf("GetDiskFreeSpaceExW failed for %s: %w", probe, callErr)
	}

	info := DiskSpaceInfo{
		Path:           probe,
		FreeBytes:      int64(freeBytesAvailable),
		TotalBytes:     int64(totalBytes),
		EstimatedBytes: estimatedBytes,
		Sufficient:     true,
	}
	if estimatedBytes > 0 && int64(freeBytesAvailable) < estimatedBytes {
		info.Sufficient = false
		info.Warning = fmt.Sprintf(
			"Low disk space on %s: %s free, estimated uncompressed size is %s.",
			probe, formatHumanBytes(int64(freeBytesAvailable)), formatHumanBytes(estimatedBytes),
		)
	}
	return info, nil
}
