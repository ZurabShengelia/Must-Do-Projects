package shortcode

import (
	"crypto/rand"
	"fmt"
)

const Alphabet = "23456789abcdefghjkmnpqrstuvwxyz"

const DefaultLength = 8

func Generate(n int) (string, error) {
	if n <= 0 {
		return "", fmt.Errorf("shortcode: invalid length %d", n)
	}
	const limit = 256 - (256 % len(Alphabet))

	out := make([]byte, 0, n)
	buf := make([]byte, n*2)
	for len(out) < n {
		if _, err := rand.Read(buf); err != nil {
			return "", fmt.Errorf("shortcode: reading random bytes: %w", err)
		}
		for _, b := range buf {
			if int(b) >= limit {
				continue
			}
			out = append(out, Alphabet[int(b)%len(Alphabet)])
			if len(out) == n {
				break
			}
		}
	}
	return string(out), nil
}
