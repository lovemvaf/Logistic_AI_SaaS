FROM rust:1.82-bookworm AS builder

WORKDIR /app

COPY Cargo.toml rust-toolchain.toml ./
COPY crates ./crates

RUN cargo build --release --bin smartlogi-api

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/smartlogi-api /usr/local/bin/smartlogi-api

ENV APP_ENV=production
ENV PORT=8080
EXPOSE 8080

USER 10001:10001

CMD ["smartlogi-api"]
