package validate

import (
	"errors"
	"net"
	"net/mail"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

const MaxURLLength = 2048

type Error struct{ Message string }

func (e *Error) Error() string { return e.Message }

func invalid(msg string) error { return &Error{Message: msg} }

func IsValidation(err error) bool {
	var v *Error
	return errors.As(err, &v)
}

var hostnameRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$`)

func IsHostname(h string) bool {
	if h == "" || len(h) > 253 {
		return false
	}
	if net.ParseIP(h) != nil {
		return true
	}
	return hostnameRe.MatchString(h)
}

func URL(raw, ownHost string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", invalid("Enter a URL to shorten.")
	}
	if len(raw) > MaxURLLength {
		return "", invalid("That URL is too long (maximum 2048 characters).")
	}
	for _, r := range raw {
		if unicode.IsControl(r) || unicode.IsSpace(r) {
			return "", invalid("The URL must not contain spaces or control characters.")
		}
	}

	u, err := url.Parse(raw)
	if err != nil {
		return "", invalid("That does not look like a valid URL.")
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme == "" {
		return "", invalid("Start the URL with http:// or https://.")
	}
	if scheme != "http" && scheme != "https" {
		return "", invalid("Only http:// and https:// URLs can be shortened.")
	}
	if u.Opaque != "" || u.Host == "" {
		return "", invalid("That URL is missing a host name.")
	}
	if u.User != nil {
		return "", invalid("URLs containing a username or password are not allowed.")
	}

	host := strings.ToLower(u.Hostname())
	if !IsHostname(host) {
		return "", invalid("That URL has an invalid host name.")
	}
	if p := u.Port(); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil || n < 1 || n > 65535 {
			return "", invalid("That URL has an invalid port.")
		}
	}

	u.Scheme = scheme
	u.Host = strings.ToLower(u.Host)
	if pointsAtSelf(u, ownHost) {
		return "", invalid("This URL already points to this shortener.")
	}
	return u.String(), nil
}

func pointsAtSelf(u *url.URL, own string) bool {
	ownName, ownPort, err := net.SplitHostPort(own)
	if err != nil {
		ownName, ownPort = own, ""
	}
	if !strings.EqualFold(u.Hostname(), ownName) {
		return false
	}
	port := u.Port()
	if port == "" {
		port = "80"
		if u.Scheme == "https" {
			port = "443"
		}
	}
	if ownPort == "" {
		return port == "80" || port == "443"
	}
	return port == ownPort
}

var aliasRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$`)

var reserved = map[string]struct{}{
	"api": {}, "docs": {}, "static": {}, "assets": {}, "admin": {}, "healthz": {}, "health": {},
	"login": {}, "logout": {}, "register": {}, "signup": {}, "signin": {}, "settings": {},
	"dashboard": {}, "links": {}, "link": {}, "analytics": {}, "account": {}, "auth": {},
	"favicon": {}, "robots": {}, "sitemap": {}, "swagger": {}, "openapi": {}, "www": {},
	"help": {}, "about": {}, "terms": {}, "privacy": {}, "security": {}, "support": {},
}

func IsReserved(code string) bool {
	_, ok := reserved[strings.ToLower(code)]
	return ok
}

func CodeShape(s string) bool { return aliasRe.MatchString(s) }

func Alias(raw string) (string, error) {
	a := strings.ToLower(strings.TrimSpace(raw))
	if len(a) < 3 || len(a) > 32 {
		return "", invalid("Aliases must be 3 to 32 characters long.")
	}
	if !aliasRe.MatchString(a) {
		return "", invalid("Use only letters, numbers, hyphens and underscores, starting and ending with a letter or number.")
	}
	if IsReserved(a) {
		return "", invalid("That alias is reserved. Please choose another.")
	}
	return a, nil
}

func Email(raw string) (string, error) {
	e := strings.TrimSpace(raw)
	if e == "" {
		return "", invalid("Enter your email address.")
	}
	if len(e) > 254 {
		return "", invalid("That email address is too long.")
	}
	addr, err := mail.ParseAddress(e)
	if err != nil || addr.Address != e || !strings.Contains(e, "@") {
		return "", invalid("Enter a valid email address.")
	}
	return strings.ToLower(e), nil
}

func Password(pw, email string) error {
	n := utf8.RuneCountInString(pw)
	switch {
	case n < 10:
		return invalid("Use at least 10 characters.")
	case n > 128 || len(pw) > 512:
		return invalid("Use at most 128 characters.")
	case email != "" && strings.EqualFold(pw, email):
		return invalid("The password must not be the same as your email address.")
	}
	return nil
}
