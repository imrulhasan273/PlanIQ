package pgbackup

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/imrulhasan273/PlanIQ/pkg/configdb"
)

// Runner executes backup/restore plans sequentially in the background with live log streaming, progress, and cancellation.
type Runner struct {
	mu          sync.Mutex
	activeJobID string
	cancelFunc  context.CancelFunc
}

var (
	defaultRunner *Runner
	runnerOnce    sync.Once
	pctRegex      = regexp.MustCompile(`\((\d+(?:\.\d+)?)%\)`)
)

// GetRunner returns the singleton background execution manager.
func GetRunner() *Runner {
	runnerOnce.Do(func() {
		defaultRunner = &Runner{}
	})
	return defaultRunner
}

// CancelActive cancels the currently running backup or restore job, if any.
func (r *Runner) CancelActive() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cancelFunc == nil {
		return fmt.Errorf("no active backup or restore job is running")
	}
	r.cancelFunc()
	return nil
}

// Start preserves backwards compatibility with callers not tracking live progress or checksums.
func (r *Runner) Start(
	parentCtx context.Context,
	jobMeta configdb.PgBackupJobRecord,
	cmds []PlannedCommand,
	env []string,
	manifest *MultiDbManifest,
	manifestDir string,
	tempFilesToCleanup []string,
	onLog func(BackupLogEvent),
	onStatus func(BackupStatusEvent),
) (string, error) {
	return r.StartWithProgress(parentCtx, jobMeta, cmds, env, manifest, manifestDir, tempFilesToCleanup, 0, false, onLog, onStatus, nil)
}

