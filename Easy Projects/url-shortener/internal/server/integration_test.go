package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"url-shortener/internal/auth"
	"url-shortener/internal/config"
	"url-shortener/internal/store"
)

type testEnv struct {
	t    *testing.T
	ts   *httptest.Server
	pool *pgxpool.Pool
}

func newTestEnv(t *testing.T, secureCookies bool) *testEnv {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set: skipping PostgreSQL integration test")
	}
	u, err := url.Parse(dsn)
	if err != nil || !strings.HasSuffix(strings.TrimPrefix(u.Path, "/"), "_test") {
		t.Fatalf("refusing to run: the database name in TEST_DATABASE_URL must end with _test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`); err != nil {
		t.Fatal(err)
	}

	st, err := store.Open(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(st.Close)
	if err := st.Migrate(ctx); err != nil {
		t.Fatal(err)
	}

	cfg := config.Config{
		BaseURL:         "http://localhost:8080",
		BaseHost:        "localhost:8080",
		CookieSecure:    secureCookies,
		GuestSessionTTL: 24 * time.Hour,
		UserSessionTTL:  time.Hour,
	}
	static := fstest.MapFS{
		"index.html":       {Data: []byte("<!doctype html><title>app</title>")},
		"link-status.html": {Data: []byte("<!doctype html><title>gone</title>")},
	}
	srv := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)), static, []byte("openapi: 3.0.3"))
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return &testEnv{t: t, ts: ts, pool: pool}
}

