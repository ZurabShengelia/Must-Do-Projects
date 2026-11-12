package auth

import (
	"bytes"
	"strings"
	"testing"
)

func TestHashAndVerify(t *testing.T) {
	const pw = "correct horse battery staple"
	hash, err := HashPassword(pw)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Errorf("unexpected hash format: %q", hash)
	}
	if strings.Contains(hash, pw) {
		t.Error("hash contains the plaintext password")
	}

	ok, err := VerifyPassword(pw, hash)
	if err != nil || !ok {
		t.Errorf("correct password rejected: ok=%v err=%v", ok, err)
	}
	ok, err = VerifyPassword("wrong password", hash)
	if err != nil || ok {
		t.Errorf("wrong password accepted: ok=%v err=%v", ok, err)
	}

	hash2, _ := HashPassword(pw)
	if hash == hash2 {
		t.Error("two hashes of the same password are identical, so the salt is not random")
	}
}

func TestVerifyRejectsMalformedHashes(t *testing.T) {
	bad := []string{
		"", "plaintext", "$argon2id$v=19$m=19456,t=2,p=1$onlyfive",
		"$bcrypt$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA",
		"$argon2id$v=18$m=19456,t=2,p=1$c2FsdA$aGFzaA",
		"$argon2id$v=19$m=999999999,t=2,p=1$c2FsdA$aGFzaA",
		"$argon2id$v=19$m=19456,t=2,p=1$!!!$aGFzaA",
	}
	for _, h := range bad {
		if ok, err := VerifyPassword("x", h); ok || err == nil {
			t.Errorf("VerifyPassword accepted malformed hash %q (ok=%v err=%v)", h, ok, err)
		}
	}
}

func TestTokens(t *testing.T) {
	tok1, h1, err := NewToken()
	if err != nil {
		t.Fatal(err)
	}
	tok2, _, _ := NewToken()
	if tok1 == tok2 {
		t.Error("tokens must be unique")
	}
	if len(tok1) < 43 {
		t.Errorf("token too short: %d characters", len(tok1))
	}
	if !bytes.Equal(h1, HashToken(tok1)) {
		t.Error("HashToken does not reproduce the stored hash")
	}
	if bytes.Contains([]byte(tok1), h1) {
		t.Error("hash must not be embedded in the token")
	}
}
