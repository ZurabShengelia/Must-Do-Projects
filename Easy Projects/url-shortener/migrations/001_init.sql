CREATE TABLE users (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text        NOT NULL UNIQUE,
    password_hash text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_normalized CHECK (email = lower(email) AND char_length(email) <= 254)
);

CREATE TABLE sessions (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash bytea       NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx    ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE guest_sessions (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash   bytea       NOT NULL UNIQUE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL
);
CREATE INDEX guest_sessions_expires_at_idx ON guest_sessions (expires_at);

CREATE TABLE links (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text        NOT NULL UNIQUE,
    destination text        NOT NULL,
    user_id     uuid        REFERENCES users (id)          ON DELETE CASCADE,
    guest_id    uuid        REFERENCES guest_sessions (id) ON DELETE CASCADE,
    click_count bigint      NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz,
    CONSTRAINT links_one_owner        CHECK ((user_id IS NOT NULL)::int + (guest_id IS NOT NULL)::int = 1),
    CONSTRAINT links_code_format      CHECK (code ~ '^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$'),
    CONSTRAINT links_destination_len  CHECK (char_length(destination) <= 2048),
    CONSTRAINT links_destination_http CHECK (deleted_at IS NOT NULL OR destination ~* '^https?://'),
    CONSTRAINT links_click_count_pos  CHECK (click_count >= 0)
);
CREATE INDEX links_user_idx  ON links (user_id,  created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX links_guest_idx ON links (guest_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE clicks (
    id            bigserial   PRIMARY KEY,
    link_id       uuid        NOT NULL REFERENCES links (id) ON DELETE CASCADE,
    clicked_at    timestamptz NOT NULL DEFAULT now(),
    referrer_host text,
    CONSTRAINT clicks_referrer_len CHECK (referrer_host IS NULL OR char_length(referrer_host) <= 253)
);
CREATE INDEX clicks_link_time_idx ON clicks (link_id, clicked_at);
