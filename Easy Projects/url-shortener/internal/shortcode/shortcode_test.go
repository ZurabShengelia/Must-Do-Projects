package shortcode

import (
	"strings"
	"testing"

	"url-shortener/internal/validate"
)

func TestGenerateLengthAndAlphabet(t *testing.T) {
	for _, n := range []int{1, 8, 20} {
		got, err := Generate(n)
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != n {
			t.Errorf("len = %d, want %d", len(got), n)
		}
		for _, c := range got {
			if !strings.ContainsRune(Alphabet, c) {
				t.Errorf("unexpected character %q in %q", c, got)
			}
		}
	}
	if _, err := Generate(0); err == nil {
		t.Error("expected an error for length 0")
	}
}

func TestGenerateIsUniqueAndValid(t *testing.T) {
	seen := make(map[string]struct{}, 5000)
	for i := 0; i < 5000; i++ {
		c, err := Generate(DefaultLength)
		if err != nil {
			t.Fatal(err)
		}
		if !validate.CodeShape(c) {
			t.Fatalf("generated code %q does not satisfy the stored code format", c)
		}
		if _, dup := seen[c]; dup {
			t.Fatalf("duplicate code %q after %d codes", c, i)
		}
		seen[c] = struct{}{}
	}
}

func TestGenerateDistribution(t *testing.T) {
	counts := map[rune]int{}
	const samples = 20000
	for i := 0; i < samples; i++ {
		c, _ := Generate(1)
		counts[rune(c[0])]++
	}
	expected := float64(samples) / float64(len(Alphabet))
	for _, r := range Alphabet {
		got := float64(counts[r])
		if got < expected*0.7 || got > expected*1.3 {
			t.Errorf("character %q appeared %v times, expected about %.0f", r, got, expected)
		}
	}
}
