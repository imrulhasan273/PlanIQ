package livedb

import (
	"context"
	"reflect"
	"strings"
	"testing"
)

func TestPgTextArrayScan(t *testing.T) {
	tests := []struct {
		name string
		src  interface{}
		want []string
	}{
		{name: "nil", src: nil, want: []string{}},
		{name: "empty_string", src: "{}", want: []string{}},
		{name: "empty_bytes", src: []byte("{}"), want: []string{}},
		{name: "simple_tokens", src: "{pg_read_all_data,app_readers}", want: []string{"pg_read_all_data", "app_readers"}},
		{name: "bytes_tokens", src: []byte("{alice,bob}"), want: []string{"alice", "bob"}},
		{name: "quoted_with_comma_and_escapes", src: `{"foo,bar","baz\"qux","a\\b"}`, want: []string{"foo,bar", `baz"qux`, `a\b`}},
		{name: "null_element_skipped", src: `{alice,NULL,bob}`, want: []string{"alice", "bob"}},
		{name: "string_slice_passthrough", src: []string{"x", "y"}, want: []string{"x", "y"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var got []string
			if err := pgArray(&got).Scan(tc.src); err != nil {
				t.Fatalf("Scan(%v) unexpected error: %v", tc.src, err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("Scan(%v) = %#v, want %#v", tc.src, got, tc.want)
			}
		})
	}
}

func TestParseKeyValueArray(t *testing.T) {
	got := parseKeyValueArray([]string{"host=10.0.0.5", "port=5432", "malformed", "opt=a=b"})
	want := map[string]string{
		"host": "10.0.0.5",
		"port": "5432",
		"opt":  "a=b",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseKeyValueArray = %#v, want %#v", got, want)
	}
}

func TestPgExecuteRbacScriptRejectsReadOnlyConnection(t *testing.T) {
	c := &Client{
		config: ConnectionConfig{
			Engine:         "postgresql",
			AllowRbacWrite: false,
		},
	}
	err := c.PgExecuteRbacScript(context.Background(), "GRANT SELECT ON TABLE public.users TO app_reader;")
	if err == nil {
		t.Fatalf("expected error when AllowRbacWrite is false")
	}
	if !strings.Contains(err.Error(), "Write for RBAC") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestSplitSQLStatements(t *testing.T) {
	t.Run("header_comment_before_create_role", func(t *testing.T) {
		ddl := "-- ============================================================\n" +
			"-- PlanIQ Security & RBAC Studio — Generated DDL\n" +
			"-- Generated: 2026-11-26T06:18:00.000Z\n" +
			"-- REVIEW BEFORE APPLYING\n" +
			"-- ============================================================\n\n" +
			`CREATE ROLE "my_group" NOLOGIN INHERIT CONNECTION LIMIT -1;`
		got := splitSQLStatements(ddl)
		want := []string{`CREATE ROLE "my_group" NOLOGIN INHERIT CONNECTION LIMIT -1`}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v, want %#v", got, want)
		}
	})

	t.Run("multiple_statements_with_inline_comments", func(t *testing.T) {
		ddl := "-- lead comment\n" +
			`CREATE ROLE "grp" NOLOGIN; -- inline comment` + "\n" +
			`GRANT "grp" TO "alice";`
		got := splitSQLStatements(ddl)
		want := []string{
			`CREATE ROLE "grp" NOLOGIN`,
			`GRANT "grp" TO "alice"`,
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v, want %#v", got, want)
		}
	})

	t.Run("semicolon_and_dashes_inside_single_quotes", func(t *testing.T) {
		ddl := `CREATE ROLE "svc" LOGIN PASSWORD 'a;b--c''d';`
		got := splitSQLStatements(ddl)
		want := []string{`CREATE ROLE "svc" LOGIN PASSWORD 'a;b--c''d'`}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("got %#v, want %#v", got, want)
		}
	})

	t.Run("comment_only_returns_empty", func(t *testing.T) {
		ddl := "-- just a comment\n-- another comment"
		got := splitSQLStatements(ddl)
		if len(got) != 0 {
			t.Fatalf("expected 0 statements, got %#v", got)
		}
	})
}
