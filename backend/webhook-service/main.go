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
	redisClient         *redis.Client
	dbPool              *pgxpool.Pool
	processed           sync.Map
	ctx                 = context.Background()
	webhookAuthToken    string
	webhookConsumerName = "worker-" + uuid.New().String()[:8]

	urlLookupIP         = net.LookupIP
	webhookURLValidator = validateWebhookURL
	webhookDialContext  = safeDialContext
)

const (
	webhookStreamKey    = "webhook:stream"
	webhookDLQStreamKey = "webhook:dlq"
	webhookGroupName    = "webhook-workers"
)

type Webhook struct {
	Id          string    `json:"id"`
	ClientId    string    `json:"clientId"`
	TenantId    string    `json:"tenantId,omitempty"`
	Url         string    `json:"url"`
	Events      []string  `json:"events"`
	SecretToken string    `json:"secretToken,omitempty"`
	CreatedAt   time.Time `json:"createdAt,omitempty"`
	UpdatedAt   time.Time `json:"updatedAt,omitempty"`
}

type DeliveryRequest struct {
	Id             string                 `json:"id"`
	DeliveryId     string                 `json:"deliveryId,omitempty"`
	WebhookId      string                 `json:"webhookId,omitempty"`
	TenantId       string                 `json:"tenantId,omitempty"`
	Url            string                 `json:"url"`
	Event          string                 `json:"event"`
	SecretToken    string                 `json:"secretToken"`
	IdempotencyKey string                 `json:"idempotencyKey"`
	Body           map[string]interface{} `json:"body"`
}

type DeliveryStatus struct {
	Id              string     `json:"id"`
	WebhookId       string     `json:"webhook_id"`
	TenantId        string     `json:"tenant_id,omitempty"`
	Url             string     `json:"url"`
	Event           string     `json:"event"`
	Status          string     `json:"status"`
	Attempts        int        `json:"attempts"`
	MaxRetries      int        `json:"max_retries"`
	LastStatusCode  int        `json:"last_status_code"`
	LastError       string     `json:"last_error"`
	DlqReason       string     `json:"dlq_reason,omitempty"`
	IdempotencyKey  string     `json:"idempotency_key"`
	PayloadJson     []byte     `json:"-"`
	NextRetryAt     *time.Time `json:"next_retry_at,omitempty"`
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

func isBlockedPort(port string) bool {
	blocked := map[string]bool{
		"22": true, "25": true, "80": true, "110": true, "143": true, "389": true,
		"445": true, "636": true, "1433": true, "1521": true, "3000": true,
		"3306": true, "4566": true, "5432": true, "6379": true, "8081": true,
		"8090": true, "8091": true, "8092": true, "8787": true, "9092": true,
		"9200": true, "27017": true, "29092": true,
	}
	return blocked[port]
}

// safeDialContext resolves DNS at connection time, verifies EVERY returned IP is
// outside restricted ranges, and dials the exact validated IP (SSRF DNS-rebinding defense).
func safeDialContext(dialCtx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, fmt.Errorf("invalid target address: %w", err)
	}
	lowerHost := strings.ToLower(strings.TrimSpace(host))
	if lowerHost == "" ||
		lowerHost == "localhost" ||
		lowerHost == "metadata.google.internal" ||
		lowerHost == "metadata.goog" ||
		strings.HasSuffix(lowerHost, ".local") ||
		strings.HasSuffix(lowerHost, ".internal") ||
		strings.HasSuffix(lowerHost, ".localhost") {
		return nil, errors.New("SSRF blocked at dial time: restricted hostname")
	}
	if isBlockedPort(port) {
		return nil, fmt.Errorf("SSRF blocked at dial time: restricted port %s", port)
	}

	var targetIP net.IP
	if parsed := net.ParseIP(lowerHost); parsed != nil {
		if isRestrictedIP(parsed) {
			return nil, errors.New("SSRF blocked at dial time: restricted literal IP")
		}
		targetIP = parsed
	} else {
		ips, lookupErr := urlLookupIP(lowerHost)
		if lookupErr != nil || len(ips) == 0 {
			return nil, errors.New("SSRF blocked at dial time: DNS lookup failed")
		}
		for _, ip := range ips {
			if isRestrictedIP(ip) {
				return nil, errors.New("SSRF blocked at dial time: resolved to restricted IP")
			}
		}
		targetIP = ips[0]
	}

	dialer := &net.Dialer{Timeout: 10 * time.Second}
	return dialer.DialContext(dialCtx, network, net.JoinHostPort(targetIP.String(), port))
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
		if gErr := redisClient.XGroupCreateMkStream(ctx, webhookStreamKey, webhookGroupName, "0").Err(); gErr != nil && !strings.Contains(gErr.Error(), "BUSYGROUP") {
			log.Printf("WARNING: Failed to initialize Redis Stream group: %v", gErr)
		}
		log.Println("Connected to Redis (Streams enabled)")
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

	if err := dbPool.Ping(ctx); err != nil {
		log.Printf("WARNING: PostgreSQL ping failed (%v), delivery tracking disabled", err)
		dbPool.Close()
		dbPool = nil
		return
	}

	log.Println("Connected to PostgreSQL for RLS-scoped webhook & delivery tracking")
}

