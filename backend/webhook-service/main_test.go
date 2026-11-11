package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func setupTest() {
	processed = sync.Map{}
	redisClient = nil
	dbPool = nil
	webhookAuthToken = "test-token"
	webhookURLValidator = validateWebhookURL
	urlLookupIP = net.LookupIP
}

func setupLocalServerTest() {
	setupTest()
	// Allow httptest loopback HTTP server ONLY inside delivery retry/HMAC tests
	webhookURLValidator = func(string) error { return nil }
}

func TestValidateWebhookURL_SSRFProtection(t *testing.T) {
	setupTest()
	urlLookupIP = func(host string) ([]net.IP, error) {
		if host == "evil-rebind.example.com" {
			return []net.IP{net.ParseIP("169.254.169.254")}, nil
		}
		return []net.IP{net.ParseIP("93.184.216.34")}, nil
	}

	blocked := []string{
		"http://example.com/hook",
		"https://localhost/hook",
		"https://127.0.0.1/hook",
		"https://169.254.169.254/latest/meta-data",
		"https://10.0.0.5/hook",
		"https://192.168.1.10/hook",
		"https://user:pass@example.com/hook",
		"https://evil-rebind.example.com/hook",
	}
	for _, u := range blocked {
		if err := validateWebhookURL(u); err == nil {
			t.Errorf("expected SSRF validator to block %q, but it allowed it", u)
		}
	}

	if err := validateWebhookURL("https://webhooks.example.com/orders"); err != nil {
		t.Errorf("expected valid public HTTPS webhook URL to pass, got %v", err)
	}
}

func TestMaskSecret(t *testing.T) {
	if got := maskSecret("whsec_abcdef123456"); got != "whsec_****3456" {
		t.Fatalf("unexpected masked secret: %q", got)
	}
	if !isMaskedSecret("whsec_****3456") || isMaskedSecret("real_secret_value") {
		t.Fatalf("isMaskedSecret returned unexpected result")
	}
}

func TestDeliverWebhook_Idempotency(t *testing.T) {
	setupLocalServerTest()
	defer setupTest()

	var requestCount int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := DeliveryRequest{
		Id:             "test-id-1",
		Url:            srv.URL,
		Event:          "test-event",
		IdempotencyKey: "test-key-123",
		Body:           map[string]interface{}{"msg": "hello"},
	}

	deliverWebhook(req)
	if requestCount != 1 {
		t.Fatalf("expected first request to be sent, got %d", requestCount)
	}

	deliverWebhook(req)
	if requestCount != 1 {
		t.Fatalf("expected duplicate request to be skipped, got %d requests total", requestCount)
	}
}

func TestDeliverWebhook_Retry(t *testing.T) {
	setupLocalServerTest()
	defer setupTest()

	var requestCount int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if requestCount == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := DeliveryRequest{
		Id:    "test-id-2",
		Url:   srv.URL,
		Event: "test-retry",
		Body:  map[string]interface{}{"msg": "retry"},
	}

	start := time.Now()
	deliverWebhook(req)
	duration := time.Since(start)

	if requestCount != 2 {
		t.Fatalf("expected 2 attempts (1 failure, 1 success), got %d", requestCount)
	}

	if duration < 2*time.Second {
		t.Fatalf("expected at least 2 seconds backoff, got %v", duration)
	}
}

func TestDeliverWebhook_HMACSignature(t *testing.T) {
	setupLocalServerTest()
	defer setupTest()

	var receivedSignature string
	secret := "my-secret-token"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedSignature = r.Header.Get("X-Webhook-Signature")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := DeliveryRequest{
		Id:          "test-id-3",
		Url:         srv.URL,
		Event:       "test-hmac",
		SecretToken: secret,
		Body:        map[string]interface{}{"msg": "hmac test"},
	}

	deliverWebhook(req)

	payload, _ := json.Marshal(req.Body)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	if receivedSignature != expectedSignature {
		t.Fatalf("expected HMAC signature %s, got %s", expectedSignature, receivedSignature)
	}
}

