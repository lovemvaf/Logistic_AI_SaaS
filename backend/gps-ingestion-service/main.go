package main

import (
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
	"net"
	"net/http"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"sync"
	"time"

	pgx "github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	tenantCacheMu sync.RWMutex
	tenantCache   = map[string]string{}

	replayMu    sync.Mutex
	replayCache = map[string]int64{}

	sosCooldownMu sync.Mutex
	sosCooldown   = map[string]time.Time{}
)

const (
	udpReplayWindowSeconds = 300
	udpReplayMaxEntries    = 10000
	sosCooldownWindow      = 5 * time.Minute
)

var schemaRegex = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

func isValidSchemaName(name string) bool {
	return schemaRegex.MatchString(name)
}

func isValidGPSPoint(pt GPSPoint) bool {
	if math.IsNaN(pt.Lat) || math.IsInf(pt.Lat, 0) || pt.Lat < -90 || pt.Lat > 90 {
		return false
	}
	if math.IsNaN(pt.Lng) || math.IsInf(pt.Lng, 0) || pt.Lng < -180 || pt.Lng > 180 {
		return false
	}
	if math.IsNaN(pt.Speed) || math.IsInf(pt.Speed, 0) || pt.Speed < 0 || pt.Speed > 150 {
		return false
	}
	return pt.DriverID != ""
}

func constantTimeBearerMatch(authHeader, expectedToken string) bool {
	expected := "Bearer " + expectedToken
	return subtle.ConstantTimeCompare([]byte(authHeader), []byte(expected)) == 1
}

type SignedUDPPacket struct {
	Point     *GPSPoint `json:"point,omitempty"`
	Timestamp int64     `json:"ts,omitempty"`
	Nonce     string    `json:"nonce,omitempty"`
	Signature string    `json:"signature,omitempty"`
}