func runDeliveryTx(tenantID string, fn func(tx pgx.Tx) error) error {
	if tenantID != "" {
		return withTenant(ctx, tenantID, fn)
	}
	return withPlatform(ctx, fn)
}

func saveDeliveryStatus(status *DeliveryStatus) {
	if dbPool == nil {
		return
	}

	var completedAt interface{}
	if status.CompletedAt != nil {
		completedAt = *status.CompletedAt
	}
	var lastAttemptedAt interface{}
	if !status.LastAttemptedAt.IsZero() {
		lastAttemptedAt = status.LastAttemptedAt
	}
	var nextRetryAt interface{}
	if status.NextRetryAt != nil {
		nextRetryAt = *status.NextRetryAt
	}
	var payloadParam interface{}
	if len(status.PayloadJson) > 0 {
		payloadParam = string(status.PayloadJson)
	}
	var tenantParam interface{}
	if status.TenantId != "" {
		tenantParam = status.TenantId
	}

	err := runDeliveryTx(status.TenantId, func(tx pgx.Tx) error {
		_, qErr := tx.Exec(ctx, `
			INSERT INTO webhook_deliveries
			(id, webhook_id, tenant_id, url, event, status, attempts, max_retries, last_status_code, last_error, dlq_reason, idempotency_key, payload_json, next_retry_at, created_at, last_attempted_at, completed_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17)
			ON CONFLICT (id) DO UPDATE SET
				status = EXCLUDED.status,
				attempts = EXCLUDED.attempts,
				last_status_code = EXCLUDED.last_status_code,
				last_error = EXCLUDED.last_error,
				dlq_reason = COALESCE(NULLIF(EXCLUDED.dlq_reason, ''), webhook_deliveries.dlq_reason),
				next_retry_at = EXCLUDED.next_retry_at,
				last_attempted_at = EXCLUDED.last_attempted_at,
				completed_at = EXCLUDED.completed_at
		`, status.Id, status.WebhookId, tenantParam, status.Url, status.Event, status.Status,
			status.Attempts, status.MaxRetries, status.LastStatusCode, status.LastError,
			status.DlqReason, status.IdempotencyKey, payloadParam, nextRetryAt, status.CreatedAt, lastAttemptedAt, completedAt)
		return qErr
	})

	if err != nil {
		log.Printf("ERROR saving delivery status: %v", err)
	}
}

// claimIdempotency atomically reserves an idempotency key BEFORE any HTTP call.
func claimIdempotency(key string) bool {
	if key == "" {
		return true
	}

	if redisClient != nil {
		acquired, err := redisClient.SetNX(ctx, "webhook:"+key, "1", 24*time.Hour).Result()
		if err == nil {
			return acquired
		}
		log.Printf("Redis idempotency fallback to memory: %v", err)
	}

	_, loaded := processed.LoadOrStore(key, struct{}{})
	return !loaded
}

func releaseIdempotency(key string) {
	if key == "" {
		return
	}
	if redisClient != nil {
		_ = redisClient.Del(ctx, "webhook:"+key).Err()
	}
	processed.Delete(key)
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
		Transport: &http.Transport{
			DialContext:         webhookDialContext,
			TLSHandshakeTimeout: 10 * time.Second,
			DisableKeepAlives:   true,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("stopped after 5 redirects")
			}
			return webhookURLValidator(req.URL.String())
		},
	}
}