func (e *testEnv) count(query string, args ...any) int {
	e.t.Helper()
	var n int
	if err := e.pool.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func (e *testEnv) exec(query string, args ...any) {
	e.t.Helper()
	if _, err := e.pool.Exec(context.Background(), query, args...); err != nil {
		e.t.Fatal(err)
	}
}

type client struct {
	t    *testing.T
	base string
	http *http.Client
}

func (e *testEnv) newClient() *client {
	jar, err := cookiejar.New(nil)
	if err != nil {
		e.t.Fatal(err)
	}
	return &client{
		t:    e.t,
		base: e.ts.URL,
		http: &http.Client{
			Jar:           jar,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
}

type response struct {
	t      *testing.T
	Status int
	Header http.Header
	Raw    []byte
}

func (c *client) do(method, path string, body any, headers ...string) response {
	c.t.Helper()
	var rd io.Reader
	switch b := body.(type) {
	case nil:
	case string:
		rd = strings.NewReader(b)
	default:
		raw, err := json.Marshal(b)
		if err != nil {
			c.t.Fatal(err)
		}
		rd = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, c.base+path, rd)
	if err != nil {
		c.t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	for i := 0; i+1 < len(headers); i += 2 {
		if headers[i+1] == "" {
			req.Header.Del(headers[i])
		} else {
			req.Header.Set(headers[i], headers[i+1])
		}
	}
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		c.t.Fatal(err)
	}
	return response{t: c.t, Status: res.StatusCode, Header: res.Header, Raw: raw}
}

func (r response) json() map[string]any {
	r.t.Helper()
	var m map[string]any
	if err := json.Unmarshal(r.Raw, &m); err != nil {
		r.t.Fatalf("response is not a JSON object (status %d): %s", r.Status, r.Raw)
	}
	return m
}

func (r response) data() map[string]any {
	r.t.Helper()
	d, _ := r.json()["data"].(map[string]any)
	if d == nil {
		r.t.Fatalf("response has no data object (status %d): %s", r.Status, r.Raw)
	}
	return d
}

func (r response) list() []any {
	r.t.Helper()
	l, ok := r.json()["data"].([]any)
	if !ok {
		r.t.Fatalf("response has no data list (status %d): %s", r.Status, r.Raw)
	}
	return l
}

func (r response) errCode() string {
	r.t.Helper()
	e, _ := r.json()["error"].(map[string]any)
	code, _ := e["code"].(string)
	return code
}

func (r response) errFields() map[string]any {
	r.t.Helper()
	e, _ := r.json()["error"].(map[string]any)
	f, _ := e["fields"].(map[string]any)
	return f
}

func expect(t *testing.T, r response, status int) response {
	t.Helper()
	if r.Status != status {
		t.Fatalf("status = %d, want %d; body: %s", r.Status, status, r.Raw)
	}
	return r
}

func (c *client) createLink(dest string, alias ...string) response {
	c.t.Helper()
	payload := map[string]string{"url": dest}
	if len(alias) > 0 {
		payload["alias"] = alias[0]
	}
	return c.do(http.MethodPost, "/api/v1/links", payload)
}

func (c *client) register(email, password string) response {
	c.t.Helper()
	return c.do(http.MethodPost, "/api/v1/auth/register", map[string]string{"email": email, "password": password})
}

func (c *client) login(email, password string) response {
	c.t.Helper()
	return c.do(http.MethodPost, "/api/v1/auth/login", map[string]string{"email": email, "password": password})
}

func (c *client) cookieValue(name string) string {
	u, _ := url.Parse(c.base)
	for _, ck := range c.http.Jar.Cookies(u) {
		if ck.Name == name {
			return ck.Value
		}
	}
	return ""
}

const goodPassword = "correct horse battery"

func TestShortenRedirectAndCountClicks(t *testing.T) {
	env := newTestEnv(t, false)
	owner := env.newClient()

	res := expect(t, owner.createLink("https://example.com/page?x=1"), http.StatusCreated).data()
	code, _ := res["code"].(string)
	id, _ := res["id"].(string)
	if len(code) != 8 {
		t.Errorf("generated code %q should have 8 characters", code)
	}
	if res["short_url"] != "http://localhost:8080/"+code {
		t.Errorf("short_url = %v", res["short_url"])
	}
	if res["destination"] != "https://example.com/page?x=1" {
		t.Errorf("destination = %v", res["destination"])
	}

	visitor := env.newClient()
	hit := expect(t, visitor.do(http.MethodGet, "/"+code, nil, "Referer", "https://news.example.org/secret/path?token=abc"), http.StatusFound)
	if loc := hit.Header.Get("Location"); loc != "https://example.com/page?x=1" {
		t.Errorf("Location = %q", loc)
	}
	if hit.Header.Get("Referrer-Policy") != "no-referrer" {
		t.Error("redirects must send Referrer-Policy: no-referrer")
	}
	expect(t, visitor.do(http.MethodGet, "/"+strings.ToUpper(code), nil), http.StatusFound)
	expect(t, visitor.do(http.MethodHead, "/"+code, nil), http.StatusFound)

	a := expect(t, owner.do(http.MethodGet, "/api/v1/links/"+id+"/analytics?days=7", nil), http.StatusOK).data()
	if a["total"] != float64(2) {
		t.Errorf("analytics total = %v, want 2 (HEAD must not be counted)", a["total"])
	}
	refs, _ := a["referrers"].([]any)
	if len(refs) != 1 {
		t.Fatalf("referrers = %v", a["referrers"])
	}
	first, _ := refs[0].(map[string]any)
	if first["host"] != "news.example.org" || first["count"] != float64(1) {
		t.Errorf("referrer = %v, want host news.example.org count 1", first)
	}
	if a["no_referrer"] != float64(1) {
		t.Errorf("no_referrer = %v, want 1", a["no_referrer"])
	}

	list := expect(t, owner.do(http.MethodGet, "/api/v1/links", nil), http.StatusOK).list()
	if len(list) != 1 {
		t.Fatalf("list length = %d", len(list))
	}
	if row, _ := list[0].(map[string]any); row["clicks"] != float64(2) {
		t.Errorf("clicks = %v, want 2", row["clicks"])
	}

	if n := env.count(`SELECT count(*) FROM clicks WHERE referrer_host ~ '[/?#=]'`); n != 0 {
		t.Errorf("%d click rows store more than a hostname", n)
	}
	if n := env.count(`SELECT count(*) FROM clicks WHERE referrer_host = 'news.example.org'`); n != 1 {
		t.Errorf("expected one stored referrer host, got %d", n)
	}
}

func TestClicksTableStoresNoPersonalData(t *testing.T) {
	env := newTestEnv(t, false)
	rows, err := env.pool.Query(context.Background(),
		`SELECT column_name FROM information_schema.columns WHERE table_name = 'clicks' ORDER BY column_name`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var cols []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			t.Fatal(err)
		}
		cols = append(cols, c)
	}
	if got, want := strings.Join(cols, ","), "clicked_at,id,link_id,referrer_host"; got != want {
		t.Errorf("clicks columns = %s, want %s (no IP, user agent or visitor id)", got, want)
	}
}

func TestMissingAndInvalidCodes(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()
	for _, path := range []string{"/nosuchcode", "/x", "/UPPER_unknown", "/a.b", "/%27%3B%20DROP%20TABLE%20links%3B--"} {
		expect(t, c.do(http.MethodGet, path, nil), http.StatusNotFound)
	}
	expect(t, c.do(http.MethodGet, "/api/v1/nothing", nil), http.StatusNotFound)
}

func TestCustomAliases(t *testing.T) {
	env := newTestEnv(t, false)
	a, b := env.newClient(), env.newClient()

	res := expect(t, a.createLink("https://example.com/a", "My-Link"), http.StatusCreated).data()
	if res["code"] != "my-link" {
		t.Errorf("alias should be normalised to lowercase, got %v", res["code"])
	}
	expect(t, b.do(http.MethodGet, "/MY-LINK", nil), http.StatusFound)

	dup := expect(t, b.createLink("https://example.com/b", "my-link"), http.StatusConflict)
	if dup.errCode() != "alias_taken" || dup.errFields()["alias"] == nil {
		t.Errorf("unexpected conflict response: %s", dup.Raw)
	}
	for _, bad := range []string{"api", "Docs", "ab", "has space", "-lead", "semi;colon", strings.Repeat("a", 33)} {
		r := expect(t, b.createLink("https://example.com/c", bad), http.StatusUnprocessableEntity)
		if r.errFields()["alias"] == nil {
			t.Errorf("alias %q: expected an alias field error, got %s", bad, r.Raw)
		}
	}
}

func TestUnsafeURLsAreRejectedBeforeAnySessionIsCreated(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()
	bad := []string{
		"", "example.com", "javascript:alert(1)", "data:text/html,<script>alert(1)</script>",
		"file:///etc/passwd", "ftp://example.com/x", "http://localhost:8080/abc",
		"https://user:pass@example.com/", "https://example.com/\r\nX: y", "//example.com",
	}
	for _, u := range bad {
		r := expect(t, c.createLink(u), http.StatusUnprocessableEntity)
		if r.errFields()["url"] == nil {
			t.Errorf("url %q: expected a url field error, got %s", u, r.Raw)
		}
	}
	if n := env.count(`SELECT count(*) FROM links`); n != 0 {
		t.Errorf("%d links were created from invalid input", n)
	}
	if n := env.count(`SELECT count(*) FROM guest_sessions`); n != 0 {
		t.Errorf("%d guest sessions were created by invalid requests", n)
	}
}

func TestSQLInjectionAttempts(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()

	expect(t, c.createLink("https://example.com/ok", "x'; DROP TABLE links;--"), http.StatusUnprocessableEntity)
	made := expect(t, c.createLink("https://example.com/?q='%20OR%20'1'='1"), http.StatusCreated).data()
	if made["destination"] != "https://example.com/?q='%20OR%20'1'='1" && made["destination"] != "https://example.com/?q='%20OR%20'1'='1" {
		t.Logf("destination stored as %v", made["destination"])
	}

	for _, q := range []string{"%' OR 1=1 --", "%", "_", `\`, "'; DROP TABLE links; --"} {
		r := expect(t, c.do(http.MethodGet, "/api/v1/links?q="+url.QueryEscape(q), nil), http.StatusOK)
		if got := len(r.list()); got != 0 {
			t.Errorf("search %q returned %d rows, want 0 (wildcards must be escaped)", q, got)
		}
	}
	if n := env.count(`SELECT count(*) FROM links`); n != 1 {
		t.Errorf("links table has %d rows, want 1", n)
	}
	expect(t, c.do(http.MethodGet, "/api/v1/links/1'%20OR%20'1'='1", nil), http.StatusNotFound)
}

func TestSearchFilterSortAndPagination(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()
	expect(t, c.createLink("https://alpha.example/one", "first-link"), http.StatusCreated)
	expect(t, c.createLink("https://beta.example/two", "second-link"), http.StatusCreated)
	expect(t, c.createLink("https://gamma.example/three", "third-link"), http.StatusCreated)
	expect(t, env.newClient().do(http.MethodGet, "/second-link", nil), http.StatusFound)

	names := func(path string) []string {
		var out []string
		for _, it := range expect(t, c.do(http.MethodGet, path, nil), http.StatusOK).list() {
			m, _ := it.(map[string]any)
			out = append(out, m["code"].(string))
		}
		return out
	}
	if got := strings.Join(names("/api/v1/links"), ","); got != "third-link,second-link,first-link" {
		t.Errorf("default order = %s", got)
	}
	if got := strings.Join(names("/api/v1/links?sort=oldest"), ","); got != "first-link,second-link,third-link" {
		t.Errorf("oldest order = %s", got)
	}
	if got := names("/api/v1/links?sort=clicks"); got[0] != "second-link" {
		t.Errorf("most-clicked first, got %v", got)
	}
	if got := names("/api/v1/links?filter=clicked"); len(got) != 1 || got[0] != "second-link" {
		t.Errorf("clicked filter = %v", got)
	}
	if got := names("/api/v1/links?filter=unclicked"); len(got) != 2 {
		t.Errorf("unclicked filter = %v", got)
	}
	if got := names("/api/v1/links?q=BETA.example"); len(got) != 1 || got[0] != "second-link" {
		t.Errorf("search by destination = %v", got)
	}
	page := expect(t, c.do(http.MethodGet, "/api/v1/links?limit=1&offset=1&sort=oldest", nil), http.StatusOK)
	meta, _ := page.json()["meta"].(map[string]any)
	if meta["total"] != float64(3) || len(page.list()) != 1 {
		t.Errorf("pagination meta = %v, items = %d", meta, len(page.list()))
	}
	expect(t, c.do(http.MethodGet, "/api/v1/links?limit=1000", nil), http.StatusBadRequest)
	expect(t, c.do(http.MethodGet, "/api/v1/links?sort=DROP", nil), http.StatusBadRequest)
}

func TestGuestIsolationAndDeletion(t *testing.T) {
	env := newTestEnv(t, false)
	alice, bob, stranger := env.newClient(), env.newClient(), env.newClient()

	a := expect(t, alice.createLink("https://example.com/alice", "alice-link"), http.StatusCreated).data()
	aliceID, _ := a["id"].(string)
	expect(t, bob.createLink("https://example.com/bob", "bob-link"), http.StatusCreated)

	for name, c := range map[string]*client{"another guest": bob, "visitor with no session": stranger} {
		if r := c.do(http.MethodGet, "/api/v1/links/"+aliceID, nil); r.Status != http.StatusNotFound {
			t.Errorf("%s: GET other guest's link = %d, want 404", name, r.Status)
		}
		if r := c.do(http.MethodGet, "/api/v1/links/"+aliceID+"/analytics", nil); r.Status != http.StatusNotFound {
			t.Errorf("%s: analytics of other guest's link = %d, want 404", name, r.Status)
		}
		if r := c.do(http.MethodDelete, "/api/v1/links/"+aliceID, nil); r.Status != http.StatusNotFound {
			t.Errorf("%s: DELETE other guest's link = %d, want 404", name, r.Status)
		}
	}
	if got := expect(t, bob.do(http.MethodGet, "/api/v1/links", nil), http.StatusOK).list(); len(got) != 1 {
		t.Errorf("bob sees %d links, want only his own", len(got))
	}
	if got := expect(t, stranger.do(http.MethodGet, "/api/v1/links", nil), http.StatusOK).list(); len(got) != 0 {
		t.Errorf("a visitor without a session sees %d links", len(got))
	}
	if env.count(`SELECT count(*) FROM links WHERE deleted_at IS NOT NULL`) != 0 {
		t.Fatal("an unauthorised delete modified data")
	}

	expect(t, alice.do(http.MethodDelete, "/api/v1/links/"+aliceID, nil), http.StatusNoContent)
	expect(t, alice.do(http.MethodDelete, "/api/v1/links/"+aliceID, nil), http.StatusNotFound)
	expect(t, stranger.do(http.MethodGet, "/alice-link", nil), http.StatusGone)
	expect(t, bob.createLink("https://example.com/steal", "alice-link"), http.StatusConflict)
	if got := expect(t, alice.do(http.MethodGet, "/api/v1/links", nil), http.StatusOK).list(); len(got) != 0 {
		t.Errorf("deleted link still listed: %v", got)
	}
	if n := env.count(`SELECT count(*) FROM links WHERE code = 'alice-link' AND destination = ''`); n != 1 {
		t.Error("the deleted link's destination should be erased")
	}
}

func TestInvalidLinkIDsAreNotFound(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()
	expect(t, c.createLink("https://example.com/x"), http.StatusCreated)
	for _, id := range []string{"not-a-uuid", "00000000-0000-0000-0000-000000000000", "../../etc/passwd"} {
		expect(t, c.do(http.MethodGet, "/api/v1/links/"+id, nil), http.StatusNotFound)
		expect(t, c.do(http.MethodDelete, "/api/v1/links/"+id, nil), http.StatusNotFound)
	}
}

func TestRegistrationLoginLogout(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()

	expect(t, c.do(http.MethodGet, "/api/v1/auth/me", nil), http.StatusOK)
	if me := expect(t, c.do(http.MethodGet, "/api/v1/auth/me", nil), http.StatusOK).data(); me["authenticated"] != false {
		t.Errorf("fresh visitor is authenticated: %v", me)
	}

	expect(t, c.register("Person@Example.com", goodPassword), http.StatusCreated)
	if me := expect(t, c.do(http.MethodGet, "/api/v1/auth/me", nil), http.StatusOK).data(); me["authenticated"] != true || me["email"] != "person@example.com" {
		t.Errorf("me after register = %v", me)
	}

	var hash string
	if err := env.pool.QueryRow(context.Background(), `SELECT password_hash FROM users`).Scan(&hash); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") || strings.Contains(hash, goodPassword) {
		t.Errorf("unexpected stored password hash %q", hash)
	}
	token := c.cookieValue(cookieSession)
	if token == "" {
		t.Fatal("no session cookie after registration")
	}
	if n := env.count(`SELECT count(*) FROM sessions WHERE octet_length(token_hash) = 32`); n != 1 {
		t.Errorf("expected one hashed session row, got %d", n)
	}

	other := env.newClient()
	expect(t, other.register("PERSON@example.com", goodPassword), http.StatusConflict)
	expect(t, other.register("new@example.com", "short"), http.StatusUnprocessableEntity)
	expect(t, other.register("not-an-email", goodPassword), http.StatusUnprocessableEntity)

	expect(t, c.do(http.MethodPost, "/api/v1/auth/logout", map[string]string{}), http.StatusNoContent)
	if me := expect(t, c.do(http.MethodGet, "/api/v1/auth/me", nil), http.StatusOK).data(); me["authenticated"] != false {
		t.Errorf("still authenticated after logout: %v", me)
	}
	replay := env.newClient()
	if me := expect(t, replay.do(http.MethodGet, "/api/v1/auth/me", nil, "Cookie", cookieSession+"="+token), http.StatusOK).data(); me["authenticated"] != false {
		t.Error("a logged-out session token still works")
	}

	wrong := expect(t, c.login("person@example.com", "wrong password!!"), http.StatusUnauthorized)
	unknown := expect(t, c.login("nobody@example.com", goodPassword), http.StatusUnauthorized)
	if string(wrong.Raw) != string(unknown.Raw) {
		t.Errorf("login errors differ, which reveals which accounts exist:\n%s\n%s", wrong.Raw, unknown.Raw)
	}
	expect(t, c.login("person@example.com", goodPassword), http.StatusOK)
	if me := expect(t, c.do(http.MethodGet, "/api/v1/auth/me", nil), http.StatusOK).data(); me["authenticated"] != true {
		t.Error("not authenticated after login")
	}
}

func TestUserLinksAreIsolatedBetweenAccounts(t *testing.T) {
	env := newTestEnv(t, false)
	alice, bob, guest := env.newClient(), env.newClient(), env.newClient()
	expect(t, alice.register("alice@example.com", goodPassword), http.StatusCreated)
	expect(t, bob.register("bob@example.com", goodPassword), http.StatusCreated)

	l := expect(t, alice.createLink("https://example.com/private", "alice-private"), http.StatusCreated).data()
	id, _ := l["id"].(string)

	for name, c := range map[string]*client{"bob": bob, "guest": guest} {
		expect(t, c.do(http.MethodGet, "/api/v1/links/"+id, nil), http.StatusNotFound)
		expect(t, c.do(http.MethodGet, "/api/v1/links/"+id+"/analytics", nil), http.StatusNotFound)
		if r := c.do(http.MethodDelete, "/api/v1/links/"+id, nil); r.Status != http.StatusNotFound {
			t.Errorf("%s deleted alice's link: status %d", name, r.Status)
		}
	}
	if n := env.count(`SELECT count(*) FROM links WHERE deleted_at IS NULL`); n != 1 {
		t.Error("alice's link was modified by another user")
	}
	phone := env.newClient()
	expect(t, phone.login("alice@example.com", goodPassword), http.StatusOK)
	expect(t, phone.do(http.MethodGet, "/api/v1/links/"+id, nil), http.StatusOK)
}

func TestGuestLinksMoveToAccountOnRegister(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()
	expect(t, c.createLink("https://example.com/before", "made-as-guest"), http.StatusCreated)
	if c.cookieValue(cookieGuest) == "" {
		t.Fatal("no guest cookie after creating a link")
	}
	expect(t, c.register("keeper@example.com", goodPassword), http.StatusCreated)

	if got := expect(t, c.do(http.MethodGet, "/api/v1/links", nil), http.StatusOK).list(); len(got) != 1 {
		t.Errorf("account has %d links after claiming, want 1", len(got))
	}
	if c.cookieValue(cookieGuest) != "" {
		t.Error("guest cookie should be cleared once its links are claimed")
	}
	if n := env.count(`SELECT count(*) FROM links WHERE user_id IS NOT NULL AND guest_id IS NULL`); n != 1 {
		t.Error("the link should now belong to the user")
	}
	expect(t, env.newClient().do(http.MethodGet, "/made-as-guest", nil), http.StatusFound)
}

func TestSessionExpiry(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()
	expect(t, c.register("expire@example.com", goodPassword), http.StatusCreated)
	env.exec(`UPDATE sessions SET expires_at = now() - interval '1 second'`)
	if me := expect(t, c.do(http.MethodGet, "/api/v1/auth/me", nil), http.StatusOK).data(); me["authenticated"] != false {
		t.Error("an expired user session was accepted")
	}

	g := env.newClient()
	expect(t, g.createLink("https://example.com/g", "guest-expiry"), http.StatusCreated)
	env.exec(`UPDATE guest_sessions SET expires_at = now() - interval '1 second'`)
	if r := g.do(http.MethodGet, "/api/v1/links", nil); len(expect(t, r, http.StatusOK).list()) != 0 {
		t.Error("an expired guest session still lists links")
	}
}

func TestChangePasswordSignsOutOtherSessions(t *testing.T) {
	env := newTestEnv(t, false)
	laptop, phone := env.newClient(), env.newClient()
	expect(t, laptop.register("pw@example.com", goodPassword), http.StatusCreated)
	expect(t, phone.login("pw@example.com", goodPassword), http.StatusOK)

	const newPassword = "an entirely new password"
	expect(t, laptop.do(http.MethodPut, "/api/v1/auth/password", map[string]string{"current_password": "wrong password!!", "new_password": newPassword}), http.StatusUnprocessableEntity)
	expect(t, laptop.do(http.MethodPut, "/api/v1/auth/password", map[string]string{"current_password": goodPassword, "new_password": "short"}), http.StatusUnprocessableEntity)
	expect(t, laptop.do(http.MethodPut, "/api/v1/auth/password", map[string]string{"current_password": goodPassword, "new_password": newPassword}), http.StatusNoContent)

	if me := expect(t, laptop.do(http.MethodGet, "/api/v1/auth/me", nil), http.StatusOK).data(); me["authenticated"] != true {
		t.Error("the session that changed the password should stay signed in")
	}
	if me := expect(t, phone.do(http.MethodGet, "/api/v1/auth/me", nil), http.StatusOK).data(); me["authenticated"] != false {
		t.Error("other sessions must be signed out after a password change")
	}
	expect(t, env.newClient().login("pw@example.com", goodPassword), http.StatusUnauthorized)
	expect(t, env.newClient().login("pw@example.com", newPassword), http.StatusOK)
	expect(t, env.newClient().do(http.MethodPut, "/api/v1/auth/password", map[string]string{"current_password": "x", "new_password": newPassword}), http.StatusUnauthorized)
}

func TestAnalyticsAggregation(t *testing.T) {
	env := newTestEnv(t, false)
	owner := env.newClient()
	l := expect(t, owner.createLink("https://example.com/stats", "stats-link"), http.StatusCreated).data()
	id, _ := l["id"].(string)

	visitor := env.newClient()
	for i := 0; i < 3; i++ {
		expect(t, visitor.do(http.MethodGet, "/stats-link", nil, "Referer", "https://a.example/"), http.StatusFound)
	}
	env.exec(`INSERT INTO clicks (link_id, clicked_at, referrer_host)
	          SELECT id, now() - interval '1 day', 'b.example' FROM links, generate_series(1, 2)`)
	env.exec(`INSERT INTO clicks (link_id, clicked_at) SELECT id, now() - interval '5 days' FROM links`)
	env.exec(`UPDATE links SET click_count = click_count + 3`)

	a := expect(t, owner.do(http.MethodGet, "/api/v1/links/"+id+"/analytics?days=3", nil), http.StatusOK).data()
	series, _ := a["series"].([]any)
	if len(series) != 3 {
		t.Fatalf("series has %d days, want 3", len(series))
	}
	today, _ := series[2].(map[string]any)
	yesterday, _ := series[1].(map[string]any)
	oldest, _ := series[0].(map[string]any)
	if today["count"] != float64(3) || yesterday["count"] != float64(2) || oldest["count"] != float64(0) {
		t.Errorf("series counts = %v / %v / %v, want 0 / 2 / 3", oldest["count"], yesterday["count"], today["count"])
	}
	if a["total"] != float64(5) {
		t.Errorf("window total = %v, want 5 (the 5-day-old click is outside a 3-day window)", a["total"])
	}
	refs, _ := a["referrers"].([]any)
	if len(refs) != 2 {
		t.Fatalf("referrers = %v", refs)
	}
	if top, _ := refs[0].(map[string]any); top["host"] != "a.example" || top["count"] != float64(3) {
		t.Errorf("top referrer = %v", top)
	}

	s := expect(t, owner.do(http.MethodGet, "/api/v1/analytics/summary?days=30", nil), http.StatusOK).data()
	if s["total_links"] != float64(1) || s["active_links"] != float64(1) || s["total_clicks"] != float64(6) || s["total"] != float64(6) {
		t.Errorf("summary = %v", s)
	}
	top, _ := s["top_links"].([]any)
	if len(top) != 1 {
		t.Fatalf("top_links = %v", top)
	}
	if first, _ := top[0].(map[string]any); first["code"] != "stats-link" || first["clicks"] != float64(6) {
		t.Errorf("top link = %v", first)
	}
	expect(t, owner.do(http.MethodGet, "/api/v1/analytics/summary?days=0", nil), http.StatusBadRequest)
	expect(t, owner.do(http.MethodGet, "/api/v1/analytics/summary?days=9999", nil), http.StatusBadRequest)

	empty := expect(t, env.newClient().do(http.MethodGet, "/api/v1/analytics/summary", nil), http.StatusOK).data()
	if empty["total_links"] != float64(0) || empty["total"] != float64(0) {
		t.Errorf("empty summary = %v", empty)
	}
	expect(t, owner.do(http.MethodDelete, "/api/v1/links/"+id, nil), http.StatusNoContent)
	if n := env.count(`SELECT count(*) FROM clicks`); n != 0 {
		t.Errorf("%d clicks remain after deleting the link", n)
	}
}

func TestCSRFProtectionOnAPI(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()
	body := map[string]string{"url": "https://example.com/csrf"}

	expect(t, c.do(http.MethodPost, "/api/v1/links", body, "X-Requested-With", ""), http.StatusForbidden)
	expect(t, c.do(http.MethodPost, "/api/v1/links", body, "Origin", "https://evil.example"), http.StatusForbidden)
	expect(t, c.do(http.MethodPost, "/api/v1/auth/logout", map[string]string{}, "X-Requested-With", ""), http.StatusForbidden)
	expect(t, c.do(http.MethodPost, "/api/v1/links", body, "Origin", env.ts.URL), http.StatusCreated)
	if n := env.count(`SELECT count(*) FROM links`); n != 1 {
		t.Errorf("%d links exist, want exactly the one same-origin request", n)
	}
}

func TestRequestBodyLimits(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()
	huge := `{"url":"https://example.com/` + strings.Repeat("a", 20000) + `"}`
	expect(t, c.do(http.MethodPost, "/api/v1/links", huge, "Content-Type", "application/json"), http.StatusRequestEntityTooLarge)
	expect(t, c.do(http.MethodPost, "/api/v1/links", `url=https://example.com`, "Content-Type", "application/x-www-form-urlencoded"), http.StatusUnsupportedMediaType)
	expect(t, c.do(http.MethodPost, "/api/v1/links", `{"url":"https://example.com","owner_id":"x"}`, "Content-Type", "application/json"), http.StatusBadRequest)
}

func TestOwnershipCannotBeSuppliedByTheClient(t *testing.T) {
	env := newTestEnv(t, false)
	victim, attacker := env.newClient(), env.newClient()
	expect(t, victim.register("victim@example.com", goodPassword), http.StatusCreated)
	var victimID string
	if err := env.pool.QueryRow(context.Background(), `SELECT id::text FROM users`).Scan(&victimID); err != nil {
		t.Fatal(err)
	}
	expect(t, attacker.do(http.MethodPost, "/api/v1/links", `{"url":"https://example.com","user_id":"`+victimID+`"}`, "Content-Type", "application/json"), http.StatusBadRequest)
	forged := env.newClient()
	r := forged.do(http.MethodGet, "/api/v1/links", nil, "Cookie", cookieSession+"="+victimID+"; "+cookieGuest+"="+victimID)
	if got := expect(t, r, http.StatusOK).list(); len(got) != 0 {
		t.Error("a forged cookie exposed links")
	}
}

func TestSessionCookieProperties(t *testing.T) {
	env := newTestEnv(t, true)
	c := env.newClient()

	res := expect(t, c.createLink("https://example.com/cookie"), http.StatusCreated)
	var guest *http.Cookie
	for _, ck := range (&http.Response{Header: res.Header}).Cookies() {
		if ck.Name == cookieGuest {
			guest = ck
		}
	}
	if guest == nil {
		t.Fatal("no guest cookie was set")
	}
	if !guest.HttpOnly || !guest.Secure || guest.SameSite != http.SameSiteStrictMode || guest.Path != "/" || guest.MaxAge <= 0 {
		t.Errorf("guest cookie flags are wrong: %+v", guest)
	}
	if len(guest.Value) < 40 {
		t.Errorf("guest token is too short (%d chars) to be unguessable", len(guest.Value))
	}
	hashed := auth.HashToken(guest.Value)
	if n := env.count(`SELECT count(*) FROM guest_sessions WHERE token_hash = $1`, hashed); n != 1 {
		t.Error("the database should hold the SHA-256 hash of the guest token")
	}
	if res.Header.Get("Strict-Transport-Security") == "" {
		t.Error("HSTS missing on an https deployment")
	}
}

func TestSecurityHeadersOnRealResponses(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()
	for _, path := range []string{"/", "/api/v1/auth/me", "/nosuchcode", "/healthz"} {
		r := c.do(http.MethodGet, path, nil)
		if r.Header.Get("Content-Security-Policy") == "" || r.Header.Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("%s: security headers missing", path)
		}
	}
	if cc := c.do(http.MethodGet, "/api/v1/auth/me", nil).Header.Get("Cache-Control"); cc != "no-store" {
		t.Errorf("API responses must not be cached, got %q", cc)
	}
	docs := c.do(http.MethodGet, "/docs", nil)
	if !strings.Contains(docs.Header.Get("Content-Security-Policy"), "style-src 'self' 'unsafe-inline'") {
		t.Error("the docs page needs the relaxed style policy for Swagger UI")
	}
}

func TestPerOwnerLinkLimit(t *testing.T) {
	env := newTestEnv(t, false)
	c := env.newClient()
	expect(t, c.createLink("https://example.com/first"), http.StatusCreated)
	env.exec(`INSERT INTO links (code, destination, guest_id)
	          SELECT 'bulk-' || g, 'https://example.com/' || g, (SELECT id FROM guest_sessions LIMIT 1)
	            FROM generate_series(1, $1::int) g`, maxLinksPerOwner-1)
	r := expect(t, c.createLink("https://example.com/over"), http.StatusForbidden)
	if r.errCode() != "link_limit_reached" {
		t.Errorf("error code = %q", r.errCode())
	}
}
