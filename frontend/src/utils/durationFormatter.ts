/**
 * Utility functions for converting time & duration values into standard, human-readable formats:
 * Days (d), Hours (h), Minutes (m), Seconds (s), and Milliseconds (ms).
 */

export interface DurationOptions {
  includeSeconds?: boolean;
  compact?: boolean;
  showMsForSubSecond?: boolean;
}

/**
 * Converts minutes (can be floating-point or integer) to standard duration string.
 * Examples:
 * - 1670 => "1d 3h 50m"
 * - 1628.4 => "1d 3h 8m 24s"
 * - 238.6 => "3h 58m 36s"
 * - 234.1 => "3h 54m 6s"
 * - 3.2 => "3m 12s"
 * - 1.1 => "1m 6s"
 * - 0.2 => "12s"
 * - 0.005 => "300ms"
 * - 0 => "0s"
 */
export function formatStandardDuration(
  minutes: number,
  options?: DurationOptions
): string {
  if (minutes === 0 || isNaN(minutes) || !isFinite(minutes)) return '0s';

  const totalSeconds = Math.round(minutes * 60 * 10) / 10;
  if (totalSeconds < 1) {
    if (minutes > 0) {
      const ms = Math.round(minutes * 60 * 1000);
      return ms > 0 ? `${ms}ms` : '< 1s';
    }
    return '0s';
  }

  const roundedSeconds = Math.round(totalSeconds);
  const days = Math.floor(roundedSeconds / 86400);
  const hours = Math.floor((roundedSeconds % 86400) / 3600);
  const mins = Math.floor((roundedSeconds % 3600) / 60);
  const secs = roundedSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);

  const showSecs = options?.includeSeconds !== false;
  if (secs > 0 && (showSecs || parts.length === 0)) {
    if (!(days > 0 && options?.compact)) {
      parts.push(`${secs}s`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : '0s';
}

/**
 * Converts milliseconds to standard duration string.
 * Examples:
 * - 30712073 => "8h 31m 52s"
 * - 153778900 => "1d 18h 42m 59s"
 * - 450 => "450ms"
 */
export function formatDurationFromMs(
  ms: number,
  options?: DurationOptions
): string {
  if (ms <= 0 || isNaN(ms) || !isFinite(ms)) return '0s';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return formatStandardDuration(ms / 60000, options);
}

/**
 * Displays both formatted duration and raw minutes for maximum clarity:
 * Examples:
 * - 238.6 => "3h 58m 36s (238.6m)"
 * - 1670 => "1d 3h 50m (1,670m)"
 * - 0.2 => "12s"
 */
export function formatDurationWithMinutes(
  minutes: number,
  options?: DurationOptions
): string {
  const std = formatStandardDuration(minutes, options);
  const rawMin = Math.round(minutes * 10) / 10;
  if (rawMin < 1 && minutes > 0) {
    return std;
  }
  return `${std} (${rawMin.toLocaleString()}m)`;
}

/**
 * Format Y-axis tick values (in minutes) into clean, standard duration ticks:
 * Examples:
 * - 250 => "4h 10m"
 * - 200 => "3h 20m"
 * - 150 => "2h 30m"
 * - 100 => "1h 40m"
 * - 50  => "50m"
 * - 0   => "0"
 */
export function formatYAxisTick(minutes: number): string {
  if (minutes === 0) return '0';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

/**
 * Formats strings like "30,712,073 ms CPU (649,945 Executions)" or "153,778,900 ms CPU"
 * into "8h 31m 52s CPU (649,945 Executions)" while preserving original details.
 */
export function formatAdvisorMetricString(metricStr: string): string {
  if (!metricStr) return '';

  // Case 1: "X ms CPU (Y Executions)"
  const cpuWithExecMatch = metricStr.match(/([\d,]+(?:\.\d+)?)\s*ms\s*CPU\s*(\(.*?\))/i);
  if (cpuWithExecMatch) {
    const ms = parseFloat(cpuWithExecMatch[1].replace(/,/g, ''));
    const execPart = cpuWithExecMatch[2];
    const durStr = formatDurationFromMs(ms);
    return `${durStr} CPU ${execPart}`;
  }

  // Case 2: "X ms CPU"
  const cpuMatch = metricStr.match(/([\d,]+(?:\.\d+)?)\s*ms\s*CPU/i);
  if (cpuMatch) {
    const ms = parseFloat(cpuMatch[1].replace(/,/g, ''));
    const durStr = formatDurationFromMs(ms);
    return `${durStr} CPU`;
  }

  // Case 3: "X min Peak Wait (Y Executions)" or "X min Wait"
  const minMatch = metricStr.match(/([\d,]+(?:\.\d+)?)\s*min\s*(?:Peak\s*)?Wait(?:\s*(\(.*?\)))?/i);
  if (minMatch) {
    const mins = parseFloat(minMatch[1].replace(/,/g, ''));
    const execPart = minMatch[2] ? ` ${minMatch[2]}` : '';
    const durStr = formatStandardDuration(mins);
    const isPeak = /Peak/i.test(metricStr);
    return `${durStr} ${isPeak ? 'Peak Wait' : 'Wait'}${execPart}`;
  }

  // Case 4: "X ms elapsed duration"
  const durMatch = metricStr.match(/([\d,]+(?:\.\d+)?)\s*ms/i);
  if (durMatch) {
    const ms = parseFloat(durMatch[1].replace(/,/g, ''));
    if (ms >= 1000) {
      return metricStr.replace(durMatch[0], formatDurationFromMs(ms));
    }
  }

  return metricStr;
}
