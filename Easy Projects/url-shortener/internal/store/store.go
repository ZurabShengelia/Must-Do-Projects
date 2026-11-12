package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound = errors.New("store: not found")
	ErrConflict = errors.New("store: conflict")
)

type Store struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("store: parsing DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 10
	cfg.ConnConfig.RuntimeParams["timezone"] = "UTC"
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "5000"

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("store: creating pool: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("store: cannot reach PostgreSQL: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func notFoundIfNoRows(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

type Owner struct {
	UserID  string
	GuestID string
}

func (o Owner) column() (col, id string, err error) {
	switch {
	case o.UserID != "":
		return "user_id", o.UserID, nil
	case o.GuestID != "":
		return "guest_id", o.GuestID, nil
	}
	return "", "", errors.New("store: owner has no identity")
}

type User struct {
	ID           string
	Email        string
	PasswordHash string
}

func (s *Store) CreateUser(ctx context.Context, email, passwordHash string) (User, error) {
	u := User{Email: email}
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id::text`,
		email, passwordHash).Scan(&u.ID)
	if isUniqueViolation(err) {
		return User{}, ErrConflict
	}
	return u, err
}

func (s *Store) UserByEmail(ctx context.Context, email string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`SELECT id::text, email, password_hash FROM users WHERE email = $1`, email).
		Scan(&u.ID, &u.Email, &u.PasswordHash)
	return u, notFoundIfNoRows(err)
}

func (s *Store) UserByID(ctx context.Context, id string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`SELECT id::text, email, password_hash FROM users WHERE id = $1::text::uuid`, id).
		Scan(&u.ID, &u.Email, &u.PasswordHash)
	return u, notFoundIfNoRows(err)
}

func (s *Store) UpdatePassword(ctx context.Context, userID, passwordHash string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1::text::uuid`,
		userID, passwordHash)
	return err
}

func (s *Store) CreateUserSession(ctx context.Context, userID string, tokenHash []byte, ttl time.Duration) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (user_id, token_hash, expires_at)
		 VALUES ($1::text::uuid, $2, now() + make_interval(secs => $3::double precision))`,
		userID, tokenHash, ttl.Seconds())
	return err
}

func (s *Store) UserBySession(ctx context.Context, tokenHash []byte) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx,
		`SELECT u.id::text, u.email
		   FROM sessions se JOIN users u ON u.id = se.user_id
		  WHERE se.token_hash = $1 AND se.expires_at > now()`, tokenHash).
		Scan(&u.ID, &u.Email)
	return u, notFoundIfNoRows(err)
}

func (s *Store) DeleteUserSession(ctx context.Context, tokenHash []byte) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, tokenHash)
	return err
}

func (s *Store) DeleteOtherUserSessions(ctx context.Context, userID string, keepHash []byte) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM sessions WHERE user_id = $1::text::uuid AND token_hash <> $2`, userID, keepHash)
	return err
}

func (s *Store) CreateGuestSession(ctx context.Context, tokenHash []byte, ttl time.Duration) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO guest_sessions (token_hash, expires_at)
		 VALUES ($1, now() + make_interval(secs => $2::double precision)) RETURNING id::text`,
		tokenHash, ttl.Seconds()).Scan(&id)
	return id, err
}

func (s *Store) GuestByToken(ctx context.Context, tokenHash []byte, ttl time.Duration) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`UPDATE guest_sessions
		    SET last_seen_at = now(), expires_at = now() + make_interval(secs => $2::double precision)
		  WHERE token_hash = $1 AND expires_at > now()
		  RETURNING id::text`, tokenHash, ttl.Seconds()).Scan(&id)
	return id, notFoundIfNoRows(err)
}

func (s *Store) ClaimGuestLinks(ctx context.Context, guestID, userID string) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx,
		`UPDATE links SET user_id = $1::text::uuid, guest_id = NULL, updated_at = now()
		  WHERE guest_id = $2::text::uuid`, userID, guestID)
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM guest_sessions WHERE id = $1::text::uuid`, guestID); err != nil {
		return 0, err
	}
	return tag.RowsAffected(), tx.Commit(ctx)
}

func (s *Store) DeleteExpired(ctx context.Context) (sessions, guests int64, err error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at < now()`)
	if err != nil {
		return 0, 0, err
	}
	sessions = tag.RowsAffected()
	tag, err = s.pool.Exec(ctx, `DELETE FROM guest_sessions WHERE expires_at < now()`)
	if err != nil {
		return sessions, 0, err
	}
	return sessions, tag.RowsAffected(), nil
}
