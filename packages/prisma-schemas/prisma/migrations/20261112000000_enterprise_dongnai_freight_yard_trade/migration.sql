-- Gate G4 Enterprise Migration: Dong Nai 2026 Geography, Equipment/Container, Yard/EIR, Freight/DEM-DET/AR-AP & Trade/XNK

-- CreateTable
CREATE TABLE "administrative_units" (
    "id" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "unit_type" TEXT NOT NULL,
    "province_name" TEXT NOT NULL DEFAULT 'Thành phố Đồng Nai',
    "province_code" TEXT NOT NULL DEFAULT 'DONG_NAI_2026',
    "corridor" TEXT,
    "official_code" TEXT,
    "official_code_status" TEXT NOT NULL DEFAULT 'PENDING_OFFICIAL_CODE',
    "boundary_status" TEXT NOT NULL DEFAULT 'NO_OFFICIAL_POLYGON',
    "source_doc" TEXT NOT NULL DEFAULT 'NQ_30_2026_QH16 / NQ_1662_2025',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_aliases" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "alias_name" TEXT NOT NULL,
    "normalized_alias" TEXT NOT NULL,
    "alias_type" TEXT NOT NULL DEFAULT 'PRE_2025_NAME',
    "source_doc" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administrative_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_boundary_versions" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "version_tag" TEXT NOT NULL,
    "source_doc" TEXT NOT NULL,
    "source_url" TEXT,
    "official_code" TEXT,
    "geometry_geojson" JSONB,
    "boundary_status" TEXT NOT NULL DEFAULT 'NO_OFFICIAL_POLYGON',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administrative_boundary_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_facilities" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facility_type" TEXT NOT NULL,
    "administrative_unit_id" TEXT,
    "locality_name" TEXT NOT NULL,
    "province_code" TEXT NOT NULL DEFAULT 'DONG_NAI_2026',
    "outside_city" BOOLEAN NOT NULL DEFAULT false,
    "corridor" TEXT,
    "lat" DECIMAL(65,30),
    "lng" DECIMAL(65,30),
    "gate_count" INTEGER NOT NULL DEFAULT 4,
    "capacity_teu" INTEGER,
    "source_type" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_geofences" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "radius_meters" INTEGER NOT NULL DEFAULT 500,
    "polygon_geojson" JSONB,
    "boundary_source" TEXT NOT NULL DEFAULT 'SYNTHETIC_RADIUS_PLACEHOLDER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_corridors" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "corridor_tag" TEXT NOT NULL,
    "highway_code" TEXT NOT NULL,
    "origin_facility_id" TEXT,
    "dest_facility_id" TEXT,
    "nominal_km" DECIMAL(65,30) NOT NULL,
    "typical_minutes" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_corridors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_restrictions" (
    "id" TEXT NOT NULL,
    "corridor_id" TEXT,
    "facility_id" TEXT,
    "title" TEXT NOT NULL,
    "max_tonnage_tons" DECIMAL(65,30),
    "max_height_m" DECIMAL(65,30),
    "restricted_hours" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "road_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_queue_observations" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wait_minutes" INTEGER NOT NULL,
    "queue_length" INTEGER NOT NULL DEFAULT 0,
    "source_label" TEXT NOT NULL DEFAULT 'SYNTHETIC_DEMO',
    "is_official_telemetry" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_queue_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tractor_units" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "unit_code" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "horse_power" INTEGER NOT NULL DEFAULT 420,
    "emission_std" TEXT NOT NULL DEFAULT 'EURO5',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "current_facility_id" TEXT,
    "lat" DECIMAL(65,30),
    "lng" DECIMAL(65,30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tractor_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chassis_units" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "chassis_code" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "axle_count" INTEGER NOT NULL DEFAULT 3,
    "compatible_sizes" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "current_facility_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chassis_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_equipments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "container_no" TEXT NOT NULL,
    "size_type" TEXT NOT NULL DEFAULT '40HC',
    "iso_code" TEXT NOT NULL DEFAULT '45G1',
    "tare_weight_kg" INTEGER NOT NULL DEFAULT 3800,
    "max_payload_kg" INTEGER NOT NULL DEFAULT 26680,
    "reefer_temp_c" DECIMAL(65,30),
    "ownership_type" TEXT NOT NULL DEFAULT 'CARRIER_OWNED',
    "status" TEXT NOT NULL DEFAULT 'EMPTY_AT_DEPOT',
    "current_seal_no" TEXT,
    "last_inspected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "container_equipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "tractor_id" TEXT,
    "chassis_id" TEXT,
    "container_id" TEXT,
    "driver_id" TEXT,
    "freight_leg_id" TEXT,
    "booking_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yards" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facility_id" TEXT,
    "total_slots" INTEGER NOT NULL DEFAULT 40,
    "reefer_plugs" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yard_slots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "yard_id" TEXT NOT NULL,
    "block" TEXT NOT NULL,
    "row_no" INTEGER NOT NULL,
    "bay_no" INTEGER NOT NULL,
    "tier_no" INTEGER NOT NULL DEFAULT 1,
    "slot_code" TEXT NOT NULL,
    "is_reefer_slot" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'EMPTY',
    "container_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yard_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_gate_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "yard_id" TEXT NOT NULL,
    "yard_slot_id" TEXT,
    "container_id" TEXT NOT NULL,
    "tractor_id" TEXT,
    "chassis_id" TEXT,
    "booking_id" TEXT,
    "event_type" TEXT NOT NULL,
    "load_state" TEXT NOT NULL DEFAULT 'EMPTY',
    "seal_no" TEXT,
    "gross_weight_kg" DECIMAL(65,30),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operator_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "container_gate_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_interchange_receipts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "eir_number" TEXT NOT NULL,
    "gate_event_id" TEXT,
    "yard_id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "tractor_id" TEXT,
    "chassis_id" TEXT,
    "direction" TEXT NOT NULL,
    "load_state" TEXT NOT NULL DEFAULT 'EMPTY',
    "seal_no" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "damage_notes" TEXT,
    "driver_name" TEXT,
    "inspector_name" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_interchange_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_rates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "client_id" TEXT,
    "contract_code" TEXT NOT NULL,
    "origin_name" TEXT NOT NULL,
    "dest_name" TEXT NOT NULL,
    "corridor_tag" TEXT,
    "service_mode" TEXT NOT NULL DEFAULT 'FCL',
    "container_size" TEXT NOT NULL DEFAULT '40HC',
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "base_rate" DECIMAL(65,30) NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surcharge_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "contract_rate_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surcharge_type" TEXT NOT NULL,
    "calc_mode" TEXT NOT NULL DEFAULT 'FIXED',
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surcharge_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dem_det_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "carrier_code" TEXT NOT NULL,
    "charge_type" TEXT NOT NULL,
    "container_size" TEXT NOT NULL DEFAULT '40HC',
    "free_days" INTEGER NOT NULL DEFAULT 5,
    "exclude_weekends" BOOLEAN NOT NULL DEFAULT false,
    "exclude_holidays" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "daily_rate_tier1" DECIMAL(65,30) NOT NULL,
    "tier1_days" INTEGER NOT NULL DEFAULT 5,
    "daily_rate_tier2" DECIMAL(65,30) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dem_det_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_rfqs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "client_id" TEXT,
    "rfq_number" TEXT NOT NULL,
    "service_mode" TEXT NOT NULL DEFAULT 'FCL_EXPORT',
    "incoterm" TEXT NOT NULL DEFAULT 'FOB',
    "origin_name" TEXT NOT NULL,
    "dest_name" TEXT NOT NULL,
    "corridor_tag" TEXT,
    "container_size" TEXT,
    "container_qty" INTEGER NOT NULL DEFAULT 1,
    "cargo_desc" TEXT NOT NULL,
    "weight_kg" DECIMAL(65,30),
    "volume_cbm" DECIMAL(65,30),
    "required_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freight_rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_quotes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "rfq_id" TEXT,
    "client_id" TEXT,
    "quote_number" TEXT NOT NULL,
    "contract_rate_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "total_amount" DECIMAL(65,30) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "accepted_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freight_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "quote_id" TEXT NOT NULL,
    "lineType" TEXT NOT NULL DEFAULT 'FREIGHT',
    "description" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(65,30) NOT NULL,
    "line_total" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_bookings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "booking_no" TEXT NOT NULL,
    "quote_id" TEXT,
    "client_id" TEXT,
    "service_mode" TEXT NOT NULL DEFAULT 'FCL_EXPORT',
    "vessel_name" TEXT,
    "voyage_no" TEXT,
    "mbl_no" TEXT,
    "hbl_no" TEXT,
    "etd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "origin_facility_id" TEXT,
    "dest_facility_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freight_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_shipments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "shipment_no" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "client_id" TEXT,
    "container_id" TEXT,
    "tracking_code" TEXT NOT NULL,
    "cargo_desc" TEXT,
    "gross_weight_kg" DECIMAL(65,30),
    "volume_cbm" DECIMAL(65,30),
    "dem_rule_id" TEXT,
    "det_rule_id" TEXT,
    "discharge_at" TIMESTAMP(3),
    "gate_out_full_at" TIMESTAMP(3),
    "empty_return_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freight_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_legs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "shipment_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "leg_type" TEXT NOT NULL,
    "origin_name" TEXT NOT NULL,
    "dest_name" TEXT NOT NULL,
    "origin_lat" DECIMAL(65,30),
    "origin_lng" DECIMAL(65,30),
    "dest_lat" DECIMAL(65,30),
    "dest_lng" DECIMAL(65,30),
    "planned_start" TIMESTAMP(3),
    "planned_end" TIMESTAMP(3),
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freight_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "invoice_no" TEXT NOT NULL,
    "client_id" TEXT,
    "booking_id" TEXT,
    "shipment_id" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'AR',
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "subtotal" DECIMAL(65,30) NOT NULL,
    "tax_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(65,30) NOT NULL,
    "paid_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "due_at" TIMESTAMP(3),
    "issued_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freight_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_ledger_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "invoice_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freight_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "reference" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "allocated_by" TEXT,
    "allocated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_cases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "dispute_code" TEXT NOT NULL,
    "invoice_id" TEXT,
    "shipment_id" TEXT,
    "client_id" TEXT,
    "category" TEXT NOT NULL,
    "claimed_amount" DECIMAL(65,30) NOT NULL,
    "approved_amount" DECIMAL(65,30),
    "reason" TEXT NOT NULL,
    "resolution_notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispute_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "booking_id" TEXT,
    "shipment_id" TEXT,
    "client_id" TEXT,
    "doc_type" TEXT NOT NULL,
    "doc_number" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
    "file_size" INTEGER,
    "storage_key" TEXT,
    "sha256" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "extraction_status" TEXT NOT NULL DEFAULT 'PENDING',
    "extracted_json" JSONB,
    "discrepancies_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_document_versions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "document_id" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "sha256" TEXT,
    "extracted_json" JSONB,
    "uploaded_by" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customs_declarations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "declaration_no" TEXT NOT NULL,
    "booking_id" TEXT,
    "shipment_id" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'EXPORT',
    "channel" TEXT NOT NULL DEFAULT 'YELLOW',
    "port_code" TEXT NOT NULL,
    "hs_review_required" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_CUSTOMS_REVIEW',
    "submitted_at" TIMESTAMP(3),
    "cleared_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customs_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customs_status_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "declaration_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actor_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customs_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hs_code_suggestions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL DEFAULT public.app_current_tenant_id(),
    "declaration_id" TEXT,
    "document_id" TEXT,
    "item_description" TEXT NOT NULL,
    "suggested_hs_code" TEXT NOT NULL,
    "confidence" DECIMAL(65,30) NOT NULL DEFAULT 0.5,
    "advisory_only" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_CUSTOMS_REVIEW',
    "approved_hs_code" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "source_method" TEXT NOT NULL DEFAULT 'rule_fallback',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hs_code_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "administrative_units_unit_type_idx" ON "administrative_units"("unit_type");

-- CreateIndex
CREATE INDEX "administrative_units_corridor_idx" ON "administrative_units"("corridor");

-- CreateIndex
CREATE INDEX "administrative_units_normalized_name_idx" ON "administrative_units"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_units_province_code_unit_type_normalized_nam_key" ON "administrative_units"("province_code", "unit_type", "normalized_name");

-- CreateIndex
CREATE INDEX "administrative_aliases_normalized_alias_idx" ON "administrative_aliases"("normalized_alias");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_aliases_unit_id_normalized_alias_key" ON "administrative_aliases"("unit_id", "normalized_alias");

-- CreateIndex
CREATE INDEX "administrative_boundary_versions_boundary_status_idx" ON "administrative_boundary_versions"("boundary_status");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_boundary_versions_unit_id_version_tag_key" ON "administrative_boundary_versions"("unit_id", "version_tag");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_facilities_code_key" ON "logistics_facilities"("code");

-- CreateIndex
CREATE INDEX "logistics_facilities_facility_type_idx" ON "logistics_facilities"("facility_type");

-- CreateIndex
CREATE INDEX "logistics_facilities_outside_city_idx" ON "logistics_facilities"("outside_city");

-- CreateIndex
CREATE INDEX "logistics_facilities_corridor_idx" ON "logistics_facilities"("corridor");

-- CreateIndex
CREATE INDEX "logistics_facilities_province_code_idx" ON "logistics_facilities"("province_code");

-- CreateIndex
CREATE INDEX "facility_geofences_facility_id_idx" ON "facility_geofences"("facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_corridors_code_key" ON "transport_corridors"("code");

-- CreateIndex
CREATE INDEX "transport_corridors_corridor_tag_idx" ON "transport_corridors"("corridor_tag");

-- CreateIndex
CREATE INDEX "road_restrictions_corridor_id_idx" ON "road_restrictions"("corridor_id");

-- CreateIndex
CREATE INDEX "road_restrictions_facility_id_idx" ON "road_restrictions"("facility_id");

-- CreateIndex
CREATE INDEX "terminal_queue_observations_facility_id_observed_at_idx" ON "terminal_queue_observations"("facility_id", "observed_at");

-- CreateIndex
CREATE INDEX "tractor_units_tenant_id_status_idx" ON "tractor_units"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tractor_units_tenant_id_unit_code_key" ON "tractor_units"("tenant_id", "unit_code");

-- CreateIndex
CREATE UNIQUE INDEX "tractor_units_tenant_id_plate_number_key" ON "tractor_units"("tenant_id", "plate_number");

-- CreateIndex
CREATE INDEX "chassis_units_tenant_id_status_idx" ON "chassis_units"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "chassis_units_tenant_id_chassis_code_key" ON "chassis_units"("tenant_id", "chassis_code");

-- CreateIndex
CREATE UNIQUE INDEX "chassis_units_tenant_id_plate_number_key" ON "chassis_units"("tenant_id", "plate_number");

-- CreateIndex
CREATE INDEX "container_equipments_tenant_id_status_idx" ON "container_equipments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "container_equipments_size_type_idx" ON "container_equipments"("size_type");

-- CreateIndex
CREATE UNIQUE INDEX "container_equipments_tenant_id_container_no_key" ON "container_equipments"("tenant_id", "container_no");

-- CreateIndex
CREATE INDEX "equipment_assignments_tenant_id_status_idx" ON "equipment_assignments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "equipment_assignments_tractor_id_start_at_end_at_idx" ON "equipment_assignments"("tractor_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "equipment_assignments_chassis_id_start_at_end_at_idx" ON "equipment_assignments"("chassis_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "equipment_assignments_container_id_start_at_end_at_idx" ON "equipment_assignments"("container_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "equipment_assignments_driver_id_start_at_end_at_idx" ON "equipment_assignments"("driver_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "yards_tenant_id_idx" ON "yards"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "yards_tenant_id_code_key" ON "yards"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "yard_slots_tenant_id_status_idx" ON "yard_slots"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "yard_slots_yard_id_slot_code_key" ON "yard_slots"("yard_id", "slot_code");

-- CreateIndex
CREATE INDEX "container_gate_events_tenant_id_occurred_at_idx" ON "container_gate_events"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "container_gate_events_container_id_idx" ON "container_gate_events"("container_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_interchange_receipts_gate_event_id_key" ON "equipment_interchange_receipts"("gate_event_id");

-- CreateIndex
CREATE INDEX "equipment_interchange_receipts_tenant_id_issued_at_idx" ON "equipment_interchange_receipts"("tenant_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_interchange_receipts_tenant_id_eir_number_key" ON "equipment_interchange_receipts"("tenant_id", "eir_number");

-- CreateIndex
CREATE INDEX "contract_rates_tenant_id_status_idx" ON "contract_rates"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contract_rates_tenant_id_contract_code_key" ON "contract_rates"("tenant_id", "contract_code");

-- CreateIndex
CREATE INDEX "surcharge_rules_tenant_id_idx" ON "surcharge_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "dem_det_rules_tenant_id_charge_type_idx" ON "dem_det_rules"("tenant_id", "charge_type");

-- CreateIndex
CREATE INDEX "freight_rfqs_tenant_id_status_idx" ON "freight_rfqs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "freight_rfqs_client_id_idx" ON "freight_rfqs"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "freight_rfqs_tenant_id_rfq_number_key" ON "freight_rfqs"("tenant_id", "rfq_number");

-- CreateIndex
CREATE INDEX "freight_quotes_tenant_id_status_idx" ON "freight_quotes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "freight_quotes_client_id_idx" ON "freight_quotes"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "freight_quotes_tenant_id_quote_number_key" ON "freight_quotes"("tenant_id", "quote_number");

-- CreateIndex
CREATE INDEX "quote_lines_quote_id_idx" ON "quote_lines"("quote_id");

-- CreateIndex
CREATE INDEX "quote_lines_tenant_id_idx" ON "quote_lines"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "freight_bookings_quote_id_key" ON "freight_bookings"("quote_id");

-- CreateIndex
CREATE INDEX "freight_bookings_tenant_id_status_idx" ON "freight_bookings"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "freight_bookings_client_id_idx" ON "freight_bookings"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "freight_bookings_tenant_id_booking_no_key" ON "freight_bookings"("tenant_id", "booking_no");

-- CreateIndex
CREATE UNIQUE INDEX "freight_shipments_tracking_code_key" ON "freight_shipments"("tracking_code");

-- CreateIndex
CREATE INDEX "freight_shipments_tenant_id_status_idx" ON "freight_shipments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "freight_shipments_client_id_idx" ON "freight_shipments"("client_id");

-- CreateIndex
CREATE INDEX "freight_shipments_booking_id_idx" ON "freight_shipments"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "freight_shipments_tenant_id_shipment_no_key" ON "freight_shipments"("tenant_id", "shipment_no");

-- CreateIndex
CREATE INDEX "freight_legs_tenant_id_status_idx" ON "freight_legs"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "freight_legs_shipment_id_sequence_key" ON "freight_legs"("shipment_id", "sequence");

-- CreateIndex
CREATE INDEX "freight_invoices_tenant_id_direction_status_idx" ON "freight_invoices"("tenant_id", "direction", "status");

-- CreateIndex
CREATE INDEX "freight_invoices_client_id_idx" ON "freight_invoices"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "freight_invoices_tenant_id_invoice_no_key" ON "freight_invoices"("tenant_id", "invoice_no");

-- CreateIndex
CREATE INDEX "freight_ledger_entries_tenant_id_invoice_id_idx" ON "freight_ledger_entries"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "payment_allocations_tenant_id_invoice_id_idx" ON "payment_allocations"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "dispute_cases_tenant_id_status_idx" ON "dispute_cases"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_cases_tenant_id_dispute_code_key" ON "dispute_cases"("tenant_id", "dispute_code");

-- CreateIndex
CREATE INDEX "trade_documents_tenant_id_doc_type_status_idx" ON "trade_documents"("tenant_id", "doc_type", "status");

-- CreateIndex
CREATE INDEX "trade_documents_booking_id_idx" ON "trade_documents"("booking_id");

-- CreateIndex
CREATE INDEX "trade_documents_client_id_idx" ON "trade_documents"("client_id");

-- CreateIndex
CREATE INDEX "trade_document_versions_tenant_id_idx" ON "trade_document_versions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "trade_document_versions_document_id_version_no_key" ON "trade_document_versions"("document_id", "version_no");

-- CreateIndex
CREATE INDEX "customs_declarations_tenant_id_status_channel_idx" ON "customs_declarations"("tenant_id", "status", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "customs_declarations_tenant_id_declaration_no_key" ON "customs_declarations"("tenant_id", "declaration_no");

-- CreateIndex
CREATE INDEX "customs_status_events_tenant_id_declaration_id_idx" ON "customs_status_events"("tenant_id", "declaration_id");

-- CreateIndex
CREATE INDEX "hs_code_suggestions_tenant_id_status_idx" ON "hs_code_suggestions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "hs_code_suggestions_declaration_id_idx" ON "hs_code_suggestions"("declaration_id");

-- AddForeignKey
ALTER TABLE "administrative_aliases" ADD CONSTRAINT "administrative_aliases_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "administrative_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_boundary_versions" ADD CONSTRAINT "administrative_boundary_versions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "administrative_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_facilities" ADD CONSTRAINT "logistics_facilities_administrative_unit_id_fkey" FOREIGN KEY ("administrative_unit_id") REFERENCES "administrative_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_geofences" ADD CONSTRAINT "facility_geofences_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "logistics_facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_corridors" ADD CONSTRAINT "transport_corridors_origin_facility_id_fkey" FOREIGN KEY ("origin_facility_id") REFERENCES "logistics_facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_corridors" ADD CONSTRAINT "transport_corridors_dest_facility_id_fkey" FOREIGN KEY ("dest_facility_id") REFERENCES "logistics_facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_restrictions" ADD CONSTRAINT "road_restrictions_corridor_id_fkey" FOREIGN KEY ("corridor_id") REFERENCES "transport_corridors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_restrictions" ADD CONSTRAINT "road_restrictions_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "logistics_facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_queue_observations" ADD CONSTRAINT "terminal_queue_observations_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "logistics_facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tractor_units" ADD CONSTRAINT "tractor_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chassis_units" ADD CONSTRAINT "chassis_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_equipments" ADD CONSTRAINT "container_equipments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_tractor_id_fkey" FOREIGN KEY ("tractor_id") REFERENCES "tractor_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_chassis_id_fkey" FOREIGN KEY ("chassis_id") REFERENCES "chassis_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "container_equipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_freight_leg_id_fkey" FOREIGN KEY ("freight_leg_id") REFERENCES "freight_legs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "freight_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yards" ADD CONSTRAINT "yards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yard_slots" ADD CONSTRAINT "yard_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yard_slots" ADD CONSTRAINT "yard_slots_yard_id_fkey" FOREIGN KEY ("yard_id") REFERENCES "yards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yard_slots" ADD CONSTRAINT "yard_slots_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "container_equipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_gate_events" ADD CONSTRAINT "container_gate_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_gate_events" ADD CONSTRAINT "container_gate_events_yard_id_fkey" FOREIGN KEY ("yard_id") REFERENCES "yards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_gate_events" ADD CONSTRAINT "container_gate_events_yard_slot_id_fkey" FOREIGN KEY ("yard_slot_id") REFERENCES "yard_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_gate_events" ADD CONSTRAINT "container_gate_events_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "container_equipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_gate_events" ADD CONSTRAINT "container_gate_events_tractor_id_fkey" FOREIGN KEY ("tractor_id") REFERENCES "tractor_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_gate_events" ADD CONSTRAINT "container_gate_events_chassis_id_fkey" FOREIGN KEY ("chassis_id") REFERENCES "chassis_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_interchange_receipts" ADD CONSTRAINT "equipment_interchange_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_interchange_receipts" ADD CONSTRAINT "equipment_interchange_receipts_gate_event_id_fkey" FOREIGN KEY ("gate_event_id") REFERENCES "container_gate_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_interchange_receipts" ADD CONSTRAINT "equipment_interchange_receipts_yard_id_fkey" FOREIGN KEY ("yard_id") REFERENCES "yards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_interchange_receipts" ADD CONSTRAINT "equipment_interchange_receipts_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "container_equipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_interchange_receipts" ADD CONSTRAINT "equipment_interchange_receipts_tractor_id_fkey" FOREIGN KEY ("tractor_id") REFERENCES "tractor_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_interchange_receipts" ADD CONSTRAINT "equipment_interchange_receipts_chassis_id_fkey" FOREIGN KEY ("chassis_id") REFERENCES "chassis_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_rates" ADD CONSTRAINT "contract_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_rates" ADD CONSTRAINT "contract_rates_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surcharge_rules" ADD CONSTRAINT "surcharge_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surcharge_rules" ADD CONSTRAINT "surcharge_rules_contract_rate_id_fkey" FOREIGN KEY ("contract_rate_id") REFERENCES "contract_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dem_det_rules" ADD CONSTRAINT "dem_det_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_rfqs" ADD CONSTRAINT "freight_rfqs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_rfqs" ADD CONSTRAINT "freight_rfqs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_quotes" ADD CONSTRAINT "freight_quotes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_quotes" ADD CONSTRAINT "freight_quotes_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "freight_rfqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_quotes" ADD CONSTRAINT "freight_quotes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_quotes" ADD CONSTRAINT "freight_quotes_contract_rate_id_fkey" FOREIGN KEY ("contract_rate_id") REFERENCES "contract_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "freight_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_bookings" ADD CONSTRAINT "freight_bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_bookings" ADD CONSTRAINT "freight_bookings_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "freight_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_bookings" ADD CONSTRAINT "freight_bookings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_bookings" ADD CONSTRAINT "freight_bookings_origin_facility_id_fkey" FOREIGN KEY ("origin_facility_id") REFERENCES "logistics_facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_bookings" ADD CONSTRAINT "freight_bookings_dest_facility_id_fkey" FOREIGN KEY ("dest_facility_id") REFERENCES "logistics_facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_shipments" ADD CONSTRAINT "freight_shipments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_shipments" ADD CONSTRAINT "freight_shipments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "freight_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_shipments" ADD CONSTRAINT "freight_shipments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_shipments" ADD CONSTRAINT "freight_shipments_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "container_equipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_shipments" ADD CONSTRAINT "freight_shipments_dem_rule_id_fkey" FOREIGN KEY ("dem_rule_id") REFERENCES "dem_det_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_shipments" ADD CONSTRAINT "freight_shipments_det_rule_id_fkey" FOREIGN KEY ("det_rule_id") REFERENCES "dem_det_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_legs" ADD CONSTRAINT "freight_legs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_legs" ADD CONSTRAINT "freight_legs_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "freight_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_invoices" ADD CONSTRAINT "freight_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_invoices" ADD CONSTRAINT "freight_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_invoices" ADD CONSTRAINT "freight_invoices_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "freight_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_invoices" ADD CONSTRAINT "freight_invoices_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "freight_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_ledger_entries" ADD CONSTRAINT "freight_ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_ledger_entries" ADD CONSTRAINT "freight_ledger_entries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "freight_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "freight_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_cases" ADD CONSTRAINT "dispute_cases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_cases" ADD CONSTRAINT "dispute_cases_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "freight_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_cases" ADD CONSTRAINT "dispute_cases_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "freight_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_cases" ADD CONSTRAINT "dispute_cases_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_documents" ADD CONSTRAINT "trade_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_documents" ADD CONSTRAINT "trade_documents_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "freight_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_documents" ADD CONSTRAINT "trade_documents_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "freight_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_documents" ADD CONSTRAINT "trade_documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_document_versions" ADD CONSTRAINT "trade_document_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_document_versions" ADD CONSTRAINT "trade_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "trade_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "freight_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "freight_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_status_events" ADD CONSTRAINT "customs_status_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_status_events" ADD CONSTRAINT "customs_status_events_declaration_id_fkey" FOREIGN KEY ("declaration_id") REFERENCES "customs_declarations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hs_code_suggestions" ADD CONSTRAINT "hs_code_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hs_code_suggestions" ADD CONSTRAINT "hs_code_suggestions_declaration_id_fkey" FOREIGN KEY ("declaration_id") REFERENCES "customs_declarations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hs_code_suggestions" ADD CONSTRAINT "hs_code_suggestions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "trade_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce FORCE ROW LEVEL SECURITY on all tenant-owned enterprise tables
ALTER TABLE "public"."tractor_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tractor_units" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."tractor_units";
CREATE POLICY tenant_isolation ON "public"."tractor_units"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."chassis_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."chassis_units" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."chassis_units";
CREATE POLICY tenant_isolation ON "public"."chassis_units"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."container_equipments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."container_equipments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."container_equipments";
CREATE POLICY tenant_isolation ON "public"."container_equipments"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."equipment_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."equipment_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."equipment_assignments";
CREATE POLICY tenant_isolation ON "public"."equipment_assignments"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."yards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."yards" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."yards";
CREATE POLICY tenant_isolation ON "public"."yards"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."yard_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."yard_slots" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."yard_slots";
CREATE POLICY tenant_isolation ON "public"."yard_slots"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."container_gate_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."container_gate_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."container_gate_events";
CREATE POLICY tenant_isolation ON "public"."container_gate_events"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."equipment_interchange_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."equipment_interchange_receipts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."equipment_interchange_receipts";
CREATE POLICY tenant_isolation ON "public"."equipment_interchange_receipts"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."contract_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."contract_rates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."contract_rates";
CREATE POLICY tenant_isolation ON "public"."contract_rates"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."surcharge_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."surcharge_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."surcharge_rules";
CREATE POLICY tenant_isolation ON "public"."surcharge_rules"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."dem_det_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dem_det_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."dem_det_rules";
CREATE POLICY tenant_isolation ON "public"."dem_det_rules"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."freight_rfqs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."freight_rfqs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."freight_rfqs";
CREATE POLICY tenant_isolation ON "public"."freight_rfqs"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."freight_quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."freight_quotes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."freight_quotes";
CREATE POLICY tenant_isolation ON "public"."freight_quotes"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."quote_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."quote_lines" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."quote_lines";
CREATE POLICY tenant_isolation ON "public"."quote_lines"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."freight_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."freight_bookings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."freight_bookings";
CREATE POLICY tenant_isolation ON "public"."freight_bookings"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."freight_shipments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."freight_shipments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."freight_shipments";
CREATE POLICY tenant_isolation ON "public"."freight_shipments"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."freight_legs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."freight_legs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."freight_legs";
CREATE POLICY tenant_isolation ON "public"."freight_legs"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."freight_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."freight_invoices" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."freight_invoices";
CREATE POLICY tenant_isolation ON "public"."freight_invoices"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."freight_ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."freight_ledger_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."freight_ledger_entries";
CREATE POLICY tenant_isolation ON "public"."freight_ledger_entries"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payment_allocations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."payment_allocations";
CREATE POLICY tenant_isolation ON "public"."payment_allocations"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."dispute_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dispute_cases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."dispute_cases";
CREATE POLICY tenant_isolation ON "public"."dispute_cases"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."trade_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."trade_documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."trade_documents";
CREATE POLICY tenant_isolation ON "public"."trade_documents"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."trade_document_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."trade_document_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."trade_document_versions";
CREATE POLICY tenant_isolation ON "public"."trade_document_versions"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."customs_declarations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customs_declarations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."customs_declarations";
CREATE POLICY tenant_isolation ON "public"."customs_declarations"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."customs_status_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customs_status_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."customs_status_events";
CREATE POLICY tenant_isolation ON "public"."customs_status_events"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "public"."hs_code_suggestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."hs_code_suggestions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "public"."hs_code_suggestions";
CREATE POLICY tenant_isolation ON "public"."hs_code_suggestions"
  USING ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartlogi_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartlogi_app';
  END IF;
END $$;