// StartWithProgress executes a multi-step command plan asynchronously, emitting live logs, MB/s progress, and optional SHA-256 sidecar.
func (r *Runner) StartWithProgress(
	parentCtx context.Context,
	jobMeta configdb.PgBackupJobRecord,
	cmds []PlannedCommand,
	env []string,
	manifest *MultiDbManifest,
	manifestDir string,
	tempFilesToCleanup []string,
	estimatedBytes int64,
	generateChecksum bool,
	onLog func(BackupLogEvent),
	onStatus func(BackupStatusEvent),
	onProgress func(BackupProgressEvent),
) (string, error) {
	if len(cmds) == 0 {
		return "", fmt.Errorf("no commands to execute")
	}

	r.mu.Lock()
	if r.activeJobID != "" {
		r.mu.Unlock()
		return "", fmt.Errorf("another job (%s) is already running", r.activeJobID)
	}

	jobID := fmt.Sprintf("pgjob_%d", time.Now().UnixNano())
	jobCtx, cancel := context.WithCancel(parentCtx)
	r.activeJobID = jobID
	r.cancelFunc = cancel
	r.mu.Unlock()

	jobMeta.ID = jobID
	jobMeta.StartedAt = time.Now().UTC().Format(time.RFC3339)
	jobMeta.Status = "running"
	if store, err := configdb.GetDB(); err == nil {
		_ = store.SaveBackupJob(jobMeta)
	}

	if onStatus != nil {
		onStatus(BackupStatusEvent{
			JobID:      jobID,
			Operation:  jobMeta.Operation,
			Mode:       jobMeta.Mode,
			Status:     "running",
			OutputPath: jobMeta.OutputPath,
		})
	}

	go func() {
		defer func() {
			for _, f := range tempFilesToCleanup {
				if f != "" {
					_ = os.Remove(f)
				}
			}
			r.mu.Lock()
			r.activeJobID = ""
			r.cancelFunc = nil
			r.mu.Unlock()
			cancel()
		}()

		startTime := time.Now()
		var pctMu sync.Mutex
		parsedPct := -1.0

		emitLog := func(stream, line string) {
			if m := pctRegex.FindStringSubmatch(line); len(m) >= 2 {
				if v, pErr := strconv.ParseFloat(m[1], 64); pErr == nil {
					pctMu.Lock()
					parsedPct = v
					pctMu.Unlock()
				}
			}
			if onLog != nil {
				onLog(BackupLogEvent{
					JobID:     jobID,
					Stream:    stream,
					Line:      line,
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				})
			}
		}

		progressDone := make(chan struct{})
		if onProgress != nil {
			go func() {
				ticker := time.NewTicker(750 * time.Millisecond)
				defer ticker.Stop()
				for {
					select {
					case <-progressDone:
						return
					case <-ticker.C:
						elapsed := time.Since(startTime)
						written := int64(0)
						if jobMeta.Operation == "backup" && jobMeta.OutputPath != "" {
							written = computePathSize(jobMeta.OutputPath)
						}
						pctMu.Lock()
						pct := parsedPct
						pctMu.Unlock()
						if pct < 0 && estimatedBytes > 0 && written > 0 {
							pct = (float64(written) / float64(estimatedBytes)) * 100.0
							if pct > 98.0 {
								pct = 98.0
							}
						}
						mbPerSec := 0.0
						if sec := elapsed.Seconds(); sec > 0.2 && written > 0 {
							mbPerSec = (float64(written) / (1024 * 1024)) / sec
						}
						onProgress(BackupProgressEvent{
							JobID:          jobID,
							BytesWritten:   written,
							EstimatedBytes: estimatedBytes,
							Percent:        pct,
							MBPerSec:       mbPerSec,
							ElapsedMs:      elapsed.Milliseconds(),
						})
					}
				}
			}()
		}

		// Ensure parent directory exists for output path if specified
		if jobMeta.OutputPath != "" && jobMeta.Operation == "backup" {
			if manifest != nil && manifestDir != "" {
				_ = os.MkdirAll(manifestDir, 0o755)
			} else {
				_ = os.MkdirAll(filepath.Dir(jobMeta.OutputPath), 0o755)
			}
		}

		var finalErr error
		exitCode := 0

		for idx, pc := range cmds {
			if jobCtx.Err() != nil {
				finalErr = jobCtx.Err()
				break
			}
			emitLog("info", fmt.Sprintf("[%d/%d] Starting %s", idx+1, len(cmds), pc.StepLabel))
			emitLog("info", "$ "+FormatCommandForDisplay(pc.Binary, pc.Args))

			cmd := exec.CommandContext(jobCtx, pc.Binary, pc.Args...)
			cmd.Env = env

			stdout, err := cmd.StdoutPipe()
			if err != nil {
				finalErr = err
				break
			}
			stderr, err := cmd.StderrPipe()
			if err != nil {
				finalErr = err
				break
			}

			if err := cmd.Start(); err != nil {
				finalErr = err
				break
			}

			var wg sync.WaitGroup
			scanPipe := func(stream string, pipe io.ReadCloser) {
				defer wg.Done()
				sc := bufio.NewScanner(pipe)
				buf := make([]byte, 0, 64*1024)
				sc.Buffer(buf, 1024*1024)
				for sc.Scan() {
					emitLog(stream, sc.Text())
				}
			}
			wg.Add(2)
			go scanPipe("stdout", stdout)
			go scanPipe("stderr", stderr)
			wg.Wait()

			if waitErr := cmd.Wait(); waitErr != nil {
				if exitErr, ok := waitErr.(*exec.ExitError); ok {
					exitCode = exitErr.ExitCode()
				} else {
					exitCode = 1
				}
				finalErr = waitErr
				break
			}
			emitLog("info", fmt.Sprintf("[%d/%d] Completed %s", idx+1, len(cmds), pc.StepLabel))
		}

		close(progressDone)

		// Write multi-DB manifest on full success
		if finalErr == nil && manifest != nil && manifestDir != "" {
			manifestPath := filepath.Join(manifestDir, "planiq-backup-manifest.json")
			if data, mErr := json.MarshalIndent(manifest, "", "  "); mErr == nil {
				if wErr := os.WriteFile(manifestPath, data, 0o644); wErr != nil {
					emitLog("stderr", "Warning: failed to write manifest file: "+wErr.Error())
				} else {
					emitLog("info", "Wrote multi-database manifest: "+manifestPath)
				}
			}
		}

		durationMs := time.Since(startTime).Milliseconds()
		status := "succeeded"
		errMsg := ""
		if jobCtx.Err() == context.Canceled {
			status = "cancelled"
			errMsg = "Job cancelled by user"
			if exitCode == 0 {
				exitCode = 130
			}
		} else if finalErr != nil {
			status = "failed"
			errMsg = finalErr.Error()
		}

		var totalSize int64
		if status == "succeeded" && jobMeta.OutputPath != "" {
			totalSize = computePathSize(jobMeta.OutputPath)
			if generateChecksum && jobMeta.Operation == "backup" {
				if scPath, sum, cErr := WriteSha256Sidecar(jobMeta.OutputPath); cErr == nil {
					emitLog("info", fmt.Sprintf("SHA-256 sidecar saved: %s (%s)", scPath, sum))
				} else {
					emitLog("stderr", "Warning: failed to generate SHA-256 sidecar: "+cErr.Error())
				}
			}
		}

		if onProgress != nil {
			finalPct := 100.0
			if status != "succeeded" {
				finalPct = 0
			}
			mbPerSec := 0.0
			if durationMs > 100 && totalSize > 0 {
				mbPerSec = (float64(totalSize) / (1024 * 1024)) / (float64(durationMs) / 1000.0)
			}
			onProgress(BackupProgressEvent{
				JobID:          jobID,
				BytesWritten:   totalSize,
				EstimatedBytes: estimatedBytes,
				Percent:        finalPct,
				MBPerSec:       mbPerSec,
				ElapsedMs:      durationMs,
			})
		}

		jobMeta.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		jobMeta.DurationMs = durationMs
		jobMeta.Status = status
		jobMeta.ExitCode = exitCode
		jobMeta.SizeBytes = totalSize
		jobMeta.ErrorMessage = errMsg
		if store, err := configdb.GetDB(); err == nil {
			_ = store.SaveBackupJob(jobMeta)
		}

		if status == "succeeded" {
			emitLog("info", fmt.Sprintf("Job %s succeeded in %d ms.", jobID, durationMs))
		} else {
			emitLog("stderr", fmt.Sprintf("Job %s %s: %s", jobID, status, errMsg))
		}

		if onStatus != nil {
			onStatus(BackupStatusEvent{
				JobID:        jobID,
				Operation:    jobMeta.Operation,
				Mode:         jobMeta.Mode,
				Status:       status,
				ExitCode:     exitCode,
				DurationMs:   durationMs,
				OutputPath:   jobMeta.OutputPath,
				SizeBytes:    totalSize,
				ErrorMessage: errMsg,
			})
		}
	}()

	return jobID, nil
}

