.PHONY: run build test check fmt vet frontend-check swagger

ENV = set -a; [ -f .env ] && . ./.env; set +a;

run:
	@$(ENV) go run ./cmd/server

build:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/url-shortener ./cmd/server

test:
	@$(ENV) go test ./... -count=1

fmt:
	gofmt -l -w .

vet:
	go vet ./...

frontend-check:
	node scripts/check-frontend.mjs

check: fmt vet frontend-check test

swagger:
	./scripts/fetch-swagger-ui.sh
