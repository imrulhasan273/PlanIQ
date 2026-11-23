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
