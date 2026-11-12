package server

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"

	"url-shortener/internal/store"
	"url-shortener/internal/validate"
)

func (s *Server) redirect(w http.ResponseWriter, r *http.Request) {
	code := strings.ToLower(chi.URLParam(r, "code"))
	if !validate.CodeShape(code) {
		s.linkStatusPage(w, http.StatusNotFound)
		return
	}

	record := r.Method == http.MethodGet
	var ref *string
	if record {
		ref = referrerHost(r, s.cfg.BaseHost)
	}

	dest, status, err := s.store.Resolve(r.Context(), code, record, ref)
	if err != nil {
		s.log.Error("resolve failed", "error", err)
		http.Error(w, "Something went wrong on our side.", http.StatusInternalServerError)
		return
	}
	switch status {
	case store.NotFound:
		s.linkStatusPage(w, http.StatusNotFound)
		return
	case store.Gone:
		s.linkStatusPage(w, http.StatusGone)
		return
	}

	u, err := url.Parse(dest)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		s.log.Error("refusing to redirect to an invalid stored destination", "code", code)
		s.linkStatusPage(w, http.StatusNotFound)
		return
	}

	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Location", u.String())
	w.WriteHeader(http.StatusFound)
}

func referrerHost(r *http.Request, ownHost string) *string {
	raw := r.Referer()
	if raw == "" || len(raw) > 2048 {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return nil
	}
	host := strings.ToLower(u.Hostname())
	if !validate.IsHostname(host) || strings.EqualFold(u.Host, ownHost) {
		return nil
	}
	return &host
}
