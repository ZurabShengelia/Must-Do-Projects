package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"url-shortener/internal/config"
	"url-shortener/internal/ratelimit"
)

func newUnitServer(cfg config.Config) *Server {
	static := fstest.MapFS{
		"index.html":       {Data: []byte("<!doctype html><title>app</title>")},
		"link-status.html": {Data: []byte("<!doctype html><title>gone</title>")},
	}
	return &Server{
		cfg:     cfg,
		log:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		static:  static,
		openapi: []byte("openapi: 3.0.3"),
	}
}

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
}

func TestSecurityHeaders(t *testing.T) {
	s := newUnitServer(config.Config{CookieSecure: true})
	rec := httptest.NewRecorder()
	s.securityHeaders(okHandler()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	h := rec.Header()
	csp := h.Get("Content-Security-Policy")
	for _, want := range []string{"default-src 'none'", "script-src 'self'", "frame-ancestors 'none'", "object-src 'none'"} {
		if !strings.Contains(csp, want) {
			t.Errorf("CSP %q is missing %q", csp, want)
		}
	}
	if strings.Contains(csp, "unsafe-inline") || strings.Contains(csp, "unsafe-eval") {
		t.Errorf("application CSP must not allow unsafe-inline or unsafe-eval: %q", csp)
	}
	for name, want := range map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "same-origin",
	} {
		if got := h.Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
	if h.Get("Permissions-Policy") == "" {
		t.Error("Permissions-Policy header missing")
	}
	if h.Get("Strict-Transport-Security") == "" {
		t.Error("HSTS must be sent when cookies are secure (https deployment)")
	}

	rec = httptest.NewRecorder()
	newUnitServer(config.Config{}).securityHeaders(okHandler()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Header().Get("Strict-Transport-Security") != "" {
		t.Error("HSTS must not be sent over plain http")
	}
}

func TestCSRFGuard(t *testing.T) {
	s := newUnitServer(config.Config{BaseHost: "short.example"})
	h := s.csrfGuard(okHandler())

	cases := []struct {
		name    string
		method  string
		headers map[string]string
		want    int
	}{
		{"GET needs nothing", http.MethodGet, nil, http.StatusNoContent},
		{"POST without header", http.MethodPost, nil, http.StatusForbidden},
		{"POST with header", http.MethodPost, map[string]string{"X-Requested-With": "XMLHttpRequest"}, http.StatusNoContent},
		{"DELETE without header", http.MethodDelete, nil, http.StatusForbidden},
		{"foreign origin", http.MethodPost, map[string]string{"X-Requested-With": "XMLHttpRequest", "Origin": "https://evil.example"}, http.StatusForbidden},
		{"null origin", http.MethodPost, map[string]string{"X-Requested-With": "XMLHttpRequest", "Origin": "null"}, http.StatusForbidden},
		{"same origin", http.MethodPost, map[string]string{"X-Requested-With": "XMLHttpRequest", "Origin": "https://short.example"}, http.StatusNoContent},
	}
	for _, c := range cases {
		req := httptest.NewRequest(c.method, "https://short.example/api/v1/links", nil)
		for k, v := range c.headers {
			req.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != c.want {
			t.Errorf("%s: status = %d, want %d", c.name, rec.Code, c.want)
		}
	}
}

func TestRateLimitMiddleware(t *testing.T) {
	s := newUnitServer(config.Config{})
	h := s.limit(ratelimit.New(2, time.Minute))(okHandler())

	var last *httptest.ResponseRecorder
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "203.0.113.9:5555"
		last = httptest.NewRecorder()
		h.ServeHTTP(last, req)
	}
	if last.Code != http.StatusTooManyRequests {
		t.Fatalf("third request status = %d, want 429", last.Code)
	}
	if last.Header().Get("Retry-After") == "" {
		t.Error("429 response must include Retry-After")
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "203.0.113.10:5555"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Errorf("other client status = %d, want 204", rec.Code)
	}
}

func TestClientIP(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "198.51.100.7:4000"
	req.Header.Set("X-Forwarded-For", "1.1.1.1, 10.0.0.2")

	if got := newUnitServer(config.Config{}).clientIP(req); got != "198.51.100.7" {
		t.Errorf("without TRUST_PROXY, clientIP = %q; X-Forwarded-For must be ignored", got)
	}
	if got := newUnitServer(config.Config{TrustProxy: true}).clientIP(req); got != "10.0.0.2" {
		t.Errorf("with TRUST_PROXY, clientIP = %q, want the last (proxy-appended) entry", got)
	}
}

func TestRecovererHidesPanicDetails(t *testing.T) {
	s := newUnitServer(config.Config{})
	h := s.recoverer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("secret internal detail")
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "secret internal detail") || strings.Contains(rec.Body.String(), "goroutine") {
		t.Errorf("response leaks panic details: %s", rec.Body.String())
	}
}

func TestDecodeJSONLimits(t *testing.T) {
	type payload struct {
		URL string `json:"url"`
	}
	cases := []struct {
		name        string
		contentType string
		body        string
		want        int
	}{
		{"valid", "application/json", `{"url":"https://example.com"}`, 0},
		{"valid with charset", "application/json; charset=utf-8", `{"url":"x"}`, 0},
		{"wrong content type", "text/plain", `{"url":"x"}`, http.StatusUnsupportedMediaType},
		{"missing content type", "", `{"url":"x"}`, http.StatusUnsupportedMediaType},
		{"unknown field", "application/json", `{"url":"x","admin":true}`, http.StatusBadRequest},
		{"trailing data", "application/json", `{"url":"x"} {"url":"y"}`, http.StatusBadRequest},
		{"malformed", "application/json", `{"url":`, http.StatusBadRequest},
		{"too large", "application/json", `{"url":"` + strings.Repeat("a", maxBodyBytes+10) + `"}`, http.StatusRequestEntityTooLarge},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(c.body))
		if c.contentType != "" {
			req.Header.Set("Content-Type", c.contentType)
		}
		rec := httptest.NewRecorder()
		var p payload
		ok := decodeJSON(rec, req, &p)
		if c.want == 0 {
			if !ok {
				t.Errorf("%s: rejected with %d: %s", c.name, rec.Code, rec.Body.String())
			}
			continue
		}
		if ok || rec.Code != c.want {
			t.Errorf("%s: ok=%v status=%d, want status %d", c.name, ok, rec.Code, c.want)
		}
	}
}

