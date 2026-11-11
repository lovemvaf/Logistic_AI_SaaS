package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	pgx "github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	redisClient      *redis.Client
	dbPool           *pgxpool.Pool
	processed        sync.Map
	ctx              = context.Background()
	webhookAuthToken string

	urlLookupIP         = net.LookupIP
	webhookURLValidator = validateWebhookURL
)

type Webhook struct {
	Id          string    `json:"id"`
	ClientId    string    `json:"clientId"`
	Url         string    `json:"url"`
	Events      []string  `json:"events"`
	SecretToken string    `json:"secretToken,omitempty"`
	CreatedAt   time.Time `json:"createdAt,omitempty"`
	UpdatedAt   time.Time `json:"updatedAt,omitempty"`
}

type DeliveryRequest struct {
	Id             string                 `json:"id"`
	Url            string                 `json:"url"`
	Event          string                 `json:"event"`
	SecretToken    string                 `json:"secretToken"`
	IdempotencyKey string                 `json:"idempotencyKey"`
	Body           map[string]interface{} `json:"body"`
}

type DeliveryStatus struct {
	Id              string     `json:"id"`
	WebhookId       string     `json:"webhook_id"`
	Url             string     `json:"url"`
	Event           string     `json:"event"`
	Status          string     `json:"status"`
	Attempts        int        `json:"attempts"`
	MaxRetries      int        `json:"max_retries"`
	LastStatusCode  int        `json:"last_status_code"`
	LastError       string     `json:"last_error"`
	IdempotencyKey  string     `json:"idempotency_key"`
	CreatedAt       time.Time  `json:"created_at"`
	LastAttemptedAt time.Time  `json:"last_attempted_at"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
}

func constantTimeBearerMatch(authHeader, expectedToken string) bool {
	expected := "Bearer " + expectedToken
	return subtle.ConstantTimeCompare([]byte(authHeader), []byte(expected)) == 1
}

func maskSecret(secret string) string {
	trimmed := strings.TrimSpace(secret)
	if trimmed == "" {
		return ""
	}
	if len(trimmed) <= 4 {
		return "****"
	}
	return "whsec_****" + trimmed[len(trimmed)-4:]
}

func isMaskedSecret(secret string) bool {
	trimmed := strings.TrimSpace(secret)
	return trimmed == "" || strings.HasPrefix(trimmed, "whsec_****") || strings.HasPrefix(trimmed, "****")
}

func isRestrictedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil {
		ip = ip4
		// 0.0.0.0/8, 100.64.0.0/10 CGNAT, 192.0.0.0/24, 198.18.0.0/15, TEST-NET ranges
		if ip[0] == 0 {
			return true
		}
		if ip[0] == 100 && ip[1] >= 64 && ip[1] <= 127 {
			return true
		}
		if ip[0] == 198 && (ip[1] == 18 || ip[1] == 19) {
			return true
		}
	}
	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified()
}

func validateWebhookURL(rawURL string) error {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return errors.New("webhook url is required")
	}
	u, err := url.Parse(trimmed)
	if err != nil {
		return fmt.Errorf("invalid webhook url: %w", err)
	}
	if !strings.EqualFold(u.Scheme, "https") {
		return errors.New("webhook url must use HTTPS")
	}
	if u.User != nil {
		return errors.New("webhook url must not include embedded credentials")
	}
	host := strings.ToLower(u.Hostname())
	if host == "" ||
		host == "localhost" ||
		host == "metadata.google.internal" ||
		host == "metadata.goog" ||
		strings.HasSuffix(host, ".local") ||
		strings.HasSuffix(host, ".internal") ||
		strings.HasSuffix(host, ".localhost") {
		return errors.New("webhook host is restricted")
	}
	if ip := net.ParseIP(host); ip != nil {
		if isRestrictedIP(ip) {
			return errors.New("webhook IP is in a restricted network range")
		}
		return nil
	}
	ips, err := urlLookupIP(host)
	if err != nil || len(ips) == 0 {
		return errors.New("webhook host failed DNS resolution")
	}
	for _, ip := range ips {
		if isRestrictedIP(ip) {
			return errors.New("webhook host resolves to a restricted IP address")
		}
	}
	return nil
}

func tenantForClient(ctx context.Context, clientID string) (string, error) {
	tx, err := dbPool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT set_config('app.bypass_rls', 'on', true)`); err != nil {
		return "", err
	}

	var tenantID string
	if err := tx.QueryRow(ctx, `SELECT tenant_id::text FROM clients WHERE id = $1`, clientID).Scan(&tenantID); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return tenantID, nil
}

