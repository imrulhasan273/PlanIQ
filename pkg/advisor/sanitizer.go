package advisor

import (
	"regexp"
)

var (
	// Regex for string literals: 'anything'
	stringLiteralRegex = regexp.MustCompile(`'([^']|'')*'`)
	// Regex for numeric literals in equality / comparisons
	numericLiteralRegex = regexp.MustCompile(`(?i)(=\s*|<>\s*|>\s*|<\s*|BETWEEN\s+)\b\d{4,}\b`)
	// Regex for phone numbers or GUIDs
	guidRegex = regexp.MustCompile(`(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
)

// SanitizeSQL scrubs literal values from SQL query text to protect customer privacy
func SanitizeSQL(query string) string {
	// Mask GUIDs
	result := guidRegex.ReplaceAllString(query, "'[MASKED_GUID]'")

	// Mask string literals
	result = stringLiteralRegex.ReplaceAllString(result, "'[MASKED_STRING]'")

	// Mask large numeric literals
	result = numericLiteralRegex.ReplaceAllStringFunc(result, func(match string) string {
		prefix := numericLiteralRegex.FindStringSubmatch(match)
		if len(prefix) > 1 {
			return prefix[1] + "0000"
		}
		return match
	})

	return result
}
