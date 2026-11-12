package store

import (
	"context"
	"fmt"
)

type DayCount struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

type HostCount struct {
	Host  string `json:"host"`
	Count int64  `json:"count"`
}

type TopLink struct {
	ID          string `json:"id"`
	Code        string `json:"code"`
	Destination string `json:"destination"`
	Clicks      int64  `json:"clicks"`
}

type Window struct {
	Total      int64       `json:"total"`
	Series     []DayCount  `json:"series"`
	Referrer   []HostCount `json:"referrers"`
	NoReferrer int64       `json:"no_referrer"`
}

type Summary struct {
	TotalLinks  int64     `json:"total_links"`
	ActiveLinks int64     `json:"active_links"`
	TotalClicks int64     `json:"total_clicks"`
	TopLinks    []TopLink `json:"top_links"`
	Window
}

const windowStart = `(current_date - ($2::int - 1) * interval '1 day')`

func (s *Store) window(ctx context.Context, clickFilter, id string, days int) (Window, error) {
	w := Window{Series: []DayCount{}, Referrer: []HostCount{}}

	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		SELECT to_char(d, 'YYYY-MM-DD'), count(c.id)
		  FROM generate_series(current_date::timestamp - ($2::int - 1) * interval '1 day',
		                       current_date::timestamp, interval '1 day') AS d
		  LEFT JOIN clicks c ON %s AND c.clicked_at >= d AND c.clicked_at < d + interval '1 day'
		 GROUP BY d ORDER BY d`, clickFilter), id, days)
	if err != nil {
		return w, err
	}
	for rows.Next() {
		var dc DayCount
		if err := rows.Scan(&dc.Date, &dc.Count); err != nil {
			rows.Close()
			return w, err
		}
		w.Total += dc.Count
		w.Series = append(w.Series, dc)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return w, err
	}

	rows, err = s.pool.Query(ctx, fmt.Sprintf(`
		SELECT c.referrer_host, count(*)
		  FROM clicks c
		 WHERE %s AND c.clicked_at >= %s AND c.referrer_host IS NOT NULL
		 GROUP BY c.referrer_host
		 ORDER BY 2 DESC, 1
		 LIMIT 10`, clickFilter, windowStart), id, days)
	if err != nil {
		return w, err
	}
	for rows.Next() {
		var hc HostCount
		if err := rows.Scan(&hc.Host, &hc.Count); err != nil {
			rows.Close()
			return w, err
		}
		w.Referrer = append(w.Referrer, hc)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return w, err
	}

	err = s.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT count(*) FROM clicks c
		 WHERE %s AND c.clicked_at >= %s AND c.referrer_host IS NULL`, clickFilter, windowStart),
		id, days).Scan(&w.NoReferrer)
	return w, err
}

func (s *Store) LinkAnalytics(ctx context.Context, o Owner, linkID string, days int) (Link, Window, error) {
	l, err := s.GetLink(ctx, o, linkID)
	if err != nil {
		return Link{}, Window{}, err
	}
	w, err := s.window(ctx, `c.link_id = $1::text::uuid`, l.ID, days)
	return l, w, err
}

func (s *Store) OwnerSummary(ctx context.Context, o Owner, days int) (Summary, error) {
	sum := Summary{TopLinks: []TopLink{}}
	col, id, err := o.column()
	if err != nil {
		return sum, err
	}

	err = s.pool.QueryRow(ctx, fmt.Sprintf(
		`SELECT count(*), COALESCE(sum(click_count), 0)::bigint
		   FROM links WHERE %s = $1::text::uuid AND deleted_at IS NULL`, col), id).
		Scan(&sum.TotalLinks, &sum.TotalClicks)
	if err != nil {
		return sum, err
	}

	err = s.pool.QueryRow(ctx, fmt.Sprintf(
		`SELECT count(DISTINCT c.link_id)
		   FROM clicks c JOIN links l ON l.id = c.link_id
		  WHERE l.%s = $1::text::uuid AND l.deleted_at IS NULL
		    AND c.clicked_at >= now() - interval '30 days'`, col), id).Scan(&sum.ActiveLinks)
	if err != nil {
		return sum, err
	}

	filter := fmt.Sprintf(`c.link_id IN (SELECT l.id FROM links l WHERE l.%s = $1::text::uuid AND l.deleted_at IS NULL)`, col)
	if sum.Window, err = s.window(ctx, filter, id, days); err != nil {
		return sum, err
	}

	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		SELECT l.id::text, l.code, l.destination, count(c.id) AS n
		  FROM links l JOIN clicks c ON c.link_id = l.id
		 WHERE l.%s = $1::text::uuid AND l.deleted_at IS NULL AND c.clicked_at >= %s
		 GROUP BY l.id ORDER BY n DESC, l.code LIMIT 5`, col, windowStart), id, days)
	if err != nil {
		return sum, err
	}
	defer rows.Close()
	for rows.Next() {
		var t TopLink
		if err := rows.Scan(&t.ID, &t.Code, &t.Destination, &t.Clicks); err != nil {
			return sum, err
		}
		sum.TopLinks = append(sum.TopLinks, t)
	}
	return sum, rows.Err()
}
