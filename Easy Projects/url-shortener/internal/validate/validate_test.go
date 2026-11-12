package validate

import (
	"strings"
	"testing"
)

func TestURL(t *testing.T) {
	const own = "localhost:8080"
	good := [][2]string{
		{"https://example.com", "https://example.com"},
		{"HTTP://Example.COM/Path?q=1#frag", "http://example.com/Path?q=1#frag"},
		{"https://example.com:8443/a/b", "https://example.com:8443/a/b"},
		{"  https://example.com/x  ", "https://example.com/x"},
		{"http://localhost:3000/", "http://localhost:3000/"},
		{"https://[2001:db8::1]/", "https://[2001:db8::1]/"},
		{"https://example.com/a%20b?x=%E2%9C%93", "https://example.com/a%20b?x=%E2%9C%93"},
	}
	for _, c := range good {
		in, want := c[0], c[1]
		got, err := URL(in, own)
		if err != nil {
			t.Errorf("URL(%q) unexpected error: %v", in, err)
			continue
		}
		if got != want {
			t.Errorf("URL(%q) = %q, want %q", in, got, want)
		}
	}

	bad := []string{
		"", "   ", "example.com", "//example.com", "javascript:alert(1)", "JAVASCRIPT:alert(1)",
		"data:text/html;base64,PHNjcmlwdD4=", "file:///etc/passwd", "ftp://example.com/file",
		"mailto:a@b.c", "http://", "https://", "http:///path", "https://exa mple.com",
		"https://example.com/\nSet-Cookie: x=1", "https://user:pass@example.com/",
		"https://example.com@evil.test/", "https://example.com:99999/", "https://example.com:abc/",
		"http://localhost:8080/abc", "https://exämple.com/", "https://-bad-.example/",
		"https://example.com/" + strings.Repeat("a", MaxURLLength),
	}
	for _, in := range bad {
		if got, err := URL(in, own); err == nil {
			t.Errorf("URL(%q) = %q, expected an error", in, got)
		} else if !IsValidation(err) {
			t.Errorf("URL(%q) error is not a validation error: %v", in, err)
		}
	}
}

func TestAlias(t *testing.T) {
	good := [][2]string{{"my-link", "my-link"}, {"MyLink", "mylink"}, {"a_b-c9", "a_b-c9"}, {"abc", "abc"}, {" abc ", "abc"}}
	for _, c := range good {
		in, want := c[0], c[1]
		got, err := Alias(in)
		if err != nil || got != want {
			t.Errorf("Alias(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	bad := []string{
		"", "ab", strings.Repeat("a", 33), "-abc", "abc-", "_abc", "a b c", "a/b", "a.b",
		"api", "DOCS", "Login", "x'; DROP TABLE links;--", "<script>", "ünïcode", "a%20b",
	}
	for _, in := range bad {
		if got, err := Alias(in); err == nil {
			t.Errorf("Alias(%q) = %q, expected an error", in, got)
		}
	}
}

func TestEmail(t *testing.T) {
	if got, err := Email("  Person@Example.COM "); err != nil || got != "person@example.com" {
		t.Errorf("Email normalisation failed: %q, %v", got, err)
	}
	for _, in := range []string{"", "nope", "a@", "@b.c", "Name <a@b.c>", strings.Repeat("a", 250) + "@b.cc"} {
		if _, err := Email(in); err == nil {
			t.Errorf("Email(%q) expected an error", in)
		}
	}
}

func TestPassword(t *testing.T) {
	if err := Password("correct horse battery", "a@b.c"); err != nil {
		t.Errorf("valid password rejected: %v", err)
	}
	for _, pw := range []string{"", "short", strings.Repeat("a", 129)} {
		if err := Password(pw, ""); err == nil {
			t.Errorf("Password(%q) expected an error", pw)
		}
	}
	if err := Password("same@mail.com", "same@mail.com"); err == nil {
		t.Error("password equal to email should be rejected")
	}
}

func TestCodeShape(t *testing.T) {
	for _, s := range []string{"abc", "a2c4e6g8", "my-link_1"} {
		if !CodeShape(s) {
			t.Errorf("CodeShape(%q) = false", s)
		}
	}
	for _, s := range []string{"", "ab", "UPPER", "a.b", "-ab", "a b"} {
		if CodeShape(s) {
			t.Errorf("CodeShape(%q) = true", s)
		}
	}
}

func TestURLRejectsLinksBackToThisShortener(t *testing.T) {
	cases := []struct {
		own  string
		in   string
		want bool
	}{
		{"short.example", "https://short.example/abc", true},
		{"short.example", "HTTPS://Short.Example:443/abc", true},
		{"short.example", "http://short.example/abc", true},
		{"short.example", "https://short.example:8443/abc", false},
		{"short.example", "https://other.example/abc", false},
		{"localhost:8080", "http://localhost:8080/abc", true},
		{"localhost:8080", "http://localhost/abc", false},
		{"localhost:8080", "http://localhost:3000/abc", false},
	}
	for _, c := range cases {
		_, err := URL(c.in, c.own)
		if (err != nil) != c.want {
			t.Errorf("URL(%q) with own host %q: rejected=%v, want %v", c.in, c.own, err != nil, c.want)
		}
	}
}
