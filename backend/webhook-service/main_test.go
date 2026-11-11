package main

import (
	"bytes"
	"context"
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

func clearProcessedMap() {
	processed.Range(func(k, _ interface{}) bool {
		processed.Delete(k)
		return true
	})
}

func setupTest() {
	deliveryWG.Wait()
	clearProcessedMap()
	redisClient = nil
	dbPool = nil
	webhookAuthToken = "test-token"
	webhookURLValidator = validateWebhookURL
	urlLookupIP = net.LookupIP
	webhookDialContext = safeDialContext
	dispatchWebhookHook = dispatchWebhook
}

func setupLocalServerTest() {
	setupTest()
	// Allow httptest loopback HTTP server ONLY inside delivery retry/HMAC tests
	webhookURLValidator = func(string) error { return nil }
	webhookDialContext = (&net.Dialer{Timeout: 5 * time.Second}).DialContext
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
	defer setupTest()

	urlLookupIP = func(host string) ([]net.IP, error) {
		return []net.IP{net.ParseIP("93.184.216.34")}, nil
	}
	var queued []DeliveryRequest
	dispatchWebhookHook = func(req DeliveryRequest) {
		queued = append(queued, req)
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
	if len(queued) != 0 {
		t.Fatalf("expected rejected SSRF request not to be enqueued, got %d", len(queued))
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
	if len(queued) != 1 || queued[0].Url != "https://webhooks.example.com/orders" {
		t.Fatalf("expected 1 queued delivery for safe URL, got %+v", queued)
	}
}

func TestDispatchWebhook_WaitGroupSynchronized(t *testing.T) {
	setupLocalServerTest()
	defer setupTest()

	var hit int
	var mu sync.Mutex
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		hit++
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	enqueueWebhook(DeliveryRequest{
		Id:    "async-wg-1",
		Url:   srv.URL,
		Event: "order.created",
		Body:  map[string]interface{}{"ok": true},
	})
	deliveryWG.Wait()

	mu.Lock()
	defer mu.Unlock()
	if hit != 1 {
		t.Fatalf("expected async delivery to complete once before WaitGroup returns, got %d", hit)
	}
}

func TestSafeDialContext_BlocksDNSRebindAndRestrictedPorts(t *testing.T) {
	setupTest()
	defer setupTest()

	// Simulate DNS rebinding: hostname resolves to loopback or cloud metadata at dial time
	urlLookupIP = func(host string) ([]net.IP, error) {
		switch host {
		case "rebind-loopback.example.com":
			return []net.IP{net.ParseIP("127.0.0.1")}, nil
		case "rebind-metadata.example.com":
			return []net.IP{net.ParseIP("169.254.169.254")}, nil
		default:
			return []net.IP{net.ParseIP("93.184.216.34")}, nil
		}
	}

	if _, err := safeDialContext(context.Background(), "tcp", "rebind-loopback.example.com:443"); err == nil {
		t.Fatalf("expected safeDialContext to reject DNS rebinding to loopback IP")
	}
	if _, err := safeDialContext(context.Background(), "tcp", "rebind-metadata.example.com:443"); err == nil {
		t.Fatalf("expected safeDialContext to reject DNS rebinding to metadata IP")
	}
	if _, err := safeDialContext(context.Background(), "tcp", "webhooks.example.com:5432"); err == nil {
		t.Fatalf("expected safeDialContext to block restricted internal DB port 5432")
	}
}

func TestDeliverWebhook_SLGReplaySignatureAndDeliveriesAuth(t *testing.T) {
	setupLocalServerTest()
	defer setupTest()

	var slgSig, slgTs, slgDeliveryId string
	secret := "slg-secret-key"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slgSig = r.Header.Get("X-SLG-Signature")
		slgTs = r.Header.Get("X-SLG-Timestamp")
		slgDeliveryId = r.Header.Get("X-SLG-Delivery-Id")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := DeliveryRequest{
		DeliveryId:  "deliv-slg-1",
		WebhookId:   "wh-1",
		Url:         srv.URL,
		Event:       "freight.booking.confirmed",
		SecretToken: secret,
		Body:        map[string]interface{}{"booking": "BK-001"},
	}
	deliverWebhook(req)

	payload, _ := json.Marshal(req.Body)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(slgTs + "." + slgDeliveryId + "." + string(payload)))
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if slgSig != expected {
		t.Fatalf("expected X-SLG-Signature %s, got %s", expected, slgSig)
	}

	// Verify /deliveries rejects missing tenantId even when authenticated
	mux := setupRoutes()
	delivReq, _ := http.NewRequest("GET", "/deliveries", nil)
	delivReq.Header.Set("Authorization", "Bearer test-token")
	wDeliv := httptest.NewRecorder()
	mux.ServeHTTP(wDeliv, delivReq)
	if wDeliv.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when tenantId missing on /deliveries, got %d", wDeliv.Code)
	}

	delivScopedReq, _ := http.NewRequest("GET", "/deliveries?tenantId=t-1", nil)
	delivScopedReq.Header.Set("Authorization", "Bearer test-token")
	wScoped := httptest.NewRecorder()
	mux.ServeHTTP(wScoped, delivScopedReq)
	if wScoped.Code != http.StatusOK {
		t.Fatalf("expected 200 on tenant-scoped /deliveries when DB pool nil, got %d", wScoped.Code)
	}
}