func tenantForWebhook(ctx context.Context, webhookID string) (string, error) {
	tx, err := dbPool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT set_config('app.bypass_rls', 'on', true)`); err != nil {
		return "", err
	}

	var tenantID string
	if err := tx.QueryRow(ctx, `SELECT tenant_id::text FROM client_webhooks WHERE id = $1`, webhookID).Scan(&tenantID); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return tenantID, nil
}

func withTenant(ctx context.Context, tenantID string, fn func(tx pgx.Tx) error) error {
	tx, err := dbPool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT set_config('app.tenant_id', $1, true)`, tenantID); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func withPlatform(ctx context.Context, fn func(tx pgx.Tx) error) error {
	tx, err := dbPool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT set_config('app.bypass_rls', 'on', true)`); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func initAuth() {
	webhookAuthToken = os.Getenv("WEBHOOK_AUTH_TOKEN")
	if webhookAuthToken == "" {
		log.Fatal("WEBHOOK_AUTH_TOKEN environment variable is required. Set a strong auth token for production.")
	}
}

func initRedis() {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisHost := os.Getenv("REDIS_HOST")
		if redisHost == "" {
			redisHost = "redis"
		}
		redisPort := os.Getenv("REDIS_PORT")
		if redisPort == "" {
			redisPort = "6379"
		}
		redisURL = fmt.Sprintf("%s:%s", redisHost, redisPort)
	}

	redisPassword := os.Getenv("REDIS_PASSWORD")

	redisClient = redis.NewClient(&redis.Options{
		Addr:     redisURL,
		Password: redisPassword,
		DB:       0,
	})

	_, err := redisClient.Ping(ctx).Result()
	if err != nil {
		log.Printf("WARNING: Redis not available (%v), falling back to in-memory storage", err)
		redisClient = nil
	} else {
		log.Println("Connected to Redis")
	}
}

func initDB() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Println("WARNING: DATABASE_URL not set, delivery status tracking disabled")
		return
	}

	var err error
	dbPool, err = pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Printf("WARNING: Cannot connect to PostgreSQL (%v), delivery tracking disabled", err)
		dbPool = nil
		return
	}

	createTableSQL := `
	CREATE TABLE IF NOT EXISTS webhook_deliveries (
		id UUID PRIMARY KEY,
		webhook_id UUID NOT NULL,
		url TEXT NOT NULL,
		event VARCHAR(100) NOT NULL,
		status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
		attempts INT NOT NULL DEFAULT 0,
		max_retries INT NOT NULL DEFAULT 5,
		last_status_code INT,
		last_error TEXT,
		idempotency_key VARCHAR(255),
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		last_attempted_at TIMESTAMPTZ,
		completed_at TIMESTAMPTZ
	);
	CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
	CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);

	CREATE TABLE IF NOT EXISTS client_webhooks (
		id TEXT PRIMARY KEY,
		client_id TEXT NOT NULL,
		tenant_id TEXT,
		url TEXT NOT NULL,
		events TEXT NOT NULL DEFAULT '[]',
		secret_token TEXT,
		is_active BOOLEAN NOT NULL DEFAULT true,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		deleted_at TIMESTAMPTZ
	);
	`

	_, err = dbPool.Exec(ctx, createTableSQL)
	if err != nil {
		log.Printf("WARNING: Cannot create webhook_deliveries table (%v)", err)
		dbPool = nil
		return
	}

	log.Println("Connected to PostgreSQL for delivery tracking")
}

func saveDeliveryStatus(status *DeliveryStatus) {
	if dbPool == nil {
		return
	}

	var completedAt interface{}
	if status.CompletedAt != nil {
		completedAt = *status.CompletedAt
	}

	_, err := dbPool.Exec(ctx, `
		INSERT INTO webhook_deliveries
		(id, webhook_id, url, event, status, attempts, max_retries, last_status_code, last_error, idempotency_key, created_at, last_attempted_at, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		ON CONFLICT (id) DO UPDATE SET
			status = EXCLUDED.status,
			attempts = EXCLUDED.attempts,
			last_status_code = EXCLUDED.last_status_code,
			last_error = EXCLUDED.last_error,
			last_attempted_at = EXCLUDED.last_attempted_at,
			completed_at = EXCLUDED.completed_at
	`, status.Id, status.WebhookId, status.Url, status.Event, status.Status,
		status.Attempts, status.MaxRetries, status.LastStatusCode, status.LastError,
		status.IdempotencyKey, status.CreatedAt, status.LastAttemptedAt, completedAt)

	if err != nil {
		log.Printf("ERROR saving delivery status: %v", err)
	}
}

func checkIdempotency(key string) bool {
	if key == "" {
		return false
	}

	if redisClient != nil {
		exists, err := redisClient.Exists(ctx, "webhook:"+key).Result()
		if err == nil && exists > 0 {
			return true
		}
	}

	_, exists := processed.Load(key)
	return exists
}

func markProcessed(key string) {
	if key == "" {
		return
	}

	if redisClient != nil {
		redisClient.Set(ctx, "webhook:"+key, "1", 24*time.Hour)
	}

	processed.Store(key, struct{}{})
}

func generateId() string {
	return uuid.New().String()
}

func jitter(duration time.Duration) time.Duration {
	maxJitter := duration / 4
	if maxJitter <= 0 {
		maxJitter = time.Second
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(maxJitter)))
	if err != nil {
		return duration
	}
	return duration + time.Duration(n.Int64())
}

func newSafeHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("stopped after 5 redirects")
			}
			return webhookURLValidator(req.URL.String())
		},
	}
}

func deliverWebhook(req DeliveryRequest) {
	deliveryId := generateId()

	if checkIdempotency(req.IdempotencyKey) {
		log.Printf("Skipping duplicate webhook for key %s", req.IdempotencyKey)
		return
	}

	status := &DeliveryStatus{
		Id:             deliveryId,
		WebhookId:      req.Id,
		Url:            req.Url,
		Event:          req.Event,
		Status:         "PENDING",
		Attempts:       0,
		MaxRetries:     5,
		IdempotencyKey: req.IdempotencyKey,
		CreatedAt:      time.Now().UTC(),
	}

	if err := webhookURLValidator(req.Url); err != nil {
		status.Status = "FAILED"
		status.LastError = err.Error()
		now := time.Now().UTC()
		status.CompletedAt = &now
		saveDeliveryStatus(status)
		log.Printf("Blocked unsafe webhook target %s: %v", req.Url, err)
		return
	}

	saveDeliveryStatus(status)

	payload, err := json.Marshal(req.Body)
	if err != nil {
		log.Printf("ERROR marshalling payload: %v", err)
		status.Status = "FAILED"
		status.LastError = fmt.Sprintf("marshal error: %v", err)
		saveDeliveryStatus(status)
		return
	}

	client := newSafeHTTPClient()

	maxRetries := 5
	for i := 1; i <= maxRetries; i++ {
		httpReq, _ := http.NewRequest("POST", req.Url, bytes.NewBuffer(payload))
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("X-Webhook-Event", req.Event)
		httpReq.Header.Set("X-Webhook-Delivery-Id", deliveryId)

		if req.IdempotencyKey != "" {
			httpReq.Header.Set("Idempotency-Key", req.IdempotencyKey)
		}

		if req.SecretToken != "" {
			mac := hmac.New(sha256.New, []byte(req.SecretToken))
			mac.Write(payload)
			signature := hex.EncodeToString(mac.Sum(nil))
			httpReq.Header.Set("X-Webhook-Signature", signature)
			httpReq.Header.Set("X-Webhook-Timestamp", fmt.Sprintf("%d", time.Now().Unix()))
		}

		resp, err := client.Do(httpReq)
		status.Attempts = i
		status.LastAttemptedAt = time.Now().UTC()

		if err == nil && resp.StatusCode >= 200 && resp.StatusCode < 300 {
			resp.Body.Close()
			log.Printf("Webhook %s delivered to %s (status %d)", deliveryId, req.Url, resp.StatusCode)

			status.Status = "DELIVERED"
			status.LastStatusCode = resp.StatusCode
			now := time.Now().UTC()
			status.CompletedAt = &now
			saveDeliveryStatus(status)

			markProcessed(req.IdempotencyKey)
			return
		}

		statusStr := "ERROR"
		if resp != nil {
			statusStr = http.StatusText(resp.StatusCode)
			status.LastStatusCode = resp.StatusCode
			resp.Body.Close()
		}

		errMsg := ""
		if err != nil {
			errMsg = err.Error()
		}
		status.LastError = fmt.Sprintf("attempt %d: %s (%s)", i, statusStr, errMsg)
		saveDeliveryStatus(status)

		if i < maxRetries {
			wait := jitter(time.Duration(math.Pow(2, float64(i))) * time.Second)
			log.Printf("Webhook %s attempt %d/%d failed (%s), retrying in %v", deliveryId, i, maxRetries, statusStr, wait)
			time.Sleep(wait)
		}
	}

	log.Printf("Webhook %s FAILED after %d attempts", deliveryId, maxRetries)
	status.Status = "FAILED"
	now := time.Now().UTC()
	status.CompletedAt = &now
	saveDeliveryStatus(status)
}

func enqueueWebhook(req DeliveryRequest) {
	if redisClient != nil {
		data, _ := json.Marshal(req)
		err := redisClient.LPush(ctx, "webhook:queue", string(data)).Err()
		if err != nil {
			log.Printf("Redis queue error, falling back to direct delivery: %v", err)
			go deliverWebhook(req)
			return
		}
		log.Printf("Webhook %s queued in Redis", req.Id)
	} else {
		go deliverWebhook(req)
	}
}

func processQueue() {
	if redisClient == nil {
		return
	}

	for {
		result, err := redisClient.BRPop(ctx, 5*time.Second, "webhook:queue").Result()
		if err != nil {
			if err != redis.Nil {
				log.Printf("Redis BRPop error: %v", err)
			}
			continue
		}

		if len(result) >= 2 {
			var req DeliveryRequest
			if err := json.Unmarshal([]byte(result[1]), &req); err != nil {
				log.Printf("ERROR unmarshalling queued webhook: %v", err)
				continue
			}
			deliverWebhook(req)
		}
	}
}

func setupRoutes() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"service": "webhook-service",
		})
	})

	mux.HandleFunc("/deliver", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if !constantTimeBearerMatch(r.Header.Get("Authorization"), webhookAuthToken) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var req DeliveryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if err := webhookURLValidator(req.Url); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if req.Event == "" {
			http.Error(w, "event is required", http.StatusBadRequest)
			return
		}

		if req.Id == "" {
			req.Id = generateId()
		}

		enqueueWebhook(req)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":         true,
			"message":    "Webhook queued for delivery",
			"deliveryId": req.Id,
		})
	})

	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		if !constantTimeBearerMatch(r.Header.Get("Authorization"), webhookAuthToken) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		deliveryId := r.URL.Query().Get("id")
		if deliveryId == "" {
			http.Error(w, "id query parameter is required", http.StatusBadRequest)
			return
		}

		if dbPool == nil {
			status := "unknown"
			if _, exists := processed.Load(deliveryId); exists {
				status = "delivered"
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{
				"id":     deliveryId,
				"status": status,
			})
			return
		}

		var status DeliveryStatus
		err := dbPool.QueryRow(ctx, `
			SELECT id, webhook_id, url, event, status, attempts, max_retries,
				   COALESCE(last_status_code, 0), COALESCE(last_error, ''),
				   COALESCE(idempotency_key, ''), created_at,
				   COALESCE(last_attempted_at, created_at), completed_at
			FROM webhook_deliveries WHERE id = $1
		`, deliveryId).Scan(
			&status.Id, &status.WebhookId, &status.Url, &status.Event,
			&status.Status, &status.Attempts, &status.MaxRetries,
			&status.LastStatusCode, &status.LastError,
			&status.IdempotencyKey, &status.CreatedAt,
			&status.LastAttemptedAt, &status.CompletedAt,
		)

		if err != nil {
			http.Error(w, "Delivery not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(status)
	})

	mux.HandleFunc("/webhooks", func(w http.ResponseWriter, r *http.Request) {
		if !constantTimeBearerMatch(r.Header.Get("Authorization"), webhookAuthToken) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		switch r.Method {
		case http.MethodGet:
			if dbPool == nil {
				http.Error(w, "DB not available", http.StatusServiceUnavailable)
				return
			}
			var list []Webhook
			err := withPlatform(ctx, func(tx pgx.Tx) error {
				rows, err := tx.Query(ctx, `SELECT id, client_id, url, events, COALESCE(secret_token, ''), created_at, updated_at FROM client_webhooks WHERE deleted_at IS NULL`)
				if err != nil {
					return err
				}
				defer rows.Close()
				for rows.Next() {
					var wb Webhook
					var events string
					var rawSecret string
					var created, updated time.Time
					if err := rows.Scan(&wb.Id, &wb.ClientId, &wb.Url, &events, &rawSecret, &created, &updated); err != nil {
						continue
					}
					_ = json.Unmarshal([]byte(events), &wb.Events)
					wb.SecretToken = maskSecret(rawSecret)
					wb.CreatedAt = created
					wb.UpdatedAt = updated
					list = append(list, wb)
				}
				return rows.Err()
			})
			if err != nil {
				http.Error(w, "DB query failed", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(list)

		case http.MethodPost:
			var wb Webhook
			if err := json.NewDecoder(r.Body).Decode(&wb); err != nil {
				http.Error(w, "Invalid JSON body", http.StatusBadRequest)
				return
			}
			if wb.ClientId == "" || wb.Url == "" {
				http.Error(w, "clientId and url are required", http.StatusBadRequest)
				return
			}
			if err := webhookURLValidator(wb.Url); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if wb.Id == "" {
				wb.Id = generateId()
			}
			if wb.SecretToken == "" {
				buf := make([]byte, 24)
				_, _ = rand.Read(buf)
				wb.SecretToken = "whsec_" + hex.EncodeToString(buf)
			}
			now := time.Now().UTC()
			eventsJSON, _ := json.Marshal(wb.Events)
			wb.CreatedAt = now
			wb.UpdatedAt = now

			if dbPool != nil {
				tenantID, terr := tenantForClient(ctx, wb.ClientId)
				if terr != nil {
					log.Printf("ERROR resolving tenant for client %s: %v", wb.ClientId, terr)
					http.Error(w, "Client not found", http.StatusNotFound)
					return
				}
				err := withTenant(ctx, tenantID, func(tx pgx.Tx) error {
					_, err := tx.Exec(ctx, `
						INSERT INTO client_webhooks (id, client_id, url, events, secret_token, created_at, updated_at, tenant_id)
						VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
					`, wb.Id, wb.ClientId, wb.Url, string(eventsJSON), wb.SecretToken, wb.CreatedAt, wb.UpdatedAt, tenantID)
					return err
				})
				if err != nil {
					log.Printf("ERROR creating webhook: %v", err)
					http.Error(w, "Failed to create webhook in database", http.StatusInternalServerError)
					return
				}
			} else {
				http.Error(w, "Database not connected, cannot persist webhook", http.StatusServiceUnavailable)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(wb)

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/webhooks/", func(w http.ResponseWriter, r *http.Request) {
		if !constantTimeBearerMatch(r.Header.Get("Authorization"), webhookAuthToken) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		id := strings.TrimPrefix(r.URL.Path, "/webhooks/")
		if id == "" || id == r.URL.Path {
			http.Error(w, "Webhook ID is required", http.StatusBadRequest)
			return
		}

		switch r.Method {
		case http.MethodGet:
			if dbPool == nil {
				http.Error(w, "DB not available", http.StatusServiceUnavailable)
				return
			}
			var wb Webhook
			var events, rawSecret string
			var created, updated time.Time
			tenantID, terr := tenantForWebhook(ctx, id)
			if terr != nil {
				http.Error(w, "Webhook not found", http.StatusNotFound)
				return
			}
			err := withTenant(ctx, tenantID, func(tx pgx.Tx) error {
				return tx.QueryRow(ctx, `SELECT id, client_id, url, events, COALESCE(secret_token, ''), created_at, updated_at FROM client_webhooks WHERE id=$1`, id).
					Scan(&wb.Id, &wb.ClientId, &wb.Url, &events, &rawSecret, &created, &updated)
			})
			if err != nil {
				http.Error(w, "Webhook not found", http.StatusNotFound)
				return
			}
			_ = json.Unmarshal([]byte(events), &wb.Events)
			wb.SecretToken = maskSecret(rawSecret)
			wb.CreatedAt = created
			wb.UpdatedAt = updated
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(wb)

		case http.MethodPut:
			var body Webhook
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "Invalid JSON body", http.StatusBadRequest)
				return
			}
			if err := webhookURLValidator(body.Url); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			now := time.Now().UTC()
			eventsJSON, _ := json.Marshal(body.Events)
			secretToStore := body.SecretToken
			if isMaskedSecret(secretToStore) {
				secretToStore = ""
			}

			if dbPool != nil {
				tenantID, terr := tenantForWebhook(ctx, id)
				if terr != nil {
					http.Error(w, "Webhook not found", http.StatusNotFound)
					return
				}
				err := withTenant(ctx, tenantID, func(tx pgx.Tx) error {
					_, err := tx.Exec(ctx, `
						UPDATE client_webhooks
						SET url = $1,
							events = $2,
							secret_token = COALESCE(NULLIF($3, ''), secret_token),
							updated_at = $4
						WHERE id = $5
					`, body.Url, string(eventsJSON), secretToStore, now, id)
					return err
				})
				if err != nil {
					http.Error(w, "Failed to update webhook in database", http.StatusInternalServerError)
					return
				}
			} else {
				http.Error(w, "Database not connected", http.StatusServiceUnavailable)
				return
			}

			body.Id = id
			body.UpdatedAt = now
			body.SecretToken = maskSecret(secretToStore)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(body)

		case http.MethodDelete:
			if dbPool != nil {
				tenantID, terr := tenantForWebhook(ctx, id)
				if terr != nil {
					http.Error(w, "Webhook not found", http.StatusNotFound)
					return
				}
				err := withTenant(ctx, tenantID, func(tx pgx.Tx) error {
					_, err := tx.Exec(ctx, `DELETE FROM client_webhooks WHERE id=$1`, id)
					return err
				})
				if err != nil {
					http.Error(w, "Failed to delete webhook from database", http.StatusInternalServerError)
					return
				}
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]bool{"deleted": true})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	return mux
}

func main() {
	initAuth()
	initRedis()
	initDB()

	go processQueue()

	mux := setupRoutes()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8092"
	}

	log.Printf("webhook-service running on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
