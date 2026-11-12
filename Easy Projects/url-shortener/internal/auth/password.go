package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"sync"

	"golang.org/x/crypto/argon2"
)

const (
	argonTime    = 2
	argonMemory  = 19 * 1024
	argonThreads = 1
	argonKeyLen  = 32
	saltLen      = 16
	maxMemory    = 256 * 1024
)

var sem = make(chan struct{}, 8)

var ErrInvalidHash = errors.New("auth: invalid password hash format")

func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: reading salt: %w", err)
	}
	sem <- struct{}{}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	<-sem

	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

func VerifyPassword(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, ErrInvalidHash
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, ErrInvalidHash
	}
	var memory, iterations uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &threads); err != nil {
		return false, ErrInvalidHash
	}
	if memory == 0 || memory > maxMemory || iterations == 0 || iterations > 10 || threads == 0 {
		return false, ErrInvalidHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) == 0 {
		return false, ErrInvalidHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return false, ErrInvalidHash
	}

	sem <- struct{}{}
	got := argon2.IDKey([]byte(password), salt, iterations, memory, threads, uint32(len(want)))
	<-sem
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

var (
	dummyOnce sync.Once
	dummyHash string
)

func DummyVerify(password string) {
	dummyOnce.Do(func() {
		dummyHash, _ = HashPassword("dummy-password-for-timing")
	})
	_, _ = VerifyPassword(password, dummyHash)
}
