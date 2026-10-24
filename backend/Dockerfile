# syntax=docker/dockerfile:1

# Build stage. The SQLite driver is github.com/glebarez/sqlite (modernc.org),
# which is pure Go, so the build needs no C toolchain and CGO stays off.
FROM golang:1.27-alpine AS builder

ARG VERSION=dev
# Optional module mirror. The defaults are the public Go endpoints; pass
# another GOPROXY at build time when those endpoints are unreachable.
ARG GOPROXY=https://proxy.golang.org,direct
ARG GOSUMDB=sum.golang.org
ENV GOPROXY=${GOPROXY} \
    GOSUMDB=${GOSUMDB}

WORKDIR /src

# Dependencies first so the layer is reused when only the source changes.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
      -trimpath \
      -ldflags "-s -w -X main.version=${VERSION}" \
      -o /out/server ./cmd/server

# Runtime stage.
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata wget sqlite \
 && addgroup -g 10001 -S journal \
 && adduser -u 10001 -S -G journal journal

# The data directory holds the SQLite database, the uploaded originals and the
# derived assets. It is a volume in the compose file so nothing lives only
# inside a disposable container.
RUN mkdir -p /data && chown -R journal:journal /data
VOLUME ["/data"]

WORKDIR /app
COPY --from=builder /out/server /app/server

USER journal

# The listening address and where the data lives. The uploads and the
# derived images are placed beside the database, so they need no name of
# their own.
ENV WJ_ADDR=":8080" \
    WJ_DATA_DIR="/data" \
    WJ_VERSION="1.0.0"

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 -O /dev/null http://127.0.0.1:8080/api/health || exit 1

ENTRYPOINT ["/app/server"]