func emitDLQStream(status *DeliveryStatus, req DeliveryRequest) {
	if redisClient == nil {
		return
	}
	raw, err := json.Marshal(map[string]interface{}{
		"deliveryId": status.Id,
		"webhookId":  status.WebhookId,
		"tenantId":   status.TenantId,
		"url":        req.Url,
		"event":      req.Event,
		"reason":     status.DlqReason,
		"attempts":   status.Attempts,
	})
	if err != nil {
		return
	}
	_ = redisClient.XAdd(ctx, &redis.XAddArgs{
		Stream: webhookDLQStreamKey,
		MaxLen: 10000,
		Approx: true,
		Values: map[string]interface{}{"payload": string(raw)},
	}).Err()
}

func deliverWebhook(req DeliveryRequest) {
	deliveryId := req.DeliveryId
	if deliveryId == "" {
		deliveryId = generateId()
	}
	webhookId := req.WebhookId
	if webhookId == "" {
		webhookId = req.Id
	}
	if webhookId == "" {
		webhookId = deliveryId
	}

	if !claimIdempotency(req.IdempotencyKey) {
		log.Printf("Skipping duplicate webhook for key %s", req.IdempotencyKey)
		return
	}

	payload, err := json.Marshal(req.Body)
	if err != nil {
		log.Printf("ERROR marshalling payload: %v", err)
		now := time.Now().UTC()
		saveDeliveryStatus(&DeliveryStatus{
			Id:          deliveryId,
			WebhookId:   webhookId,
			TenantId:    req.TenantId,
			Url:         req.Url,
			Event:       req.Event,
			Status:      "DLQ",
			DlqReason:   fmt.Sprintf("marshal error: %v", err),
			LastError:   fmt.Sprintf("marshal error: %v", err),
			CreatedAt:   now,
			CompletedAt: &now,
		})
		return
	}

	status := &DeliveryStatus{
		Id:             deliveryId,
		WebhookId:      webhookId,
		TenantId:       req.TenantId,
		Url:            req.Url,
		Event:          req.Event,
		Status:         "QUEUED",
		Attempts:       0,
		MaxRetries:     5,
		IdempotencyKey: req.IdempotencyKey,
		PayloadJson:    payload,
		CreatedAt:      time.Now().UTC(),
	}

	if err := webhookURLValidator(req.Url); err != nil {
		now := time.Now().UTC()
		status.Status = "DLQ"
		status.LastError = err.Error()
		status.DlqReason = "SSRF/URL policy blocked: " + err.Error()
		status.CompletedAt = &now
		saveDeliveryStatus(status)
		emitDLQStream(status, req)
		log.Printf("Blocked unsafe webhook target %s: %v", req.Url, err)
		return
	}

	status.Status = "DELIVERING"
	saveDeliveryStatus(status)

	client := newSafeHTTPClient()

	maxRetries := 5
	for i := 1; i <= maxRetries; i++ {
		httpReq, _ := http.NewRequest("POST", req.Url, bytes.NewBuffer(payload))
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("X-Webhook-Event", req.Event)
		httpReq.Header.Set("X-Webhook-Delivery-Id", deliveryId)
		httpReq.Header.Set("X-SLG-Delivery-Id", deliveryId)

		if req.IdempotencyKey != "" {
			httpReq.Header.Set("Idempotency-Key", req.IdempotencyKey)
		}

		if req.SecretToken != "" {
			tsStr := fmt.Sprintf("%d", time.Now().Unix())
			// Legacy body-only HMAC for existing webhook consumers
			mac := hmac.New(sha256.New, []byte(req.SecretToken))
			mac.Write(payload)
			signature := hex.EncodeToString(mac.Sum(nil))
			httpReq.Header.Set("X-Webhook-Signature", signature)
			httpReq.Header.Set("X-Webhook-Timestamp", tsStr)

			// Versioned replay-resistant signature: ts.deliveryId.body
			slgMac := hmac.New(sha256.New, []byte(req.SecretToken))
			slgMac.Write([]byte(tsStr + "." + deliveryId + "." + string(payload)))
			httpReq.Header.Set("X-SLG-Timestamp", tsStr)
			httpReq.Header.Set("X-SLG-Signature", "sha256="+hex.EncodeToString(slgMac.Sum(nil)))
		}

		resp, err := client.Do(httpReq)
		status.Attempts = i
		status.LastAttemptedAt = time.Now().UTC()

		if err == nil && resp.StatusCode >= 200 && resp.StatusCode < 300 {
			resp.Body.Close()
			log.Printf("Webhook %s delivered to %s (status %d)", deliveryId, req.Url, resp.StatusCode)

			status.Status = "DELIVERED"
			status.LastStatusCode = resp.StatusCode
			status.NextRetryAt = nil
			now := time.Now().UTC()
			status.CompletedAt = &now
			saveDeliveryStatus(status)
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

		if i < maxRetries {
			wait := jitter(time.Duration(math.Pow(2, float64(i))) * time.Second)
			nextAt := time.Now().UTC().Add(wait)
			status.Status = "RETRYING"
			status.NextRetryAt = &nextAt
			saveDeliveryStatus(status)
			log.Printf("Webhook %s attempt %d/%d failed (%s), retrying in %v", deliveryId, i, maxRetries, statusStr, wait)
			time.Sleep(wait)
		} else {
			saveDeliveryStatus(status)
		}
	}

	log.Printf("Webhook %s moved to DLQ after %d attempts", deliveryId, maxRetries)
	status.Status = "DLQ"
	status.DlqReason = status.LastError
	status.NextRetryAt = nil
	now := time.Now().UTC()
	status.CompletedAt = &now
	saveDeliveryStatus(status)
	emitDLQStream(status, req)
}

func enqueueWebhook(req DeliveryRequest) {
	if req.DeliveryId == "" {
		req.DeliveryId = generateId()
	}
	if req.Id == "" {
		req.Id = req.DeliveryId
	}
	webhookId := req.WebhookId
	if webhookId == "" {
		webhookId = req.Id
	}

	payload, _ := json.Marshal(req.Body)
	saveDeliveryStatus(&DeliveryStatus{
		Id:             req.DeliveryId,
		WebhookId:      webhookId,
		TenantId:       req.TenantId,
		Url:            req.Url,
		Event:          req.Event,
		Status:         "QUEUED",
		Attempts:       0,
		MaxRetries:     5,
		IdempotencyKey: req.IdempotencyKey,
		PayloadJson:    payload,
		CreatedAt:      time.Now().UTC(),
	})

	if redisClient != nil {
		data, _ := json.Marshal(req)
		err := redisClient.XAdd(ctx, &redis.XAddArgs{
			Stream: webhookStreamKey,
			MaxLen: 50000,
			Approx: true,
			Values: map[string]interface{}{"payload": string(data)},
		}).Err()
		if err != nil {
			log.Printf("Redis Stream queue error, falling back to direct delivery: %v", err)
			go deliverWebhook(req)
			return
		}
		log.Printf("Webhook %s queued in Redis Stream", req.DeliveryId)
	} else {
		go deliverWebhook(req)
	}
}

func handleStreamMessages(msgs []redis.XMessage) {
	for _, msg := range msgs {
		rawPayload, ok := msg.Values["payload"].(string)
		if !ok {
			_ = redisClient.XAck(ctx, webhookStreamKey, webhookGroupName, msg.ID).Err()
			continue
		}
		var req DeliveryRequest
		if err := json.Unmarshal([]byte(rawPayload), &req); err != nil {
			log.Printf("ERROR unmarshalling queued stream webhook %s: %v", msg.ID, err)
			_ = redisClient.XAck(ctx, webhookStreamKey, webhookGroupName, msg.ID).Err()
			continue
		}
		deliverWebhook(req)
		_ = redisClient.XAck(ctx, webhookStreamKey, webhookGroupName, msg.ID).Err()
	}
}

func reclaimStaleStreamMessages() {
	if redisClient == nil {
		return
	}
	pending, err := redisClient.XPendingExt(ctx, &redis.XPendingExtArgs{
		Stream: webhookStreamKey,
		Group:  webhookGroupName,
		Start:  "-",
		End:    "+",
		Count:  10,
	}).Result()
	if err != nil || len(pending) == 0 {
		return
	}
	var ids []string
	for _, p := range pending {
		if p.Idle >= 60*time.Second {
			ids = append(ids, p.ID)
		}
	}
	if len(ids) == 0 {
		return
	}
	claimed, err := redisClient.XClaim(ctx, &redis.XClaimArgs{
		Stream:   webhookStreamKey,
		Group:    webhookGroupName,
		Consumer: webhookConsumerName,
		MinIdle:  60 * time.Second,
		Messages: ids,
	}).Result()
	if err == nil && len(claimed) > 0 {
		handleStreamMessages(claimed)
	}
}

func processQueue() {
	if redisClient == nil {
		return
	}

	lastReclaim := time.Now()
	for {
		if time.Since(lastReclaim) >= 30*time.Second {
			reclaimStaleStreamMessages()
			lastReclaim = time.Now()
		}

		streams, err := redisClient.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    webhookGroupName,
			Consumer: webhookConsumerName,
			Streams:  []string{webhookStreamKey, ">"},
			Count:    10,
			Block:    5 * time.Second,
		}).Result()
		if err != nil {
			if err != redis.Nil && !errors.Is(err, context.DeadlineExceeded) {
				log.Printf("Redis XReadGroup error: %v", err)
				time.Sleep(1 * time.Second)
			}
			continue
		}

		for _, s := range streams {
			handleStreamMessages(s.Messages)
		}
	}
}

