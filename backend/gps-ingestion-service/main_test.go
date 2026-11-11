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
		name    string
		lat     float64
		lng     float64
		speed   float64
		heading float64
		valid   bool
	}{
		{"valid point", 10.76, 106.66, 60, 180, true},
		{"invalid lat too high", 91.0, 106.66, 60, 0, false},
		{"invalid lat too low", -91.0, 106.66, 60, 0, false},
		{"invalid lng too high", 10.76, 181.0, 60, 0, false},
		{"invalid lng too low", 10.76, -181.0, 60, 0, false},
		{"speed too high", 10.76, 106.66, 151, 0, false},
		{"negative speed", 10.76, 106.66, -1, 0, false},
		{"heading out of range 360", 10.76, 106.66, 40, 360, false},
		{"negative heading", 10.76, 106.66, 40, -5, false},
		{"nan heading", 10.76, 106.66, 40, math.NaN(), false},
		{"nan lat", math.NaN(), 106.66, 20, 0, false},
		{"zero coordinates", 0, 0, 0, 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pt := GPSPoint{DriverID: "drv-1", Lat: tt.lat, Lng: tt.lng, Speed: tt.speed, Heading: tt.heading}
			if got := isValidGPSPoint(pt); got != tt.valid {
				t.Errorf("isValidGPSPoint(%+v) = %v, want %v", pt, got, tt.valid)
			}
		})
	}
}

func TestVerifyUDPPacket_HMACAndReplay(t *testing.T) {
	gpsAuthToken = "http-bearer-secret"
	gpsUdpHmacSecret = "dedicated-udp-hmac-secret"
	defer func() {
		gpsUdpHmacSecret = ""
	}()
	_ = os.Unsetenv("GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED")

	replayMu.Lock()
	replayCache = map[string]int64{}
	replayOrder = nil
	replayMu.Unlock()

	now := time.Unix(1700000000, 0).UTC()
	pt := GPSPoint{
		DriverID:        "drv-1",
		TripID:          "trip-101",
		Lat:             10.9465,
		Lng:             106.8421,
		Speed:           48.5,
		Heading:         125.0,
		IsOfflineCached: true,
	}
	sig := computeUDPSignature(gpsUdpHmacSecret, now.Unix(), "nonce-1", pt)

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

	// Signature signed with HTTP bearer token MUST fail when dedicated UDP secret is set
	wrongSecretSig := computeUDPSignature(gpsAuthToken, now.Unix(), "nonce-2", pt)
	wrongPkt := SignedUDPPacket{Point: &pt, Timestamp: now.Unix(), Nonce: "nonce-2", Signature: wrongSecretSig}
	wrongRaw, _ := json.Marshal(wrongPkt)
	if _, err := verifyUDPPacket(wrongRaw, now); err == nil {
		t.Fatalf("expected packet signed with HTTP bearer instead of UDP HMAC secret to be rejected")
	}

	// Tampering with speed, heading, trip_id, or is_offline_cached must fail signature check
	tamperCases := []struct {
		name   string
		mutate func(*GPSPoint)
	}{
		{"speed", func(p *GPSPoint) { p.Speed = 99 }},
		{"heading", func(p *GPSPoint) { p.Heading = 270 }},
		{"trip_id", func(p *GPSPoint) { p.TripID = "trip-hijack" }},
		{"is_offline_cached", func(p *GPSPoint) { p.IsOfflineCached = false }},
	}
	for _, tc := range tamperCases {
		mutated := pt
		tc.mutate(&mutated)
		tamperedPkt := SignedUDPPacket{
			Point:     &mutated,
			Timestamp: now.Unix(),
			Nonce:     "nonce-1",
			Signature: sig,
		}
		tamperedRaw, _ := json.Marshal(tamperedPkt)
		if _, err := verifyUDPPacket(tamperedRaw, now); err == nil {
			t.Fatalf("expected tampered %s UDP packet to be rejected", tc.name)
		}
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
