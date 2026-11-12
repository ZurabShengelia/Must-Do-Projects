package server

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
)

const maxBodyBytes = 8 << 10

type apiError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

type envelope struct {
	Data  any       `json:"data,omitempty"`
	Meta  any       `json:"meta,omitempty"`
	Error *apiError `json:"error,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeData(w http.ResponseWriter, status int, data any) {
	writeJSON(w, status, envelope{Data: data})
}

func writeList(w http.ResponseWriter, data any, meta any) {
	writeJSON(w, http.StatusOK, envelope{Data: data, Meta: meta})
}

func writeError(w http.ResponseWriter, status int, code, message string, fields map[string]string) {
	writeJSON(w, status, envelope{Error: &apiError{Code: code, Message: message, Fields: fields}})
}

func writeFieldError(w http.ResponseWriter, status int, code, field, message string) {
	writeError(w, status, code, message, map[string]string{field: message})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mt != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Send the request body as application/json.", nil)
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "The request body is too large.", nil)
			return false
		}
		writeError(w, http.StatusBadRequest, "invalid_json", "The request body is not valid JSON.", nil)
		return false
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "The request body is too large.", nil)
			return false
		}
		writeError(w, http.StatusBadRequest, "invalid_json", "The request body must contain a single JSON object.", nil)
		return false
	}
	return true
}
