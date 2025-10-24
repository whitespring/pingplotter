# Database Setup Guide

## Overview

This guide explains how to set up the PostgreSQL database for storing network anomaly data.

## Prerequisites

- PostgreSQL 12+ (your current setup: PostgreSQL 17 at 192.168.4.44:5432)
- Database name: `pingplot`
- User credentials configured in `backend/.env`

## Setup Instructions

### 1. Connect to Your Database

```bash
# Using psql
psql -h 192.168.4.44 -p 5432 -U postgres -d pingplot
```

### 2. Run the Schema

```bash
# From the WebPing directory
psql -h 192.168.4.44 -p 5432 -U postgres -d pingplot -f schema.sql
```

Or copy/paste the contents of `schema.sql` into your PostgreSQL client.

### 3. Verify Installation

```sql
-- Check tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('network_events', 'event_hops');

-- Check views were created
SELECT table_name FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name IN ('recent_anomalies', 'hop_problem_stats');
```

You should see:
- Tables: `network_events`, `event_hops`
- Views: `recent_anomalies`, `hop_problem_stats`

## Database Structure

### Tables

**network_events**
- Stores high-level information about each network anomaly
- Triggers: latency > 200ms, timeouts, or packet loss > 5%
- Includes: timestamp, target, issue type, problematic hop

**event_hops**
- Stores complete hop-by-hop traceroute path for each event
- Links to network_events via event_id
- Includes: hop number, IP, hostname, latency, timeout status

### Views

**recent_anomalies**
- Shows anomalies from the last 7 days with problem hop details
- Quick access for recent issues

**hop_problem_stats**
- Aggregates problem hop statistics over last 30 days
- Shows: frequency, average/min/max latency per hop

## Data Retention

Currently, data is retained indefinitely. To add automatic cleanup:

```sql
-- Delete events older than 90 days
DELETE FROM network_events WHERE timestamp < NOW() - INTERVAL '90 days';
```

Consider setting up a cron job or scheduled task for automatic cleanup:

```sql
-- Create a function for cleanup
CREATE OR REPLACE FUNCTION cleanup_old_events()
RETURNS void AS $$
BEGIN
    DELETE FROM network_events WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule it (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-events', '0 2 * * *', 'SELECT cleanup_old_events()');
```

## Useful Queries

### View Recent Anomalies
```sql
SELECT * FROM recent_anomalies LIMIT 20;
```

### Find Most Problematic Hops
```sql
SELECT * FROM hop_problem_stats LIMIT 10;
```

### Get Full Traceroute for Specific Event
```sql
SELECT 
    ne.timestamp,
    ne.target,
    ne.issue_type,
    json_agg(
        json_build_object(
            'hop', eh.hop_number,
            'ip', eh.ip_address,
            'hostname', eh.hostname,
            'latency', eh.latency_ms,
            'timeout', eh.timeout,
            'problematic', eh.is_problematic
        ) ORDER BY eh.hop_number
    ) as hop_path
FROM network_events ne
LEFT JOIN event_hops eh ON ne.id = eh.event_id
WHERE ne.id = 1  -- Replace with actual event ID
GROUP BY ne.id, ne.timestamp, ne.target, ne.issue_type;
```

### Anomaly Timeline (Hourly)
```sql
SELECT 
    date_trunc('hour', timestamp) AS hour,
    COUNT(*) as anomaly_count,
    issue_type
FROM network_events
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour, issue_type
ORDER BY hour DESC;
```

### Target Performance Summary
```sql
SELECT 
    target,
    COUNT(*) as total_anomalies,
    COUNT(CASE WHEN issue_type = 'high_latency' THEN 1 END) as high_latency_count,
    COUNT(CASE WHEN issue_type = 'timeout' THEN 1 END) as timeout_count,
    AVG(avg_latency) as overall_avg_latency
FROM network_events
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY target
ORDER BY total_anomalies DESC;
```

## Troubleshooting

### Connection Issues

If you can't connect:

```bash
# Test connection
psql -h 192.168.4.44 -p 5432 -U postgres -d pingplot -c "SELECT version();"
```

Check `backend/.env` has correct credentials:
```
DATABASE_URL=postgresql://postgres:***REMOVED***@192.168.4.44:5432/pingplot
```

### Schema Already Exists

The schema uses `IF NOT EXISTS` clauses, so it's safe to run multiple times. To completely reset:

```sql
-- WARNING: This deletes all data!
DROP VIEW IF EXISTS hop_problem_stats CASCADE;
DROP VIEW IF EXISTS recent_anomalies CASCADE;
DROP TABLE IF EXISTS event_hops CASCADE;
DROP TABLE IF EXISTS network_events CASCADE;
```

Then run `schema.sql` again.

## Performance Considerations

- Indexes are created automatically for common query patterns
- Views are not materialized (real-time data)
- For better performance with large datasets (>100k events), consider:
  - Partitioning `network_events` by month
  - Converting views to materialized views
  - Adding more specific indexes based on your query patterns

## Backup

Regular backups recommended:

```bash
# Backup just the anomaly tables
pg_dump -h 192.168.4.44 -U postgres -d pingplot \
  -t network_events -t event_hops \
  -f backup_anomalies_$(date +%Y%m%d).sql
