-- system_alert_logs 조회 성능 개선용 역순 정렬 인덱스 (id tie-breaker 포함)
CREATE INDEX IF NOT EXISTS ix_system_alert_logs_created_at_desc
ON system_alert_logs (created_at DESC, id DESC);