func TestReferrerHostKeepsOnlyTheHostname(t *testing.T) {
	cases := []struct {
		referer string
		want    string
	}{
		{"https://News.Example.org/path/secret?token=abc#frag", "news.example.org"},
		{"http://example.com:8080/x", "example.com"},
		{"", ""},
		{"not a url", ""},
		{"javascript:alert(1)", ""},
		{"ftp://example.com/", ""},
		{"https://short.example/dashboard", ""},
		{"https://exa mple.com/", ""},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, "/abc", nil)
		if c.referer != "" {
			req.Header.Set("Referer", c.referer)
		}
		got := referrerHost(req, "short.example")
		switch {
		case c.want == "" && got != nil:
			t.Errorf("referrerHost(%q) = %q, want nil", c.referer, *got)
		case c.want != "" && (got == nil || *got != c.want):
			t.Errorf("referrerHost(%q) = %v, want %q", c.referer, got, c.want)
		}
	}
}

func TestNotFoundResponses(t *testing.T) {
	s := newUnitServer(config.Config{})

	rec := httptest.NewRecorder()
	s.notFound(rec, httptest.NewRequest(http.MethodGet, "/api/v1/nothing", nil))
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Header().Get("Content-Type"), "application/json") {
		t.Errorf("API 404 should be JSON, got %d %q", rec.Code, rec.Header().Get("Content-Type"))
	}

	rec = httptest.NewRecorder()
	s.notFound(rec, httptest.NewRequest(http.MethodGet, "/a/b/c", nil))
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Header().Get("Content-Type"), "text/html") {
		t.Errorf("page 404 should be HTML, got %d %q", rec.Code, rec.Header().Get("Content-Type"))
	}
}

func TestStaticHandlerHasNoDirectoryListing(t *testing.T) {
	s := newUnitServer(config.Config{})
	rec := httptest.NewRecorder()
	s.staticHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/static/", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("directory listing status = %d, want 404", rec.Code)
	}
}

func TestRateLimitKeyGroupsIPv6ByPrefix(t *testing.T) {
	cases := [][2]string{
		{"198.51.100.7", "198.51.100.7"},
		{"2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"},
		{"2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:db8:1:2::/64"},
		{"not-an-ip", "not-an-ip"},
	}
	for _, c := range cases {
		if got := rateLimitKey(c[0]); got != c[1] {
			t.Errorf("rateLimitKey(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}
