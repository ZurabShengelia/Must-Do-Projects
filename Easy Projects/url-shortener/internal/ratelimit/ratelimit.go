package ratelimit

import (
	"sync"
	"time"
)

const maxKeys = 100_000

type bucket struct {
	count int
	reset time.Time
}

type Limiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string]*bucket
	now    func() time.Time
}

func New(limit int, window time.Duration) *Limiter {
	return &Limiter{limit: limit, window: window, hits: make(map[string]*bucket), now: time.Now}
}

func (l *Limiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	b, ok := l.hits[key]
	if !ok || !now.Before(b.reset) {
		if !ok && len(l.hits) >= maxKeys {
			l.sweepLocked(now)
			if len(l.hits) >= maxKeys {
				return false, l.window
			}
		}
		l.hits[key] = &bucket{count: 1, reset: now.Add(l.window)}
		return true, 0
	}
	if b.count >= l.limit {
		return false, b.reset.Sub(now)
	}
	b.count++
	return true, 0
}

func (l *Limiter) Sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweepLocked(l.now())
}

func (l *Limiter) sweepLocked(now time.Time) {
	for k, b := range l.hits {
		if !now.Before(b.reset) {
			delete(l.hits, k)
		}
	}
}