func TestDeliverWebhook_NoSecretNoSignature(t *testing.T) {
	setupLocalServerTest()
	defer setupTest()

	var receivedSignature string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedSignature = r.Header.Get("X-Webhook-Signature")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := DeliveryRequest{
		Id:    "test-id-4",
		Url:   srv.URL,
		Event: "test-no-secret",
		Body:  map[string]interface{}{"msg": "no secret"},
	}

	deliverWebhook(req)

	if receivedSignature != "" {
		t.Fatalf("expected no signature header, got %s", receivedSignature)
	}
}

func TestDeliverWebhook_AllRetriesFail(t *testing.T) {
	setupLocalServerTest()
	defer setupTest()

	var requestCount int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	req := DeliveryRequest{
		Id:    "test-id-5",
		Url:   srv.URL,
		Event: "test-all-fail",
		Body:  map[string]interface{}{"msg": "fail"},
	}

	deliverWebhook(req)

	if requestCount != 5 {
		t.Fatalf("expected 5 attempts, got %d", requestCount)
	}
}

func TestDeliverWebhook_EventHeader(t *testing.T) {
	setupLocalServerTest()
	defer setupTest()

	var receivedEvent string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedEvent = r.Header.Get("X-Webhook-Event")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := DeliveryRequest{
		Id:    "test-id-6",
		Url:   srv.URL,
		Event: "order.delivered",
		Body:  map[string]interface{}{"orderId": "123"},
	}

	deliverWebhook(req)

	if receivedEvent != "order.delivered" {
		t.Fatalf("expected event header 'order.delivered', got '%s'", receivedEvent)
	}
}

func TestHealthEndpoint(t *testing.T) {
	setupTest()
	mux := setupRoutes()

	req, _ := http.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestDeliverEndpoint_SSRFAndAuth(t *testing.T) {
	setupTest()
	urlLookupIP = func(host string) ([]net.IP, error) {
		return []net.IP{net.ParseIP("93.184.216.34")}, nil
	}
	mux := setupRoutes()

	ssrfBody := DeliveryRequest{
		Id:    "ssrf-test-1",
		Url:   "http://169.254.169.254/latest/meta-data",
		Event: "test",
		Body:  map[string]interface{}{"key": "value"},
	}
	ssrfBytes, _ := json.Marshal(ssrfBody)
	ssrfReq, _ := http.NewRequest("POST", "/deliver", bytes.NewBuffer(ssrfBytes))
	ssrfReq.Header.Set("Content-Type", "application/json")
	ssrfReq.Header.Set("Authorization", "Bearer test-token")
	wSsrf := httptest.NewRecorder()
	mux.ServeHTTP(wSsrf, ssrfReq)
	if wSsrf.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on SSRF URL, got %d", wSsrf.Code)
	}

	safeBody := DeliveryRequest{
		Id:    "safe-test-1",
		Url:   "https://webhooks.example.com/orders",
		Event: "order.updated",
		Body:  map[string]interface{}{"key": "value"},
	}
	safeBytes, _ := json.Marshal(safeBody)
	safeReq, _ := http.NewRequest("POST", "/deliver", bytes.NewBuffer(safeBytes))
	safeReq.Header.Set("Content-Type", "application/json")
	safeReq.Header.Set("Authorization", "Bearer test-token")
	wSafe := httptest.NewRecorder()
	mux.ServeHTTP(wSafe, safeReq)
	if wSafe.Code != http.StatusOK {
		t.Fatalf("expected 200 on safe webhook deliver request, got %d", wSafe.Code)
	}

	var resp map[string]interface{}
	_ = json.Unmarshal(wSafe.Body.Bytes(), &resp)
	if resp["ok"] != true {
		t.Fatalf("expected ok: true")
	}
}
