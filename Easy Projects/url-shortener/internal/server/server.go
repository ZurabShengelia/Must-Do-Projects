package server

import (
	"context"
	"io/fs"
	"log/slog"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"url-shortener/internal/config"
	"url-shortener/internal/ratelimit"
	"url-shortener/internal/store"
)

func init() {
	_ = mime.AddExtensionType(".woff", "font/woff")
	_ = mime.AddExtensionType(".yaml", "application/yaml")
}

type Server struct {
	cfg     config.Config
	store   *store.Store
	log     *slog.Logger
	static  fs.FS
	openapi []byte

	generalLimiter  *ratelimit.Limiter
	createLimiter   *ratelimit.Limiter
	authLimiter     *ratelimit.Limiter
	redirectLimiter *ratelimit.Limiter
}

func New(cfg config.Config, st *store.Store, log *slog.Logger, static fs.FS, openapi []byte) *Server {
	return &Server{
		cfg:             cfg,
		store:           st,
		log:             log,
		static:          static,
		openapi:         openapi,
		generalLimiter:  ratelimit.New(300, time.Minute),
		createLimiter:   ratelimit.New(30, time.Minute),
		authLimiter:     ratelimit.New(10, time.Minute),
		redirectLimiter: ratelimit.New(300, time.Minute),
	}
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(s.recoverer, s.securityHeaders, s.requestLogger, s.timeout(15*time.Second))

	r.Get("/healthz", s.health)
	r.Get("/", s.serveIndex)
	r.Get("/favicon.svg", s.serveFile("favicon.svg", "image/svg+xml"))
	r.Handle("/static/*", s.staticHandler())
	r.Get("/docs", s.docsPage)
	r.Get("/docs/openapi.yaml", s.openapiSpec)

	r.Route("/api/v1", func(api chi.Router) {
		api.Use(noStore, s.csrfGuard, s.limit(s.generalLimiter))

		api.With(s.limit(s.createLimiter)).Post("/links", s.createLink)
		api.Get("/links", s.listLinks)
		api.Get("/links/{id}", s.getLink)
		api.Delete("/links/{id}", s.deleteLink)
		api.Get("/links/{id}/analytics", s.linkAnalytics)
		api.Get("/analytics/summary", s.analyticsSummary)

		api.Get("/auth/me", s.me)
		api.With(s.limit(s.authLimiter)).Post("/auth/register", s.register)
		api.With(s.limit(s.authLimiter)).Post("/auth/login", s.login)
		api.Post("/auth/logout", s.logout)
		api.With(s.limit(s.authLimiter)).Put("/auth/password", s.changePassword)
	})

	redirect := s.limit(s.redirectLimiter)
	r.With(redirect).Get("/{code}", s.redirect)
	r.With(redirect).Head("/{code}", s.redirect)

	r.NotFound(s.notFound)
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "That method is not allowed here.", nil)
	})
	return r
}

func (s *Server) RunBackground(ctx context.Context) {
	cleanup := time.NewTicker(time.Hour)
	sweep := time.NewTicker(5 * time.Minute)
	defer cleanup.Stop()
	defer sweep.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-sweep.C:
			s.generalLimiter.Sweep()
			s.createLimiter.Sweep()
			s.authLimiter.Sweep()
			s.redirectLimiter.Sweep()
		case <-cleanup.C:
			cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
			sessions, guests, err := s.store.DeleteExpired(cctx)
			cancel()
			if err != nil {
				s.log.Error("expired session cleanup failed", "error", err)
			} else if sessions+guests > 0 {
				s.log.Info("expired sessions removed", "user_sessions", sessions, "guest_sessions", guests)
			}
		}
	}
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.store.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "database unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) serveFile(name, contentType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		b, err := fs.ReadFile(s.static, name)
		if err != nil {
			s.notFound(w, r)
			return
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(b)
	}
}

func (s *Server) serveIndex(w http.ResponseWriter, r *http.Request) {
	s.serveFile("index.html", "text/html; charset=utf-8")(w, r)
}

func (s *Server) staticHandler() http.Handler {
	files := http.StripPrefix("/static/", http.FileServer(http.FS(s.static)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/") {
			s.notFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		files.ServeHTTP(w, r)
	})
}

func (s *Server) docsPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Security-Policy", docsCSP)
	s.serveFile("docs.html", "text/html; charset=utf-8")(w, r)
}

func (s *Server) openapiSpec(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(s.openapi)
}

func (s *Server) notFound(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeError(w, http.StatusNotFound, "not_found", "That resource does not exist.", nil)
		return
	}
	s.linkStatusPage(w, http.StatusNotFound)
}

func (s *Server) linkStatusPage(w http.ResponseWriter, status int) {
	b, err := fs.ReadFile(s.static, "link-status.html")
	if err != nil {
		http.Error(w, http.StatusText(status), status)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(b)
}
