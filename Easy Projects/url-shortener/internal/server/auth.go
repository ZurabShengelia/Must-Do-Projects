package server

import (
	"errors"
	"net/http"
	"strings"

	"url-shortener/internal/auth"
	"url-shortener/internal/store"
	"url-shortener/internal/validate"
)

type meDTO struct {
	Authenticated bool   `json:"authenticated"`
	Email         string `json:"email,omitempty"`
	Guest         bool   `json:"guest"`
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	id, err := s.identify(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	writeData(w, http.StatusOK, meDTO{Authenticated: id.authenticated(), Email: id.Email, Guest: id.GuestID != ""})
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, user store.User) error {
	ctx := r.Context()

	if c, err := r.Cookie(cookieSession); err == nil && c.Value != "" {
		_ = s.store.DeleteUserSession(ctx, auth.HashToken(c.Value))
	}

	token, hash, err := auth.NewToken()
	if err != nil {
		return err
	}
	if err := s.store.CreateUserSession(ctx, user.ID, hash, s.cfg.UserSessionTTL); err != nil {
		return err
	}
	s.setCookie(w, cookieSession, token, s.cfg.UserSessionTTL)

	if c, err := r.Cookie(cookieGuest); err == nil && c.Value != "" {
		guestID, err := s.store.GuestByToken(ctx, auth.HashToken(c.Value), s.cfg.GuestSessionTTL)
		if err == nil {
			if _, err := s.store.ClaimGuestLinks(ctx, guestID, user.ID); err != nil {
				return err
			}
		} else if !errors.Is(err, store.ErrNotFound) {
			return err
		}
		s.clearCookie(w, cookieGuest)
	}
	return nil
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	email, err := validate.Email(req.Email)
	if err != nil {
		writeFieldError(w, http.StatusUnprocessableEntity, "invalid_email", "email", err.Error())
		return
	}
	if err := validate.Password(req.Password, email); err != nil {
		writeFieldError(w, http.StatusUnprocessableEntity, "invalid_password", "password", err.Error())
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	user, err := s.store.CreateUser(r.Context(), email, hash)
	if errors.Is(err, store.ErrConflict) {
		writeFieldError(w, http.StatusConflict, "email_taken", "email", "An account with this email already exists.")
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if err := s.startSession(w, r, user); err != nil {
		s.internalError(w, r, err)
		return
	}
	writeData(w, http.StatusCreated, meDTO{Authenticated: true, Email: user.Email})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	invalid := func() {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Invalid email or password.", nil)
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || len(email) > 254 || req.Password == "" || len(req.Password) > 512 {
		invalid()
		return
	}

	user, err := s.store.UserByEmail(r.Context(), email)
	if errors.Is(err, store.ErrNotFound) {
		auth.DummyVerify(req.Password)
		invalid()
		return
	}
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	ok, err := auth.VerifyPassword(req.Password, user.PasswordHash)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if !ok {
		invalid()
		return
	}
	if err := s.startSession(w, r, user); err != nil {
		s.internalError(w, r, err)
		return
	}
	writeData(w, http.StatusOK, meDTO{Authenticated: true, Email: user.Email})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieSession); err == nil && c.Value != "" {
		if err := s.store.DeleteUserSession(r.Context(), auth.HashToken(c.Value)); err != nil {
			s.internalError(w, r, err)
			return
		}
	}
	s.clearCookie(w, cookieSession)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	id, err := s.identify(w, r)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if !id.authenticated() {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "Log in to change your password.", nil)
		return
	}
	user, err := s.store.UserByID(r.Context(), id.UserID)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	ok, err := auth.VerifyPassword(req.CurrentPassword, user.PasswordHash)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if !ok {
		writeFieldError(w, http.StatusUnprocessableEntity, "invalid_password", "current_password", "The current password is incorrect.")
		return
	}
	if err := validate.Password(req.NewPassword, user.Email); err != nil {
		writeFieldError(w, http.StatusUnprocessableEntity, "invalid_password", "new_password", err.Error())
		return
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		s.internalError(w, r, err)
		return
	}
	if err := s.store.UpdatePassword(r.Context(), user.ID, hash); err != nil {
		s.internalError(w, r, err)
		return
	}
	if err := s.store.DeleteOtherUserSessions(r.Context(), user.ID, id.sessionHash); err != nil {
		s.internalError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