func resolveRequestTenant(r *http.Request) string {
	if t := strings.TrimSpace(r.Header.Get("X-Tenant-Id")); t != "" {
		return t
	}
	return strings.TrimSpace(r.URL.Query().Get("tenantId"))
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

		if req.TenantId == "" {
			req.TenantId = resolveRequestTenant(r)
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
		if req.DeliveryId == "" {
			req.DeliveryId = req.Id
		}

		enqueueWebhook(req)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":         true,
			"message":    "Webhook queued for delivery",
			"deliveryId": req.DeliveryId,
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

		tenantID := resolveRequestTenant(r)
		if tenantID == "" {
			http.Error(w, "tenantId is required", http.StatusBadRequest)
			return
		}

		var status DeliveryStatus
		err := withTenant(ctx, tenantID, func(tx pgx.Tx) error {
			return tx.QueryRow(ctx, `
				SELECT id, webhook_id, COALESCE(tenant_id, ''), url, event, status, attempts, max_retries,
					   COALESCE(last_status_code, 0), COALESCE(last_error, ''),
					   COALESCE(dlq_reason, ''), COALESCE(idempotency_key, ''),
					   next_retry_at, created_at, COALESCE(last_attempted_at, created_at), completed_at
				FROM webhook_deliveries WHERE id = $1
			`, deliveryId).Scan(
				&status.Id, &status.WebhookId, &status.TenantId, &status.Url, &status.Event,
				&status.Status, &status.Attempts, &status.MaxRetries,
				&status.LastStatusCode, &status.LastError,
				&status.DlqReason, &status.IdempotencyKey,
				&status.NextRetryAt, &status.CreatedAt, &status.LastAttemptedAt, &status.CompletedAt,
			)
		})

		if err != nil {
			http.Error(w, "Delivery not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(status)
	})

	mux.HandleFunc("/deliveries", func(w http.ResponseWriter, r *http.Request) {
		if !constantTimeBearerMatch(r.Header.Get("Authorization"), webhookAuthToken) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		tenantID := resolveRequestTenant(r)
		if tenantID == "" {
			http.Error(w, "tenantId is required", http.StatusBadRequest)
			return
		}
		if dbPool == nil {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode([]DeliveryStatus{})
			return
		}
		filterStatus := strings.TrimSpace(r.URL.Query().Get("status"))
		var list []DeliveryStatus
		err := withTenant(ctx, tenantID, func(tx pgx.Tx) error {
			rows, err := tx.Query(ctx, `
				SELECT id, webhook_id, COALESCE(tenant_id, ''), url, event, status, attempts, max_retries,
				       COALESCE(last_status_code, 0), COALESCE(last_error, ''), COALESCE(dlq_reason, ''),
				       COALESCE(idempotency_key, ''), next_retry_at, created_at,
				       COALESCE(last_attempted_at, created_at), completed_at
				FROM webhook_deliveries
				WHERE ($1 = '' OR status = $1)
				ORDER BY created_at DESC
				LIMIT 100
			`, filterStatus)
			if err != nil {
				return err
			}
			defer rows.Close()
			for rows.Next() {
				var s DeliveryStatus
				if scanErr := rows.Scan(
					&s.Id, &s.WebhookId, &s.TenantId, &s.Url, &s.Event, &s.Status,
					&s.Attempts, &s.MaxRetries, &s.LastStatusCode, &s.LastError,
					&s.DlqReason, &s.IdempotencyKey, &s.NextRetryAt, &s.CreatedAt,
					&s.LastAttemptedAt, &s.CompletedAt,
				); scanErr == nil {
					list = append(list, s)
				}
			}
			return rows.Err()
		})
		if err != nil {
			http.Error(w, "DB query failed", http.StatusInternalServerError)
			return
		}
		if list == nil {
			list = []DeliveryStatus{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(list)
	})

	mux.HandleFunc("/deliveries/", func(w http.ResponseWriter, r *http.Request) {
		if !constantTimeBearerMatch(r.Header.Get("Authorization"), webhookAuthToken) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if r.Method != http.MethodPost || !strings.HasSuffix(r.URL.Path, "/redrive") {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/deliveries/"), "/redrive")
		if id == "" || strings.Contains(id, "/") {
			http.Error(w, "Invalid delivery ID", http.StatusBadRequest)
			return
		}
		tenantID := resolveRequestTenant(r)
		if tenantID == "" {
			http.Error(w, "tenantId is required", http.StatusBadRequest)
			return
		}
		if dbPool == nil {
			http.Error(w, "DB not available", http.StatusServiceUnavailable)
			return
		}

		var targetUrl, event, idemKey, webhookId string
		var payloadBytes []byte
		err := withTenant(ctx, tenantID, func(tx pgx.Tx) error {
			return tx.QueryRow(ctx, `
				SELECT webhook_id, url, event, COALESCE(idempotency_key, ''), COALESCE(payload_json, '{}'::jsonb)
				FROM webhook_deliveries
				WHERE id = $1
			`, id).Scan(&webhookId, &targetUrl, &event, &idemKey, &payloadBytes)
		})
		if err != nil {
			http.Error(w, "Delivery not found", http.StatusNotFound)
			return
		}

		var bodyMap map[string]interface{}
		_ = json.Unmarshal(payloadBytes, &bodyMap)
		if bodyMap == nil {
			bodyMap = map[string]interface{}{}
		}

		releaseIdempotency(idemKey)
		_ = withTenant(ctx, tenantID, func(tx pgx.Tx) error {
			_, uErr := tx.Exec(ctx, `
				UPDATE webhook_deliveries
				SET status = 'QUEUED', attempts = 0, dlq_reason = NULL, last_error = NULL, completed_at = NULL, next_retry_at = NULL
				WHERE id = $1
			`, id)
			return uErr
		})

		enqueueWebhook(DeliveryRequest{
			Id:             id,
			DeliveryId:     id,
			WebhookId:      webhookId,
			TenantId:       tenantID,
			Url:            targetUrl,
			Event:          event,
			IdempotencyKey: idemKey,
			Body:           bodyMap,
		})

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":         true,
			"deliveryId": id,
			"status":     "QUEUED",
		})
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
			tenantID := resolveRequestTenant(r)
			if tenantID == "" {
				http.Error(w, "tenantId is required", http.StatusBadRequest)
				return
			}
			clientFilter := strings.TrimSpace(r.URL.Query().Get("clientId"))
			var list []Webhook
			err := withTenant(ctx, tenantID, func(tx pgx.Tx) error {
				rows, err := tx.Query(ctx, `
					SELECT id, client_id, url, events, COALESCE(secret_token, ''), created_at, updated_at
					FROM client_webhooks
					WHERE deleted_at IS NULL
					  AND ($1 = '' OR client_id = $1)
				`, clientFilter)
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
					wb.TenantId = tenantID
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
			if list == nil {
				list = []Webhook{}
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
