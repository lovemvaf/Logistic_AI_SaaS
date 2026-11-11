package main

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func TestGetUDPPort_Default(t *testing.T) {
	_ = os.Unsetenv("UDP_PORT")
	if got := getUDPPort(); got != 8091 {
		t.Fatalf("expected default port 8091, got %d", got)
	}
}

func TestGetUDPPort_Env(t *testing.T) {
	os.Setenv("UDP_PORT", "12345")
	defer os.Unsetenv("UDP_PORT")
	if got := getUDPPort(); got != 12345 {
		t.Fatalf("expected port 12345 from env, got %d", got)
	}
}

func TestGetUDPPort_Invalid(t *testing.T) {
	os.Setenv("UDP_PORT", "abc")
	defer os.Unsetenv("UDP_PORT")
	if got := getUDPPort(); got != 8091 {
		t.Fatalf("expected fallback to default 8091 on invalid env, got %d", got)
	}
}

func TestGPSPoint_Validation(t *testing.T) {
	tests := []struct {
		name  string
		lat   float64
		lng   float64
		speed float64
		valid bool
	}{
		{"valid point", 10.76, 106.66, 60, true},
		{"invalid lat too high", 91.0, 106.66, 60, false},
		{"invalid lat too low", -91.0, 106.66, 60, false},
		{"invalid lng too high", 10.76, 181.0, 60, false},
		{"invalid lng too low", 10.76, -181.0, 60, false},
		{"speed too high", 10.76, 106.66, 151, false},
		{"negative speed", 10.76, 106.66, -1, false},
		{"nan lat", math.NaN(), 106.66, 20, false},
		{"zero coordinates", 0, 0, 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pt := GPSPoint{DriverID: "drv-1", Lat: tt.lat, Lng: tt.lng, Speed: tt.speed}
			if got := isValidGPSPoint(pt); got != tt.valid {
				t.Errorf("isValidGPSPoint(%+v) = %v, want %v", pt, got, tt.valid)
			}
		})
	}
}

func TestVerifyUDPPacket_HMACAndReplay(t *testing.T) {
	gpsAuthToken = "test-udp-secret"
	_ = os.Unsetenv("GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED")

	replayMu.Lock()
	replayCache = map[string]int64{}
	replayMu.Unlock()

	now := time.Unix(1700000000, 0).UTC()
	pt := GPSPoint{DriverID: "drv-1", Lat: 10.76, Lng: 106.66, Speed: 40}
	sig := computeUDPSignature(gpsAuthToken, now.Unix(), "nonce-1", pt)

	pkt := SignedUDPPacket{
		Point:     &pt,
		Timestamp: now.Unix(),
		Nonce:     "nonce-1",
		Signature: sig,
	}
	raw, _ := json.Marshal(pkt)

	if _, err := verifyUDPPacket(raw, now); err != nil {
		t.Fatalf("expected valid signed UDP packet to pass, got %v", err)
	}
	if _, err := verifyUDPPacket(raw, now); err == nil {
		t.Fatalf("expected replayed nonce UDP packet to be rejected")
	}

	// Unauthenticated packet rejected by default
	rawLegacy, _ := json.Marshal(pt)
	if _, err := verifyUDPPacket(rawLegacy, now); err == nil {
		t.Fatalf("expected unauthenticated raw UDP packet to be rejected")
	}
}

func TestHandleGPSBatch_AuthAndSchema(t *testing.T) {
	gpsAuthToken = "batch-secret"
	mux := setupRoutes()

	body := BatchRequest{Points: []GPSPoint{}}
	raw, _ := json.Marshal(body)

	reqUnauthorized, _ := http.NewRequest("POST", "/gps/batch", bytes.NewBuffer(raw))
	wUnauthorized := httptest.NewRecorder()
	mux.ServeHTTP(wUnauthorized, reqUnauthorized)
	if wUnauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when missing bearer token, got %d", wUnauthorized.Code)
	}

	reqAuthorized, _ := http.NewRequest("POST", "/gps/batch", bytes.NewBuffer(raw))
	reqAuthorized.Header.Set("Authorization", "Bearer batch-secret")
	wAuthorized := httptest.NewRecorder()
	mux.ServeHTTP(wAuthorized, reqAuthorized)
	if wAuthorized.Code != http.StatusOK {
		t.Fatalf("expected 200 on authorized empty batch, got %d", wAuthorized.Code)
	}

	if !isValidSchemaName("tenant_alpha_1") {
		t.Fatalf("expected valid schema name")
	}
	if isValidSchemaName("tenant; DROP TABLE users;--") {
		t.Fatalf("expected SQL injection schema name to be rejected")
	}
}
