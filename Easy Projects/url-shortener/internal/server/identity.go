package server

import (
	"errors"
	"net/http"
	"time"

	"url-shortener/internal/auth"
	"url-shortener/internal/store"
)

const (
	cookieSession = "us_session"
	cookieGuest   = "us_guest"
)

type identity struct {
	UserID      string
	Email       string
	GuestID     string
	sessionHash []byte
}

func (i identity) authenticated() bool { return i.UserID != "" }
func (i identity) known() bool         { return i.UserID != "" || i.GuestID != "" }
func (i identity) owner() store.Owner  { return store.Owner{UserID: i.UserID, GuestID: i.GuestID} }

func (s *Server) identify(w http.ResponseWriter, r *http.Request) (identity, error) {
	ctx := r.Context()

	if c, err := r.Cookie(cookieSession); err == nil && c.Value != "" {
		hash := auth.HashToken(c.Value)
		u, err := s.store.UserBySession(ctx, hash)
		if err == nil {
			return identity{UserID: u.ID, Email: u.Email, sessionHash: hash}, nil
		}
		if !errors.Is(err, store.ErrNotFound) {
			return identity{}, err
		}
		s.clearCookie(w, cookieSession)
	}

	if c, err := r.Cookie(cookieGuest); err == nil && c.Value != "" {
		id, err := s.store.GuestByToken(ctx, auth.HashToken(c.Value), s.cfg.GuestSessionTTL)
		if err == nil {
			s.setCookie(w, cookieGuest, c.Value, s.cfg.GuestSessionTTL)
			return identity{GuestID: id}, nil
		}
		if !errors.Is(err, store.ErrNotFound) {
			return identity{}, err
		}
		s.clearCookie(w, cookieGuest)
	}
	return identity{}, nil
}

func (s *Server) ensureOwner(w http.ResponseWriter, r *http.Request, id identity) (identity, error) {
	if id.known() {
		return id, nil
	}
	token, hash, err := auth.NewToken()
	if err != nil {
		return identity{}, err
	}
	gid, err := s.store.CreateGuestSession(r.Context(), hash, s.cfg.GuestSessionTTL)
	if err != nil {
		return identity{}, err
	}
	s.setCookie(w, cookieGuest, token, s.cfg.GuestSessionTTL)
	return identity{GuestID: gid}, nil
}

func (s *Server) setCookie(w http.ResponseWriter, name, value string, ttl time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   int(ttl.Seconds()),
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

func (s *Server) clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
}
