-- 3B.8 - Outbox pattern cho webhook + billing event
--
-- Sự kiện nghiệp vụ được ghi vào bảng này CÙNG transaction với thay đổi
-- dữ liệu, rồi một worker gửi đi (Kafka / webhook). Nhờ vậy không còn trường
-- hợp "đơn hàng đã tạo nhưng event chưa phát" (và ngược lại).
--
-- Bảng thuộc lớp platform: worker đọc/ghi xuyên tenant nên không bật RLS.

CREATE TABLE IF NOT EXISTS "outbox_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "channel" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");
CREATE INDEX IF NOT EXISTS "outbox_events_tenant_id_idx" ON "outbox_events"("tenant_id");
CREATE INDEX IF NOT EXISTS "outbox_events_topic_idx" ON "outbox_events"("topic");
