package ratelimit

import (
	"testing"
	"time"
)

func TestAllowAndWindowReset(t *testing.T) {
	l := New(3, time.Minute)
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return now }

	for i := 0; i < 3; i++ {
		if ok, _ := l.Allow("1.2.3.4"); !ok {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
	ok, retry := l.Allow("1.2.3.4")
	if ok {
		t.Fatal("fourth request should be blocked")
	}
	if retry <= 0 || retry > time.Minute {
		t.Errorf("unexpected retry-after: %v", retry)
	}
	if ok, _ := l.Allow("5.6.7.8"); !ok {
		t.Error("a different key must have its own budget")
	}

	now = now.Add(61 * time.Second)
	if ok, _ := l.Allow("1.2.3.4"); !ok {
		t.Error("budget should reset after the window")
	}
}

func TestSweep(t *testing.T) {
	l := New(1, time.Second)
	now := time.Now()
	l.now = func() time.Time { return now }
	l.Allow("a")
	l.Allow("b")
	now = now.Add(2 * time.Second)
	l.Sweep()
	if len(l.hits) != 0 {
		t.Errorf("expected all entries to be swept, %d left", len(l.hits))
	}
}
