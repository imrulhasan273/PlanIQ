package main

import (
	"context"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"sqlplan-advisor/pkg/advisor"
	"sqlplan-advisor/pkg/sqlplan"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// ParsePlan parses a raw XML string containing a SQL Server ShowPlan
func (a *App) ParsePlan(xmlContent string, planName string) (*sqlplan.PlanAnalysis, error) {
	if planName == "" {
		planName = "Execution Plan"
	}
	return sqlplan.ParseXML(xmlContent, planName)
}

// LoadSamplePlan loads the bundled explan.xml sample execution plan
func (a *App) LoadSamplePlan() (*sqlplan.PlanAnalysis, error) {
	bytes, err := os.ReadFile("sample_plans/explan.xml")
	if err != nil {
		// Fallback check in parent or scratch
		bytes, err = os.ReadFile("explan.xml")
		if err != nil {
			return nil, fmt.Errorf("sample plan not found: %w", err)
		}
	}
	return sqlplan.ParseXML(string(bytes), "explan.xml (InsertDailyOperationalReport)")
}

// OpenFilePicker opens a native file dialog for selecting a .sqlplan or .xml file
func (a *App) OpenFilePicker() (string, string, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select SQL Server Execution Plan (.sqlplan, .xml)",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Execution Plans (*.sqlplan;*.xml)",
				Pattern:     "*.sqlplan;*.xml",
			},
			{
				DisplayName: "All Files (*.*)",
				Pattern:     "*.*",
			},
		},
	})
	if err != nil {
		return "", "", err
	}
	if selection == "" {
		return "", "", nil // user cancelled
	}

	bytes, err := os.ReadFile(selection)
	if err != nil {
		return "", "", fmt.Errorf("failed to read file: %w", err)
	}

	return selection, string(bytes), nil
}

// GetAIAdvice requests optimization recommendations from the AI Advisor
func (a *App) GetAIAdvice(req advisor.AIRequest) (*advisor.AIResponse, error) {
	return advisor.GenerateAdvice(a.ctx, &req)
}

// ComparePlans parses and compares Plan A against Plan B
func (a *App) ComparePlans(xmlA, xmlB, nameA, nameB string) (*sqlplan.PlanComparison, error) {
	if nameA == "" {
		nameA = "Plan A (Baseline)"
	}
	if nameB == "" {
		nameB = "Plan B (Optimized)"
	}
	planA, err := sqlplan.ParseXML(xmlA, nameA)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Plan A: %w", err)
	}
	planB, err := sqlplan.ParseXML(xmlB, nameB)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Plan B: %w", err)
	}
	return sqlplan.ComparePlans(planA, planB), nil
}

