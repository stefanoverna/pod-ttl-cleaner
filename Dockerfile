FROM golang:1.24-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/cleanup/main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /pod-ttl-cleaner main.go

FROM alpine:3.18
COPY --from=builder /pod-ttl-cleaner /usr/local/bin/pod-ttl-cleaner
ENTRYPOINT ["/usr/local/bin/pod-ttl-cleaner"]