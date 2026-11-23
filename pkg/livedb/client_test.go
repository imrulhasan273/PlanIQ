package livedb

import (
	"context"
	"strings"
	"testing"
)

func TestGetClientDefaultsToReadOnlyDisconnected(t *testing.T) {
	c := GetClient()
	st := c.GetStatus()
	if st.Connected {
		t.Errorf("expected initial client status to be disconnected")
	}
	if !st.IsReadOnly {
		t.Errorf("expected initial client status to default to read-only")
	}
}

func TestResolveEngine(t *testing.T) {
	if got := resolveEngine(ConnectionConfig{Engine: "postgresql", Port: 15432}); got != "postgresql" {
		t.Errorf("expected postgresql, got %q", got)
	}
	if got := resolveEngine(ConnectionConfig{Engine: "sqlserver", Port: 1433}); got != "sqlserver" {
		t.Errorf("expected sqlserver, got %q", got)
	}
	if got := resolveEngine(ConnectionConfig{Port: 5432, Database: "appdb"}); got != "postgresql" {
		t.Errorf("expected port 5432 to infer postgresql, got %q", got)
	}
	if got := resolveEngine(ConnectionConfig{Port: 1433, Database: "master"}); got != "sqlserver" {
		t.Errorf("expected port 1433 to infer sqlserver, got %q", got)
	}
}

func TestBuildPostgresConnStr(t *testing.T) {
	dsn := buildPostgresConnStr(ConnectionConfig{
		Engine:                 "postgresql",
		Server:                 "localhost",
		Port:                   5432,
		Database:               "Pls",
		AuthType:               "sql",
		Username:               "imrul",
		Password:               "p@ss:word",
		Encrypt:                false,
		TrustServerCertificate: true,
		TimeoutSeconds:         4,
	}, "PlanIQ-Test-Connection")

	if !strings.HasPrefix(dsn, "postgres://imrul:p%40ss%3Aword@localhost:5432/Pls?") {
		t.Errorf("unexpected postgres URI prefix: %s", dsn)
	}
	if !strings.Contains(dsn, "default_transaction_read_only=on") {
		t.Errorf("expected read-only transaction enforcement in DSN: %s", dsn)
	}
	if !strings.Contains(dsn, "sslmode=disable") {
		t.Errorf("expected sslmode=disable when Encrypt=false: %s", dsn)
	}

	tlsDsn := buildPostgresConnStr(ConnectionConfig{
		Engine:                 "postgresql",
		Server:                 "pg.example.com",
		Port:                   5432,
		Database:               "analytics",
		AuthType:               "sql",
		Username:               "reader",
		Password:               "secret",
		Encrypt:                true,
		TrustServerCertificate: true,
	}, "PlanIQ-Live-Radar")
	if !strings.Contains(tlsDsn, "sslmode=require") {
		t.Errorf("expected sslmode=require when Encrypt=true & TrustServerCertificate=true: %s", tlsDsn)
	}
}

func TestConnectRejectsDemoMode(t *testing.T) {
	c := &Client{}
	_, err := c.Connect(context.Background(), ConnectionConfig{
		Server:   "demo",
		AuthType: "demo",
	})
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "demo mode is disabled") {
		t.Fatalf("expected demo mode to be rejected, got err=%v", err)
	}
}

func TestTestConnectionRejectsDemoMode(t *testing.T) {
	c := &Client{}
	_, err := c.TestConnection(context.Background(), ConnectionConfig{
		Server:   "localhost-demo",
		AuthType: "sql",
	})
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "demo mode is disabled") {
		t.Fatalf("expected demo server to be rejected in TestConnection, got err=%v", err)
	}
}

func TestParseDeadlockMetadata(t *testing.T) {
	sample := `<deadlock>
		<victim-list><victimProcess id="proc1" /></victim-list>
		<process-list>
			<process id="proc1" spid="68" />
			<process id="proc2" spid="72" />
		</process-list>
		<resource-list>
			<keylock objectname="AppDB.dbo.Orders" />
			<keylock objectname="AppDB.dbo.Inventory" />
		</resource-list>
	</deadlock>`

	victimSpid, procCount, resCount, dlType, summary := parseDeadlockMetadata(sample)
	if victimSpid != 68 {
		t.Errorf("expected victim SPID 68, got %d", victimSpid)
	}
	if procCount != 2 {
		t.Errorf("expected 2 processes, got %d", procCount)
	}
	if resCount != 2 {
		t.Errorf("expected 2 resources, got %d", resCount)
	}
	if dlType == "" || summary == "" {
		t.Errorf("expected non-empty deadlock type and summary, got type=%q summary=%q", dlType, summary)
	}
}
