package advisor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"sqlplan-advisor/pkg/sqlplan"
)

// AIRequest represents the input parameters for the AI Advisor
type AIRequest struct {
	Provider         string                   `json:"provider"` // "gemini", "openai", "ollama", "offline"
	APIKey           string                   `json:"apiKey"`
	Model            string                   `json:"model"`
	EndpointURL      string                   `json:"endpointUrl"` // for Ollama or custom gateway
	SanitizeBeforeAI bool                     `json:"sanitizeBeforeAI"`
	Statement        *sqlplan.StatementAnalysis `json:"statement"`
	FullPlan         *sqlplan.PlanAnalysis    `json:"fullPlan"`
}

// AIResponse represents the structured advice returned by the AI
type AIResponse struct {
	Summary              string   `json:"summary"`
	RootCause            string   `json:"rootCause"`
	RecommendedRewrite   string   `json:"recommendedRewrite"`
	RewriteExplanation   string   `json:"rewriteExplanation"`
	IndexRecommendations []string `json:"indexRecommendations"`
	ServerConfigTips     []string `json:"serverConfigTips"`
	ProviderUsed         string   `json:"providerUsed"`
}

// GenerateAdvice analyzes the plan bottlenecks and gets recommendations from the chosen LLM or heuristic advisor
func GenerateAdvice(ctx context.Context, req *AIRequest) (*AIResponse, error) {
	if req.Provider == "offline" || req.APIKey == "" && req.Provider != "ollama" {
		return generateOfflineAdvice(req)
	}

	prompt := buildPrompt(req)

	switch strings.ToLower(req.Provider) {
	case "gemini":
		return callGemini(ctx, req.APIKey, req.Model, prompt)
	case "openai":
		return callOpenAI(ctx, req.APIKey, req.Model, prompt)
	case "ollama":
		return callOllama(ctx, req.EndpointURL, req.Model, prompt)
	default:
		return generateOfflineAdvice(req)
	}
}

func buildPrompt(req *AIRequest) string {
	stmt := req.Statement
	var sb strings.Builder

	sb.WriteString("You are a Principal Microsoft SQL Server Database Architect and Query Tuning Expert.\n")
	sb.WriteString("Analyze this high-cost statement extracted from a production SQL Server execution plan and provide actionable optimizations.\n\n")

	sb.WriteString(fmt.Sprintf("STATEMENT ID: %s\n", stmt.StatementID))
	sb.WriteString(fmt.Sprintf("STATEMENT TYPE: %s\n", stmt.StatementType))
	sb.WriteString(fmt.Sprintf("SUBTREE COST: %0.2f (%0.1f%% of entire procedure)\n", stmt.StatementSubTreeCost, stmt.CostPercentage))
	sb.WriteString(fmt.Sprintf("ESTIMATED ROWS: %0.0f\n", stmt.StatementEstRows))
	if req.FullPlan.MaxDOPReason != "" {
		sb.WriteString(fmt.Sprintf("SERVER MAXDOP STATUS: %s\n", req.FullPlan.MaxDOPReason))
	}
	queryText := stmt.StatementText
	if req.SanitizeBeforeAI {
		queryText = SanitizeSQL(queryText)
	}
	sb.WriteString("\nQUERY TEXT:\n```sql\n")
	sb.WriteString(queryText)
	sb.WriteString("\n```\n\n")

	if len(stmt.Warnings) > 0 {
		sb.WriteString("ENGINE WARNINGS DETECTED:\n")
		for _, w := range stmt.Warnings {
			sb.WriteString(fmt.Sprintf("- [%s] %s: %s\n", w.Kind, w.Issue, w.Expression))
		}
		sb.WriteString("\n")
	}

	if len(stmt.MissingIndexes) > 0 {
		sb.WriteString("SQL SERVER ENGINE MISSING INDEXES:\n")
		for _, mi := range stmt.MissingIndexes {
			sb.WriteString(fmt.Sprintf("- Table: %s.%s | Impact: %0.1f%%\n", mi.Schema, mi.Table, mi.Impact))
			sb.WriteString(fmt.Sprintf("  Equality: %v | Inequality: %v | Include: %v\n", mi.EqualityColumns, mi.InequalityColumns, mi.IncludeColumns))
			sb.WriteString(fmt.Sprintf("  SQL: %s\n", mi.SuggestedDDL))
		}
		sb.WriteString("\n")
	}

	sb.WriteString("Please respond with a JSON object containing these EXACT fields:\n")
	sb.WriteString("{\n")
	sb.WriteString(`  "summary": "Short 2-sentence summary of the main bottleneck",` + "\n")
	sb.WriteString(`  "rootCause": "Deep technical explanation of why this query is slow in SQL Server",` + "\n")
	sb.WriteString(`  "recommendedRewrite": "Full rewritten SQL code for this statement",` + "\n")
	sb.WriteString(`  "rewriteExplanation": "Explain specifically what changes were made in the rewrite and why",` + "\n")
	sb.WriteString(`  "indexRecommendations": ["CREATE NONCLUSTERED INDEX ...", ...],` + "\n")
	sb.WriteString(`  "serverConfigTips": ["Tip 1", "Tip 2"]` + "\n")
	sb.WriteString("}\n")
	sb.WriteString("Do NOT wrap the JSON in Markdown backticks or write conversational filler. Output raw JSON only.")

	return sb.String()
}