func computeUDPSignature(secret string, ts int64, nonce string, pt GPSPoint) string {
	canonical := fmt.Sprintf("%d:%s:%s:%.6f:%.6f", ts, nonce, pt.DriverID, pt.Lat, pt.Lng)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

func verifyUDPPacket(data []byte, now time.Time) (GPSPoint, error) {
	var pkt SignedUDPPacket
	if err := json.Unmarshal(data, &pkt); err == nil && pkt.Point != nil {
		if pkt.Signature == "" || pkt.Nonce == "" || pkt.Timestamp == 0 {
			return GPSPoint{}, errors.New("missing UDP HMAC metadata")
		}
		nowUnix := now.Unix()
		diff := nowUnix - pkt.Timestamp
		if diff < 0 {
			diff = -diff
		}
		if diff > udpReplayWindowSeconds {
			return GPSPoint{}, errors.New("UDP packet timestamp outside replay window")
		}

		expectedSig := computeUDPSignature(gpsAuthToken, pkt.Timestamp, pkt.Nonce, *pkt.Point)
		providedBytes, decErr := hex.DecodeString(pkt.Signature)
		expectedBytes, _ := hex.DecodeString(expectedSig)
		if decErr != nil || !hmac.Equal(providedBytes, expectedBytes) {
			return GPSPoint{}, errors.New("invalid UDP HMAC signature")
		}

		replayKey := fmt.Sprintf("%s:%s", pkt.Point.DriverID, pkt.Nonce)
		replayMu.Lock()
		for k, exp := range replayCache {
			if exp < nowUnix || len(replayCache) >= udpReplayMaxEntries {
				delete(replayCache, k)
			}
		}
		if _, seen := replayCache[replayKey]; seen {
			replayMu.Unlock()
			return GPSPoint{}, errors.New("replayed UDP packet")
		}
		replayCache[replayKey] = nowUnix + udpReplayWindowSeconds
		replayMu.Unlock()

		return *pkt.Point, nil
	}

	if os.Getenv("GPS_UDP_ALLOW_LEGACY_UNAUTHENTICATED") == "true" {
		var pt GPSPoint
		if err := json.Unmarshal(data, &pt); err != nil {
			return GPSPoint{}, err
		}
		return pt, nil
	}

	return GPSPoint{}, errors.New("unauthenticated UDP packet rejected")
}

// tenantForDriver resolves tenant_id for driverID using an isolated RLS-bypass lookup.
func tenantForDriver(ctx context.Context, driverID string) (string, error) {
	tenantCacheMu.RLock()
	cached, ok := tenantCache[driverID]
	tenantCacheMu.RUnlock()
	if ok {
		return cached, nil
	}

	tx, err := dbPool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT set_config('app.bypass_rls', 'on', true)`); err != nil {
		return "", err
	}

	var tenantID string
	if err := tx.QueryRow(ctx,
		`SELECT tenant_id::text FROM `+schemaName+`.drivers WHERE id = $1`,
		driverID,
	).Scan(&tenantID); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}

	tenantCacheMu.Lock()
	tenantCache[driverID] = tenantID
	tenantCacheMu.Unlock()
	return tenantID, nil
}

// withTenant runs fn inside a transaction with GUC `app.tenant_id` set.
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

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func generateUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

type GPSPoint struct {
	DriverID        string    `json:"driver_id"`
	TripID          string    `json:"trip_id"`
	Lat             float64   `json:"lat"`
	Lng             float64   `json:"lng"`
	Speed           float64   `json:"speed"`
	Heading         float64   `json:"heading"`
	IsOfflineCached bool      `json:"is_offline_cached"`
	Timestamp       time.Time `json:"timestamp"`
}

type BatchRequest struct {
	Points []GPSPoint `json:"points"`
}

var dbPool *pgxpool.Pool
var schemaName string
var gpsAuthToken string

func initDB() {
	schemaName = os.Getenv("DB_SCHEMA")
	if schemaName == "" {
		schemaName = "public"
	}
	if !isValidSchemaName(schemaName) {
		log.Fatalf("Invalid DB_SCHEMA %q: must match ^[a-zA-Z_][a-zA-Z0-9_]*$", schemaName)
	}

	gpsAuthToken = os.Getenv("GPS_AUTH_TOKEN")
	if gpsAuthToken == "" {
		log.Fatal("GPS_AUTH_TOKEN environment variable is required. Set a strong auth token for production.")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	var err error
	dbPool, err = pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	log.Println("Connected to PostgreSQL for GPS ingestion")
}

func setupRoutes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/gps", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "gps-ingestion"})
	})
	mux.HandleFunc("/gps/batch", handleGPSBatch)
	return mux
}

func main() {
	initDB()
	defer dbPool.Close()

	go startUDPServer()

	mux := setupRoutes()
	log.Println("GPS Ingestion HTTP Service running on :8090")
	log.Fatal(http.ListenAndServe(":8090", mux))
}

func getUDPPort() int {
	port := 8091
	if envPort := os.Getenv("UDP_PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil {
			port = p
		}
	}
	return port
}

func startUDPServer() {
	port := getUDPPort()
	addr := net.UDPAddr{Port: port, IP: net.ParseIP("0.0.0.0")}
	conn, err := net.ListenUDP("udp", &addr)
	if err != nil {
		log.Fatalf("Failed to start UDP server: %v", err)
	}
	log.Printf("GPS Ingestion UDP Service running on :%d", port)

	workerCount := runtime.NumCPU()
	packetChan := make(chan []byte, 4096)
	for i := 0; i < workerCount; i++ {
		go func() {
			for data := range packetChan {
				processUDPPacket(data)
			}
		}()
	}

	buffer := make([]byte, 4096)
	for {
		n, _, err := conn.ReadFromUDP(buffer)
		if err != nil {
			log.Printf("Error reading UDP: %v\n", err)
			continue
		}
		data := make([]byte, n)
		copy(data, buffer[:n])
		packetChan <- data
	}
}

func processUDPPacket(data []byte) {
	pt, err := verifyUDPPacket(data, time.Now().UTC())
	if err != nil {
		return
	}
	if !isValidGPSPoint(pt) {
		return
	}
	ts := pt.Timestamp
	if ts.IsZero() {
		ts = time.Now().UTC()
	}

	ctx := context.Background()
	tenantID, err := tenantForDriver(ctx, pt.DriverID)
	if err != nil {
		log.Printf("Cannot resolve tenant for driver %s: %v\n", pt.DriverID, err)
		return
	}

	err = withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO `+schemaName+`.gps_tracking_logs
			(id, driver_id, trip_id, lat, lng, speed, heading, is_offline_cached, timestamp)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`, generateUUID(), pt.DriverID, nullIfEmpty(pt.TripID), pt.Lat, pt.Lng, pt.Speed, pt.Heading, pt.IsOfflineCached, ts); err != nil {
			return err
		}

		_, err := tx.Exec(ctx, `
			UPDATE `+schemaName+`.drivers
			SET last_known_location = ST_SetSRID(ST_MakePoint($1, $2), 4326),
				location_updated_at = $4
			WHERE id = $3
			  AND (location_updated_at IS NULL OR location_updated_at <= $4)
		`, pt.Lng, pt.Lat, pt.DriverID, ts)
		return err
	})
	if err != nil {
		return
	}

	go checkGeofence(context.Background(), pt.DriverID, pt.TripID, pt.Lng, pt.Lat, tenantID)
}

