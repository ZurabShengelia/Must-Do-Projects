package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr         string
	DatabaseURL  string
	BaseURL      string
	BaseHost     string
	CookieSecure bool
	TrustProxy   bool

	GuestSessionTTL time.Duration
	UserSessionTTL  time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		Addr:            getenv("ADDR", ":8080"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		GuestSessionTTL: 180 * 24 * time.Hour,
		UserSessionTTL:  14 * 24 * time.Hour,
	}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required (see .env.example)")
	}

	base := strings.TrimRight(getenv("BASE_URL", "http://localhost:8080"), "/")
	u, err := url.Parse(base)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.Path != "" {
		return Config{}, fmt.Errorf("BASE_URL must look like https://example.com (got %q)", base)
	}
	cfg.BaseURL = base
	cfg.BaseHost = strings.ToLower(u.Host)

	cfg.CookieSecure = u.Scheme == "https"
	if v := os.Getenv("COOKIE_SECURE"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return Config{}, fmt.Errorf("COOKIE_SECURE must be true or false: %w", err)
		}
		cfg.CookieSecure = b
	}
	if v := os.Getenv("TRUST_PROXY"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return Config{}, fmt.Errorf("TRUST_PROXY must be true or false: %w", err)
		}
		cfg.TrustProxy = b
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