func generateOfflineAdvice(req *AIRequest) (*AIResponse, error) {
	stmt := req.Statement
	resp := &AIResponse{
		ProviderUsed:         "Deterministic DBA Rule Engine (Offline)",
		IndexRecommendations: make([]string, 0),
		ServerConfigTips:     make([]string, 0),
	}

	var rootCauses []string
	var explanations []string

	// Check CONVERT_IMPLICIT
	hasConvert := false
	for _, w := range stmt.Warnings {
		if w.Kind == "PlanAffectingConvert" {
			hasConvert = true
			rootCauses = append(rootCauses, fmt.Sprintf("Implicit type conversion (%s): SQL Server must evaluate expression '%s' per row, invalidating index seeks.", w.Issue, w.Expression))
			explanations = append(explanations, "Ensure parameter types match the table column data type exactly to allow sargable index seeks.")
		}
	}

	// Check SELECT INTO #temp
	if strings.Contains(strings.ToUpper(stmt.StatementText), "INTO #") {
		rootCauses = append(rootCauses, "SELECT ... INTO creates a temporary table as an unindexed Heap. Subsequent joins and aggregations on this temp table cause table scans and missing index alerts.")
		explanations = append(explanations, "Pre-create the temp table using CREATE TABLE #TempTable (...) with a clustered primary key on the join column before inserting.")
	}

	// Missing indexes
	for _, mi := range stmt.MissingIndexes {
		if mi.SuggestedDDL != "" {
			resp.IndexRecommendations = append(resp.IndexRecommendations, mi.SuggestedDDL)
		}
	}

	if len(rootCauses) == 0 {
		rootCauses = append(rootCauses, fmt.Sprintf("High subtree cost operator (%0.2f) with potential unindexed joins or table scans.", stmt.StatementSubTreeCost))
	}

	resp.Summary = fmt.Sprintf("Statement #%s accounts for %0.1f%% of overall cost with %d missing index recommendations.", stmt.StatementID, stmt.CostPercentage, len(stmt.MissingIndexes))
	resp.RootCause = strings.Join(rootCauses, "\n\n")
	resp.RewriteExplanation = strings.Join(explanations, "\n\n")

	// Server config tips
	if req.FullPlan.MaxDOPReason == "MaxDOPSetToOne" {
		resp.ServerConfigTips = append(resp.ServerConfigTips, "Server MAXDOP is locked to 1. For CPU-bound queries, tune Cost Threshold for Parallelism (e.g. 50) and allow MAXDOP matching your NUMA node core count.")
	}
	if hasConvert {
		resp.ServerConfigTips = append(resp.ServerConfigTips, "Audit application ORM / ADO.NET parameter declarations: default string mapping (NVARCHAR) to VARCHAR columns triggers CONVERT_IMPLICIT.")
	}

	// Provide sample rewrite template
	sqlText := strings.TrimSpace(stmt.StatementText)
	if strings.Contains(strings.ToUpper(sqlText), "INTO #") {
		resp.RecommendedRewrite = `-- [OPTIMIZATION 1: Pre-create Temp Table with Clustered Primary Key]
-- Eliminates TempDB page allocation contention and unindexed Heap RID Lookups
IF OBJECT_ID('tempdb..#MemberInfo') IS NOT NULL 
    DROP TABLE #MemberInfo;

CREATE TABLE #MemberInfo (
    MemberId        INT NOT NULL,
    GroupId         INT NULL,
    BranchId        INT NOT NULL,
    AdmissionDate   BIGINT NULL,
    ClosingDate     BIGINT NULL,
    PRIMARY KEY CLUSTERED (MemberId, BranchId)
);

-- [OPTIMIZATION 2: Bulk Insert with Sargable Filter Predicates]
INSERT INTO #MemberInfo (
    MemberId, 
    GroupId, 
    BranchId, 
    AdmissionDate, 
    ClosingDate
)
SELECT 
    mmh.MemberId, 
    mmh.GroupId, 
    mmh.BranchId, 
    m.AdmissionDate, 
    m.ClosingDate
FROM [program].[MemberMoveHistory] mmh WITH (NOLOCK)
INNER JOIN program.Member m WITH (NOLOCK) ON m.Id = mmh.MemberId
WHERE mmh.StartDate <= @endDate 
  AND (mmh.EndDate >= @endDate OR mmh.EndDate IS NULL)
  AND mmh.BranchId = @BranchId
-- [OPTIMIZATION 3: Query Hints]
OPTION (RECOMPILE);`
	} else if strings.Contains(strings.ToUpper(sqlText), "FUNC_") {
		resp.RecommendedRewrite = `-- [OPTIMIZATION: Replace Scalar UDF with Native Inline Conversion]
-- Native date math executes in-line without context-switching overhead:
DECLARE @EndDateDate DATETIME = CAST(CAST(@EndDate AS VARCHAR(8)) AS DATETIME);
DECLARE @PreviousDate BIGINT = CAST(CONVERT(VARCHAR(8), DATEADD(day, -1, @EndDateDate), 112) + '000000' AS BIGINT);

` + sqlText + "\nOPTION (USE HINT('FORCE_DEFAULT_CARDINALITY_ESTIMATION'));"
	} else {
		resp.RecommendedRewrite = "-- [OPTIMIZED REWRITE FOR STMT #" + stmt.StatementID + "]\n" + sqlText + "\nOPTION (RECOMPILE);"
	}

	return resp, nil
}