func shouldEmitSosAlert(driverId, fenceName string, now time.Time) bool {
	key := driverId + ":" + fenceName
	sosCooldownMu.Lock()
	defer sosCooldownMu.Unlock()
	if last, ok := sosCooldown[key]; ok && now.Sub(last) < sosCooldownWindow {
		return false
	}
	sosCooldown[key] = now
	return true
}

func checkGeofence(ctx context.Context, driverId string, tripId string, lng, lat float64, tenantID string) {
	var fenceName, zoneType string
	err := withTenant(ctx, tenantID, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			SELECT name, zone_type FROM `+schemaName+`.geofences
			WHERE is_active = true
			  AND ST_Contains(polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326)) = true
			LIMIT 1
		`, lng, lat).Scan(&fenceName, &zoneType); err != nil {
			return err
		}

		if zoneType != "RESTRICTED" {
			return nil
		}
		if !shouldEmitSosAlert(driverId, fenceName, time.Now().UTC()) {
			return nil
		}

		msg := "GEOFENCE BREACH: Entered Restricted Zone - " + fenceName
		_, err := tx.Exec(ctx, `
			INSERT INTO `+schemaName+`.sos_alerts (id, driver_id, trip_id, message, status, created_at, updated_at)
			SELECT $1, $2, $3, $4, 'OPEN', NOW(), NOW()
			WHERE NOT EXISTS (
				SELECT 1 FROM `+schemaName+`.sos_alerts
				WHERE driver_id = $2
				  AND status = 'OPEN'
				  AND message = $4
				  AND created_at >= NOW() - INTERVAL '5 minutes'
			)
		`, generateUUID(), driverId, nullIfEmpty(tripId), msg)
		return err
	})
	if err != nil {
		return
	}
	log.Printf("Driver %s entered Geofence [%s]: %s\n", driverId, zoneType, fenceName)
}

func handleGPSBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	authHeader := r.Header.Get("Authorization")
	if !constantTimeBearerMatch(authHeader, gpsAuthToken) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var body BatchRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(body.Points) == 0 {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "received": 0})
		return
	}

	ctx := context.Background()
	byDriver := map[string][]GPSPoint{}
	var driverOrder []string
	for _, pt := range body.Points {
		if !isValidGPSPoint(pt) {
			continue
		}
		if _, seen := byDriver[pt.DriverID]; !seen {
			driverOrder = append(driverOrder, pt.DriverID)
		}
		byDriver[pt.DriverID] = append(byDriver[pt.DriverID], pt)
	}

	received := 0
	for _, driverID := range driverOrder {
		points := byDriver[driverID]
		tenantID, err := tenantForDriver(ctx, driverID)
		if err != nil {
			log.Printf("Cannot resolve tenant for driver %s: %v\n", driverID, err)
			continue
		}

		latestPt := points[0]
		err = withTenant(ctx, tenantID, func(tx pgx.Tx) error {
			for _, pt := range points {
				ts := pt.Timestamp
				if ts.IsZero() {
					ts = time.Now().UTC()
				}
				if ts.After(latestPt.Timestamp) || latestPt.Timestamp.IsZero() {
					latestPt = pt
					latestPt.Timestamp = ts
				}
				if _, err := tx.Exec(ctx, `
					INSERT INTO `+schemaName+`.gps_tracking_logs
					(id, driver_id, trip_id, lat, lng, speed, heading, is_offline_cached, timestamp)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				`, generateUUID(), pt.DriverID, nullIfEmpty(pt.TripID), pt.Lat, pt.Lng, pt.Speed, pt.Heading, pt.IsOfflineCached, ts); err != nil {
					return err
				}
			}

			latestTs := latestPt.Timestamp
			if latestTs.IsZero() {
				latestTs = time.Now().UTC()
			}
			_, err := tx.Exec(ctx, `
				UPDATE `+schemaName+`.drivers
				SET last_known_location = ST_SetSRID(ST_MakePoint($1, $2), 4326),
					location_updated_at = $4
				WHERE id = $3
				  AND (location_updated_at IS NULL OR location_updated_at <= $4)
			`, latestPt.Lng, latestPt.Lat, driverID, latestTs)
			return err
		})
		if err != nil {
			log.Printf("Error inserting GPS batch for driver %s: %v\n", driverID, err)
			continue
		}
		received += len(points)

		for _, pt := range points {
			p := pt
			go checkGeofence(context.Background(), driverID, p.TripID, p.Lng, p.Lat, tenantID)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":       true,
		"received": received,
	})
}
