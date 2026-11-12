package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type Link struct {
	ID          string
	Code        string
	Destination string
	Clicks      int64
	CreatedAt   time.Time
}

const linkColumns = `id::text, code, destination, click_count, created_at`

func scanLink(row pgx.Row) (Link, error) {
	var l Link
	err := row.Scan(&l.ID, &l.Code, &l.Destination, &l.Clicks, &l.CreatedAt)
	return l, err
}

func (s *Store) CreateLink(ctx context.Context, code, destination string, o Owner) (Link, error) {
	col, id, err := o.column()
	if err != nil {
		return Link{}, err
	}
	q := fmt.Sprintf(`INSERT INTO links (code, destination, %s) VALUES ($1, $2, $3::text::uuid) RETURNING %s`,
		col, linkColumns)
	l, err := scanLink(s.pool.QueryRow(ctx, q, code, destination, id))
	if isUniqueViolation(err) {
		return Link{}, ErrConflict
	}
	return l, err
}

func (s *Store) CountLinks(ctx context.Context, o Owner) (int64, error) {
	col, id, err := o.column()
	if err != nil {
		return 0, err
	}
	var n int64
	q := fmt.Sprintf(`SELECT count(*) FROM links WHERE %s = $1::text::uuid AND deleted_at IS NULL`, col)
	err = s.pool.QueryRow(ctx, q, id).Scan(&n)
	return n, err
}

type ListParams struct {
	Query  string
	Filter string
	Sort   string
	Limit  int
	Offset int
}

func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

func (s *Store) ListLinks(ctx context.Context, o Owner, p ListParams) ([]Link, int64, error) {
	col, id, err := o.column()
	if err != nil {
		return nil, 0, err
	}
	args := []any{id}
	where := []string{col + ` = $1::text::uuid`, `deleted_at IS NULL`}
	if p.Query != "" {
		args = append(args, "%"+escapeLike(p.Query)+"%")
		where = append(where, fmt.Sprintf(`(code ILIKE $%d OR destination ILIKE $%d)`, len(args), len(args)))
	}
	switch p.Filter {
	case "clicked":
		where = append(where, `click_count > 0`)
	case "unclicked":
		where = append(where, `click_count = 0`)
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM links WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	order := `created_at DESC, id`
	switch p.Sort {
	case "oldest":
		order = `created_at ASC, id`
	case "clicks":
		order = `click_count DESC, created_at DESC, id`
	}
	args = append(args, p.Limit, p.Offset)
	q := fmt.Sprintf(`SELECT %s FROM links WHERE %s ORDER BY %s LIMIT $%d OFFSET $%d`,
		linkColumns, whereSQL, order, len(args)-1, len(args))

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	links := make([]Link, 0, p.Limit)
	for rows.Next() {
		l, err := scanLink(rows)
		if err != nil {
			return nil, 0, err
		}
		links = append(links, l)
	}
	return links, total, rows.Err()
}

func (s *Store) GetLink(ctx context.Context, o Owner, linkID string) (Link, error) {
	col, id, err := o.column()
	if err != nil {
		return Link{}, ErrNotFound
	}
	q := fmt.Sprintf(`SELECT %s FROM links WHERE id = $1::text::uuid AND %s = $2::text::uuid AND deleted_at IS NULL`,
		linkColumns, col)
	l, err := scanLink(s.pool.QueryRow(ctx, q, linkID, id))
	return l, notFoundIfNoRows(err)
}

func (s *Store) DeleteLink(ctx context.Context, o Owner, linkID string) error {
	col, id, err := o.column()
	if err != nil {
		return ErrNotFound
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	q := fmt.Sprintf(`UPDATE links
		   SET deleted_at = now(), updated_at = now(), destination = '', click_count = 0
		 WHERE id = $1::text::uuid AND %s = $2::text::uuid AND deleted_at IS NULL
		 RETURNING id::text`, col)
	var deleted string
	if err := tx.QueryRow(ctx, q, linkID, id).Scan(&deleted); err != nil {
		return notFoundIfNoRows(err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM clicks WHERE link_id = $1::text::uuid`, deleted); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type ResolveStatus int

const (
	Found ResolveStatus = iota
	NotFound
	Gone
)

func (s *Store) Resolve(ctx context.Context, code string, record bool, referrerHost *string) (string, ResolveStatus, error) {
	var dest string
	var err error
	if record {
		err = s.pool.QueryRow(ctx,
			`WITH hit AS (
			     UPDATE links SET click_count = click_count + 1
			      WHERE code = $1 AND deleted_at IS NULL
			  RETURNING id, destination
			 ), ins AS (
			     INSERT INTO clicks (link_id, referrer_host)
			     SELECT id, $2::text FROM hit
			 )
			 SELECT destination FROM hit`, code, referrerHost).Scan(&dest)
	} else {
		err = s.pool.QueryRow(ctx,
			`SELECT destination FROM links WHERE code = $1 AND deleted_at IS NULL`, code).Scan(&dest)
	}
	if err == nil {
		return dest, Found, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", NotFound, err
	}
	var gone bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM links WHERE code = $1 AND deleted_at IS NOT NULL)`, code).Scan(&gone); err != nil {
		return "", NotFound, err
	}
	if gone {
		return "", Gone, nil
	}
	return "", NotFound, nil
}