func callGemini(ctx context.Context, apiKey string, model string, prompt string) (*AIResponse, error) {
	if model == "" {
		model = "gemini-2.5-flash"
	}
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, apiKey)

	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{"text": prompt},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"responseMimeType": "application/json",
		},
	}

	bodyBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Gemini API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}

	if err := json.Unmarshal(respBody, &geminiResp); err != nil {
		return nil, err
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("no response candidates received from Gemini")
	}

	rawJSON := geminiResp.Candidates[0].Content.Parts[0].Text
	var aiResp AIResponse
	if err := json.Unmarshal([]byte(rawJSON), &aiResp); err != nil {
		aiResp.Summary = rawJSON
	}
	aiResp.ProviderUsed = "Google Gemini (" + model + ")"
	return &aiResp, nil
}

func callOpenAI(ctx context.Context, apiKey string, model string, prompt string) (*AIResponse, error) {
	if model == "" {
		model = "gpt-4o-mini"
	}
	url := "https://api.openai.com/v1/chat/completions"

	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": "You are a Principal SQL Server Query Tuning Architect. Respond with valid JSON."},
			{"role": "user", "content": prompt},
		},
		"response_format": map[string]string{"type": "json_object"},
	}

	bodyBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenAI API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var openAIResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(respBody, &openAIResp); err != nil {
		return nil, err
	}

	if len(openAIResp.Choices) == 0 {
		return nil, fmt.Errorf("no completion choices received from OpenAI")
	}

	var aiResp AIResponse
	if err := json.Unmarshal([]byte(openAIResp.Choices[0].Message.Content), &aiResp); err != nil {
		aiResp.Summary = openAIResp.Choices[0].Message.Content
	}
	aiResp.ProviderUsed = "OpenAI (" + model + ")"
	return &aiResp, nil
}

func callOllama(ctx context.Context, endpoint string, model string, prompt string) (*AIResponse, error) {
	if endpoint == "" {
		endpoint = "http://localhost:11434"
	}
	if model == "" {
		model = "llama3"
	}
	url := strings.TrimRight(endpoint, "/") + "/api/generate"

	payload := map[string]interface{}{
		"model":  model,
		"prompt": prompt,
		"stream": false,
		"format": "json",
	}

	bodyBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Ollama connection failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Ollama error (%d): %s", resp.StatusCode, string(respBody))
	}

	var ollamaResp struct {
		Response string `json:"response"`
	}
	if err := json.Unmarshal(respBody, &ollamaResp); err != nil {
		return nil, err
	}

	var aiResp AIResponse
	if err := json.Unmarshal([]byte(ollamaResp.Response), &aiResp); err != nil {
		aiResp.Summary = ollamaResp.Response
	}
	aiResp.ProviderUsed = "Local Ollama (" + model + ")"
	return &aiResp, nil
}
