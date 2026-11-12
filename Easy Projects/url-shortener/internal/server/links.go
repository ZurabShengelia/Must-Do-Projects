package server

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"url-shortener/internal/shortcode"
	"url-shortener/internal/store"
	"url-shortener/internal/validate"
)

const maxLinksPerOwner = 500

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type linkDTO struct {
	ID          string    `json:"id"`
	Code        string    `json:"code"`
	ShortURL    string    `json:"short_url"`
	Destination string    `json:"destination"`
	Clicks      int64     `json:"clicks"`
	CreatedAt   time.Time `json:"created_at"`
}

func (s *Server) toDTO(l store.Link) linkDTO {
	return linkDTO{
		ID:          l.ID,
		Code:        l.Code,
		ShortURL:    s.cfg.BaseURL + "/" + l.Code,
		Destination: l.Destination,
		Clicks:      l.Clicks,
		CreatedAt:   l.CreatedAt,
	}
}

func (s *Server) internalError(w http.ResponseWriter, r *http.Request, err error) {
	s.log.Error("request failed", "method", r.Method, "path", r.URL.Path, "error", err)
	writeError(w, http.StatusInternalServerError, "internal_error", "Something went wrong on our side. Please try again.", nil)
}

func (s *Server) createLink(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL   string `json:"url"`
		Alias string `json:"alias"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	dest, err := validate.URL(req.URL, s.cfg.BaseHost)
	if err != nil {
		writeFieldError(w, http.StatusUnprocessableEntity, "invalid_url", "url", err.Error())
		return
	}
	alias := ""
	if strings.TrimSpace(req.Alias) != "" {
		if alias, err = validate.Alias(req.Alias); err != nil {
			writeFieldError(w, http.StatusUnprocessableEntity, "invalid_alias", "alias", err.Error())
			return
		}
	}

	id, err := s.identify(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if id, err = s.ensureOwner(w, r, id); err != nil {
		s.internalError(w, r, err)
		return
	}

	n, err := s.store.CountLinks(r.Context(), id.owner())
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if n >= maxLinksPerOwner {
		writeError(w, http.StatusForbidden, "link_limit_reached",
			"You have reached the limit of "+strconv.Itoa(maxLinksPerOwner)+" links. Delete some links to create new ones.", nil)
		return
	}

	var link store.Link
	if alias != "" {
		link, err = s.store.CreateLink(r.Context(), alias, dest, id.owner())
		if errors.Is(err, store.ErrConflict) {
			writeFieldError(w, http.StatusConflict, "alias_taken", "alias", "That alias is already taken. Please choose another.")
			return
		}
	} else {
		for attempt := 0; attempt < 6; attempt++ {
			var code string
			if code, err = shortcode.Generate(shortcode.DefaultLength); err != nil {
				break
			}
			link, err = s.store.CreateLink(r.Context(), code, dest, id.owner())
			if !errors.Is(err, store.ErrConflict) {
				break
			}
		}
		if errors.Is(err, store.ErrConflict) {
			err = errors.New("could not generate a unique short code")
		}
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeData(w, http.StatusCreated, s.toDTO(link))
}

func (s *Server) listLinks(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	p := store.ListParams{
		Query:  strings.TrimSpace(q.Get("q")),
		Filter: q.Get("filter"),
		Sort:   q.Get("sort"),
		Limit:  20,
	}
	if len(p.Query) > 100 {
		writeFieldError(w, http.StatusBadRequest, "invalid_query", "q", "The search text is too long.")
		return
	}
	switch p.Filter {
	case "", "all", "clicked", "unclicked":
	default:
		writeFieldError(w, http.StatusBadRequest, "invalid_query", "filter", "Unknown filter.")
		return
	}
	switch p.Sort {
	case "", "newest", "oldest", "clicks":
	default:
		writeFieldError(w, http.StatusBadRequest, "invalid_query", "sort", "Unknown sort order.")
		return
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100 {
			writeFieldError(w, http.StatusBadRequest, "invalid_query", "limit", "limit must be between 1 and 100.")
			return
		}
		p.Limit = n
	}
	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 || n > 1_000_000 {
			writeFieldError(w, http.StatusBadRequest, "invalid_query", "offset", "offset must be zero or greater.")
			return
		}
		p.Offset = n
	}

	id, err := s.identify(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	items := []linkDTO{}
	var total int64
	if id.known() {
		links, t, err := s.store.ListLinks(r.Context(), id.owner(), p)
		if err != nil {
			s.internalError(w, r, err)
			return
		}
		total = t
		for _, l := range links {
			items = append(items, s.toDTO(l))
		}
	}
	writeList(w, items, map[string]int64{"total": total, "limit": int64(p.Limit), "offset": int64(p.Offset)})
}

func (s *Server) ownedLinkID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := chi.URLParam(r, "id")
	if !uuidRe.MatchString(id) {
		writeError(w, http.StatusNotFound, "not_found", "Link not found.", nil)
		return "", false
	}
	return strings.ToLower(id), true
}

func (s *Server) linkNotFound(w http.ResponseWriter) {
	writeError(w, http.StatusNotFound, "not_found", "Link not found.", nil)
}

func (s *Server) getLink(w http.ResponseWriter, r *http.Request) {
	linkID, ok := s.ownedLinkID(w, r)
	if !ok {
		return
	}
	id, err := s.identify(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if !id.known() {
		s.linkNotFound(w)
		return
	}
	l, err := s.store.GetLink(r.Context(), id.owner(), linkID)
	if errors.Is(err, store.ErrNotFound) {
		s.linkNotFound(w)
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeData(w, http.StatusOK, s.toDTO(l))
}

func (s *Server) deleteLink(w http.ResponseWriter, r *http.Request) {
	linkID, ok := s.ownedLinkID(w, r)
	if !ok {
		return
	}
	id, err := s.identify(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if !id.known() {
		s.linkNotFound(w)
		return
	}
	err = s.store.DeleteLink(r.Context(), id.owner(), linkID)
	if errors.Is(err, store.ErrNotFound) {
		s.linkNotFound(w)
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseDays(w http.ResponseWriter, r *http.Request) (int, bool) {
	v := r.URL.Query().Get("days")
	if v == "" {
		return 30, true
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 || n > 365 {
		writeFieldError(w, http.StatusBadRequest, "invalid_query", "days", "days must be between 1 and 365.")
		return 0, false
	}
	return n, true
}

type linkAnalyticsDTO struct {
	Link linkDTO `json:"link"`
	Days int     `json:"days"`
	store.Window
}

func (s *Server) linkAnalytics(w http.ResponseWriter, r *http.Request) {
	linkID, ok := s.ownedLinkID(w, r)
	if !ok {
		return
	}
	days, ok := parseDays(w, r)
	if !ok {
		return
	}
	id, err := s.identify(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if !id.known() {
		s.linkNotFound(w)
		return
	}
	l, win, err := s.store.LinkAnalytics(r.Context(), id.owner(), linkID, days)
	if errors.Is(err, store.ErrNotFound) {
		s.linkNotFound(w)
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeData(w, http.StatusOK, linkAnalyticsDTO{Link: s.toDTO(l), Days: days, Window: win})
}

type summaryDTO struct {
	Days int `json:"days"`
	store.Summary
}

func (s *Server) analyticsSummary(w http.ResponseWriter, r *http.Request) {
	days, ok := parseDays(w, r)
	if !ok {
		return
	}
	id, err := s.identify(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if !id.known() {
		writeData(w, http.StatusOK, summaryDTO{Days: days, Summary: emptySummary(days)})
		return
	}
	sum, err := s.store.OwnerSummary(r.Context(), id.owner(), days)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeData(w, http.StatusOK, summaryDTO{Days: days, Summary: sum})
}

func emptySummary(days int) store.Summary {
	series := make([]store.DayCount, 0, days)
	today := time.Now().UTC()
	for i := days - 1; i >= 0; i-- {
		series = append(series, store.DayCount{Date: today.AddDate(0, 0, -i).Format("2006-01-02")})
	}
	return store.Summary{
		TopLinks: []store.TopLink{},
		Window:   store.Window{Series: series, Referrer: []store.HostCount{}},
	}
}
