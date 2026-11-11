# SmartLogi AI SaaS — Comprehensive Enterprise UML Architecture Documentation

This directory contains the complete, production-grade PlantUML source specifications and rendered high-resolution architecture diagrams for the **SmartLogi AI SaaS Platform** (Multi-tenant Cloud Logistics, WMS Engine, TMS Dispatch, Google OR-Tools AI VRP, Go GPS Ingestion, Kong API Gateway).

---

## 🗺️ Master Diagram Index (21 Architectural Diagrams)

| # | Diagram Name | File | Type | Architectural Focus |
|---|--------------|------|------|---------------------|
| 1 | **C4 Container Diagram** | [`UML_container-diagram.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_container-diagram.png) | C4 Level 2 | Multi-tier vertical container architecture: Next.js Portals, Kong Gateway, 6 Domain Microservices, Multi-Tenant Postgres, Kafka/Redis, Hardware Scales/PDAs |
| 2 | **Microservices & Event Mesh** | [`UML_microservices-architecture.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_microservices-architecture.png) | Component | Kong Ingress routing, decoupled domain services (IAM, WMS, TMS, Orders, AI, GPS), Kafka event streaming topics & Redis caching |
| 3 | **AI VRP Engine Components** | [`UML_ai-vrp-engine-components.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_ai-vrp-engine-components.png) | Component | FastAPI AI internal pipeline: Distance Matrix calculator, Google OR-Tools Routing Model, Capacity & Time Window dimensions, Continuous Feedback Loop |
| 4 | **Entity Relationship Diagram (ERD)** | [`UML_entity-relationship-diagram.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_entity-relationship-diagram.png) | Class / ERD | 25+ core Prisma entities across 4 bounded contexts: Multi-Tenancy & IAM, WMS Warehouse & Inventory, Order Fulfillment, TMS Fleet & Trips |
| 5 | **Kubernetes Deployment Topology** | [`UML_deployment-diagram.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_deployment-diagram.png) | Deployment | K8s `smartlogi-prod` cluster: Kong Ingress Pods, Stateless Microservice Deployments, Kafka Cluster, Redis Sentinel, Cloud Managed PostgreSQL |
| 6 | **Overall System Use Case** | [`UML_usecase-overall.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_usecase-overall.png) | Use Case | 5 human actors (SuperAdmin, Dispatcher, Warehouse Staff, Driver, Customer) + AI VRP Engine interacting across core logistics domains |
| 7 | **Frontend Client Architecture** | [`UML_frontend-architecture.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_frontend-architecture.png) | Component | Next.js 14 App Router, Dispatch Control Tower (Leaflet), Granular RBAC `<Can>` wrapper, Hardware hooks (`useWebSerialScale`, `useBarcodeScanner`) |
| 8 | **Sequence: Order to Delivery Flow** | [`UML_seq-order-to-delivery.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_seq-order-to-delivery.png) | Sequence | End-to-end fulfillment: Order creation, WMS wave allocation, electronic scale pack station, TMS dispatching, AI VRP route solving, Driver handover |
| 9 | **Sequence: Real-Time GPS Tracking** | [`UML_seq-realtime-gps-tracking.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_seq-realtime-gps-tracking.png) | Sequence | Driver Mobile App telemetry stream, Go high-throughput GPS ingestion (:8080), Kafka publish, Geofencing check, WebSocket live tower update |
| 10 | **Sequence: AI VRP Route Optimization** | [`UML_seq-ai-vrp-optimization.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_seq-ai-vrp-optimization.png) | Sequence | Dispatcher route optimization request, OSRM NxN distance matrix computation, Google OR-Tools metaheuristics, multi-vehicle stop sequencing |
| 11 | **Sequence: WMS FIFO/FEFO Picking** | [`UML_seq-wms-fifo-picking.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_seq-wms-fifo-picking.png) | Sequence | Automated FIFO/FEFO stock allocation, PDA laser barcode verification at Bin, RS-232 Electronic Scale tolerance check, waybill print |
| 12 | **State Machine: Order & Trip Lifecycle** | [`UML_state-order-trip-lifecycle.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_state-order-trip-lifecycle.png) | State Machine | Dual state machine: Order (`CREATED` → `ALLOCATED` → `PICKED` → `PACKED` → `DISPATCHED` → `DELIVERED`); Trip (`DRAFT` → `ASSIGNED` → `IN_TRANSIT` → `COMPLETED`) |
| 13 | **State Machine: Inventory Movement** | [`UML_state-inventory-movement.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_state-inventory-movement.png) | State Machine | `INBOUND_RECEIVING` → `QUARANTINE` → `PUTAWAY_PENDING` → `AVAILABLE_IN_BIN` → `RESERVED` → `PICKED_STAGED` → `OUTBOUND_SHIPPED` |
| 14 | **Activity: Warehouse Fulfillment Flow** | [`UML_activity-wms-fulfillment-pipeline.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_activity-wms-fulfillment-pipeline.png) | Activity / Flow | Advance Shipping Notice arrival → Quality Inspection → ABC Putaway → Wave Picking → Electronic Scale Check → Manifest Truck Loading |
| 15 | **Warehouse Hardware & IoT Integration** | [`UML_component-hardware-iot-integration.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_component-hardware-iot-integration.png) | Component | Web Serial API bridge for RS-232 Electronic Scales, HID Keystroke Interceptor for PDA Laser Scanners, PackStation weight tolerance |
| 16 | **Sequence: RMA Customer Return Flow** | [`UML_seq-rma-return-inspection.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_seq-rma-return-inspection.png) | Sequence | Customer RMA filing, receiving dock inspection, condition grading (Resalable A/B vs Scrap C), restocking & automatic refund |
| 17 | **Sequence: Driver COD Remittance & Expenses** | [`UML_seq-cod-driver-reconciliation.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_seq-cod-driver-reconciliation.png) | Sequence | Cash-on-Delivery handover, driver fuel/toll expense submission, dispatcher reconciliation audit and clearance settlement slip |
| 18 | **Sequence: Cycle Counting & Stock Adjustment** | [`UML_seq-cycle-count-adjustment.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_seq-cycle-count-adjustment.png) | Sequence | Periodic blind cycle counting, system variance detection, warehouse manager approval threshold, stock movement audit trail |
| 19 | **State Machine: RMA Return Request** | [`UML_state-return-lifecycle.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_state-return-lifecycle.png) | State Machine | `REQUESTED` → `APPROVED` → `IN_TRANSIT` → `RECEIVED_AT_WH` → `INSPECTED` → `RESTOCKED` / `SCRAPPED` / `REJECTED` |
| 20 | **Multi-Tenancy Dynamic Schema Isolation** | [`UML_component-multitenancy-isolation.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_component-multitenancy-isolation.png) | Component | Kong Ingress Tenant Header Filter, Request-scoped TenantResolverMiddleware, Prisma `$extends` dynamic PostgreSQL `search_path` isolation |
| 21 | **Sequence: Driver SOS Emergency Protocol** | [`UML_seq-driver-sos-emergency.png`](file:///home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml/UML_seq-driver-sos-emergency.png) | Sequence | Driver mobile SOS panic button trigger, high-priority telemetry stream, auditory siren on Dispatch Tower, rescue protocol dispatch |

---

## 🛠️ Prerequisites & Rendering Instructions

### Dependencies
- **Java Runtime Environment**: OpenJDK 17+ (installed at `/usr/bin/java`)
- **PlantUML**: Version 2.18+ (`plantuml.jar`)
- **Layout Engine**: Smetana (pure Java Graphviz-compatible layout engine)

### Command Line Rendering
To regenerate all diagrams from `UML_Diagrams.puml`:

```bash
cd /home/ngoctan/Downloads/Logistic_AI_SaaS/docs/uml

# Render all diagrams to PNG
java -Djava.awt.headless=true -DPLANTUML_LIMIT_SIZE=16384 -jar /home/ngoctan/.antigravity-ide/extensions/jebbs.plantuml-2.18.1/plantuml.jar -P"layout=smetana" UML_Diagrams.puml

# Create UML_ prefixed copies
for f in *.png; do cp "$f" "UML_$f"; done
```

---

## 🏛️ Architectural Context & Domain Design

### 1. Multi-Tenant Architecture & Kong API Gateway
- **Tenant Isolation**: Clean separation across tenants using tenant IDs and schema routing.
- **Kong Gateway**: Centralized API Ingress terminating SSL, rate limiting, and verifying JWT claims before dispatching requests to internal NestJS microservices.
- **Granular RBAC**: Button-level `<Can permission="...">` component in frontend synchronized with backend Guards.

### 2. WMS Intelligent Engine & Hardware Integration
- **Spatial Grid Model**: Hierarchical location modeling (`Warehouse` → `Zone` → `Rack` → `Bin`).
- **Allocation Rules**: Dynamic allocation choosing between FIFO (First In First Out), FEFO (First Expired First Out), and LIFO (Last In First Out).
- **Hardware Integration**: RS-232 Electronic Scales via Web Serial API for real-time weight validation (+/- 2% tolerance) and HID Laser Barcode Scanners for bin/item validation.

### 3. AI Vehicle Routing Problem (VRP)
- **Google OR-Tools Solver**: Multi-vehicle routing optimization taking into account vehicle payload capacity, cubic volume, driver shift hours, and strict customer time windows.
- **Continuous Feedback Loop**: Actual driver travel times recorded and used to recalibrate the speed adjustment factors in the OSRM distance matrix.
