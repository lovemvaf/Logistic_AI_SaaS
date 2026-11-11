FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN GONOSUMDB=1 go mod download
COPY . .
RUN GONOSUMDB=1 GOFLAGS=-mod=mod CGO_ENABLED=0 GOOS=linux go build -o main .

FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/main .
EXPOSE 8092
CMD ["./main"]
