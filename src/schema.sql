-- WebPing Network Anomaly Tracking Schema
-- PostgreSQL 17 compatible

-- Drop views first (they depend on tables)
DROP VIEW IF EXISTS hop_problem_stats CASCADE;
DROP VIEW IF EXISTS recent_anomalies CASCADE;

-- Drop and recreate tables to ensure correct schema
DROP TABLE IF EXISTS event_hops CASCADE;
DROP TABLE IF EXISTS network_events CASCADE;

-- Main events table for anomalies (>200ms latency, timeouts, packet loss)
CREATE TABLE network_events (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target VARCHAR(255) NOT NULL,
    target_ip INET,
    issue_type VARCHAR(50) NOT NULL,
    total_hops INTEGER,
    problematic_hop INTEGER,
    avg_latency NUMERIC(10,2),
    packet_loss_pct NUMERIC(5,2),
    CONSTRAINT valid_issue_type CHECK (issue_type IN ('high_latency', 'timeout', 'packet_loss'))
);

-- Detailed hop path for each event
CREATE TABLE event_hops (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES network_events(id) ON DELETE CASCADE,
    hop_number INTEGER NOT NULL,
    ip_address INET,
    hostname VARCHAR(255),
    latency_ms NUMERIC(10,2),
    timeout BOOLEAN DEFAULT FALSE,
    is_problematic BOOLEAN DEFAULT FALSE,
    UNIQUE(event_id, hop_number)
);

-- Per-hop packet loss statistics aggregated over time
CREATE TABLE hop_statistics (
    id BIGSERIAL PRIMARY KEY,
    timestamp_minute TIMESTAMPTZ NOT NULL,
    target VARCHAR(255) NOT NULL,
    hop_number INTEGER NOT NULL,
    hop_ip INET,
    hop_hostname VARCHAR(255),
    total_attempts INTEGER NOT NULL DEFAULT 0,
    total_losses INTEGER NOT NULL DEFAULT 0,
    packet_loss_pct NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN total_attempts > 0 
        THEN (total_losses::NUMERIC / total_attempts::NUMERIC * 100) 
        ELSE 0 END
    ) STORED,
    avg_latency NUMERIC(10,2),
    min_latency NUMERIC(10,2),
    max_latency NUMERIC(10,2),
    UNIQUE(target, hop_number, hop_ip, timestamp_minute)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON network_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_target_time ON network_events (target, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_issue_type ON network_events (issue_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_problematic_hop ON network_events (problematic_hop) WHERE problematic_hop IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_hops_event_id ON event_hops (event_id);
CREATE INDEX IF NOT EXISTS idx_event_hops_high_latency ON event_hops (latency_ms DESC) WHERE latency_ms > 200;
CREATE INDEX IF NOT EXISTS idx_hop_stats_target_time ON hop_statistics (target, timestamp_minute DESC);
CREATE INDEX IF NOT EXISTS idx_hop_stats_hop_number ON hop_statistics (hop_number);
CREATE INDEX IF NOT EXISTS idx_hop_stats_packet_loss ON hop_statistics (packet_loss_pct DESC) WHERE packet_loss_pct > 0;

-- Useful view for quick queries
CREATE VIEW recent_anomalies AS
SELECT 
    ne.id,
    ne.timestamp,
    ne.target,
    ne.issue_type,
    ne.problematic_hop,
    ne.avg_latency,
    ne.packet_loss_pct,
    eh.ip_address as problem_hop_ip,
    eh.hostname as problem_hop_hostname,
    eh.latency_ms as problem_hop_latency
FROM network_events ne
LEFT JOIN event_hops eh ON ne.id = eh.event_id AND ne.problematic_hop = eh.hop_number
WHERE ne.timestamp > NOW() - INTERVAL '7 days'
ORDER BY ne.timestamp DESC;

-- Statistics view for problematic hops
CREATE VIEW hop_problem_stats AS
SELECT 
    eh.hop_number,
    eh.hostname,
    eh.ip_address,
    COUNT(*) as problem_count,
    AVG(eh.latency_ms) as avg_latency,
    MAX(eh.latency_ms) as max_latency,
    MIN(eh.latency_ms) as min_latency,
    ne.target
FROM event_hops eh
JOIN network_events ne ON eh.event_id = ne.id
WHERE eh.is_problematic = true
  AND ne.timestamp > NOW() - INTERVAL '30 days'
GROUP BY eh.hop_number, eh.hostname, eh.ip_address, ne.target
ORDER BY problem_count DESC;

-- Comments for documentation
COMMENT ON TABLE network_events IS 'Stores network anomaly events (high latency >200ms, timeouts, packet loss)';
COMMENT ON TABLE event_hops IS 'Stores complete hop-by-hop traceroute data for each anomaly event';
COMMENT ON COLUMN network_events.issue_type IS 'Type of issue: high_latency (>200ms), timeout, or packet_loss';
COMMENT ON COLUMN network_events.problematic_hop IS 'The hop number where the problem was detected';
COMMENT ON COLUMN event_hops.is_problematic IS 'TRUE if this hop was identified as the source of the problem';