// StartPipeClone streams pg_dump stdout directly into pg_restore stdin (zero intermediate disk file).
func (r *Runner) StartPipeClone(
	parentCtx context.Context,
	jobMeta configdb.PgBackupJobRecord,
	dumpCmd PlannedCommand,
	srcEnv []string,
	restoreCmd PlannedCommand,
	dstEnv []string,
	analyzeCmd *PlannedCommand,
	onLog func(BackupLogEvent),
	onStatus func(BackupStatusEvent),
) (string, error) {
	r.mu.Lock()
	if r.activeJobID != "" {
		r.mu.Unlock()
		return "", fmt.Errorf("another job (%s) is already running", r.activeJobID)
	}

	jobID := fmt.Sprintf("pgjob_%d", time.Now().UnixNano())
	jobCtx, cancel := context.WithCancel(parentCtx)
	r.activeJobID = jobID
	r.cancelFunc = cancel
	r.mu.Unlock()

	jobMeta.ID = jobID
	jobMeta.StartedAt = time.Now().UTC().Format(time.RFC3339)
	jobMeta.Status = "running"
	if store, err := configdb.GetDB(); err == nil {
		_ = store.SaveBackupJob(jobMeta)
	}
	if onStatus != nil {
		onStatus(BackupStatusEvent{
			JobID:      jobID,
			Operation:  jobMeta.Operation,
			Mode:       jobMeta.Mode,
			Status:     "running",
			OutputPath: jobMeta.OutputPath,
		})
	}

	go func() {
		defer func() {
			r.mu.Lock()
			r.activeJobID = ""
			r.cancelFunc = nil
			r.mu.Unlock()
			cancel()
		}()

		startTime := time.Now()
		emitLog := func(stream, line string) {
			if onLog != nil {
				onLog(BackupLogEvent{
					JobID:     jobID,
					Stream:    stream,
					Line:      line,
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				})
			}
		}

		emitLog("info", "Starting Zero-Disk Direct Clone stream...")
		emitLog("info", "$ "+FormatCommandForDisplay(dumpCmd.Binary, dumpCmd.Args)+" | "+FormatCommandForDisplay(restoreCmd.Binary, restoreCmd.Args))

		c1 := exec.CommandContext(jobCtx, dumpCmd.Binary, dumpCmd.Args...)
		c1.Env = srcEnv
		c2 := exec.CommandContext(jobCtx, restoreCmd.Binary, restoreCmd.Args...)
		c2.Env = dstEnv

		var finalErr error
		exitCode := 0

		pipeReader, err := c1.StdoutPipe()
		if err != nil {
			finalErr = err
		} else {
			c2.Stdin = pipeReader
			dErrPipe, err2 := c1.StderrPipe()
			rOutPipe, err3 := c2.StdoutPipe()
			rErrPipe, err4 := c2.StderrPipe()
			if err2 != nil || err3 != nil || err4 != nil {
				finalErr = fmt.Errorf("failed to attach stream pipes")
			} else if err := c2.Start(); err != nil {
				finalErr = err
			} else if err := c1.Start(); err != nil {
				_ = c2.Process.Kill()
				finalErr = err
			} else {
				var wg sync.WaitGroup
				scan := func(stream, prefix string, p io.ReadCloser) {
					defer wg.Done()
					sc := bufio.NewScanner(p)
					for sc.Scan() {
						emitLog(stream, prefix+sc.Text())
					}
				}
				wg.Add(3)
				go scan("stderr", "[dump] ", dErrPipe)
				go scan("stdout", "[restore] ", rOutPipe)
				go scan("stderr", "[restore] ", rErrPipe)
				wg.Wait()

				wErr1 := c1.Wait()
				wErr2 := c2.Wait()
				if wErr1 != nil {
					finalErr = fmt.Errorf("source pg_dump failed: %w", wErr1)
					exitCode = 1
				} else if wErr2 != nil {
					finalErr = fmt.Errorf("target pg_restore failed: %w", wErr2)
					exitCode = 1
				}
			}
		}

		if finalErr == nil && analyzeCmd != nil {
			emitLog("info", "Running post-clone ANALYZE VERBOSE...")
			ac := exec.CommandContext(jobCtx, analyzeCmd.Binary, analyzeCmd.Args...)
			ac.Env = dstEnv
			if out, aErr := ac.CombinedOutput(); aErr != nil {
				emitLog("stderr", "ANALYZE warning: "+aErr.Error()+" ("+string(out)+")")
			} else {
				emitLog("info", strings.TrimSpace(string(out)))
			}
		}

		durationMs := time.Since(startTime).Milliseconds()
		status := "succeeded"
		errMsg := ""
		if jobCtx.Err() == context.Canceled {
			status = "cancelled"
			errMsg = "Clone cancelled by user"
			exitCode = 130
		} else if finalErr != nil {
			status = "failed"
			errMsg = finalErr.Error()
		}

		jobMeta.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		jobMeta.DurationMs = durationMs
		jobMeta.Status = status
		jobMeta.ExitCode = exitCode
		jobMeta.ErrorMessage = errMsg
		if store, err := configdb.GetDB(); err == nil {
			_ = store.SaveBackupJob(jobMeta)
		}

		if status == "succeeded" {
			emitLog("info", fmt.Sprintf("Direct Clone %s succeeded in %d ms.", jobID, durationMs))
		} else {
			emitLog("stderr", fmt.Sprintf("Direct Clone %s %s: %s", jobID, status, errMsg))
		}

		if onStatus != nil {
			onStatus(BackupStatusEvent{
				JobID:        jobID,
				Operation:    jobMeta.Operation,
				Mode:         jobMeta.Mode,
				Status:       status,
				ExitCode:     exitCode,
				DurationMs:   durationMs,
				OutputPath:   jobMeta.OutputPath,
				ErrorMessage: errMsg,
			})
		}
	}()

	return jobID, nil
}

func computePathSize(path string) int64 {
	st, err := os.Stat(path)
	if err != nil {
		return 0
	}
	if !st.IsDir() {
		return st.Size()
	}
	var sum int64
	_ = filepath.WalkDir(path, func(_ string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if fi, fErr := d.Info(); fErr == nil {
			sum += fi.Size()
		}
		return nil
	})
	return sum
}
