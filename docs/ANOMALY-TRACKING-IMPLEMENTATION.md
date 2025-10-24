# Network Anomaly Tracking - Implementation Summary

## 🎉 What's Been Implemented

A complete backend system for tracking and analyzing network anomalies (high latency >200ms, timeouts, packet loss) with full traceroute hop path information.

## 📁 Files Created/Modified

### New Files:
- `schema.sql` - PostgreSQL database schema
- `DATABASE-SETUP.md` - Database setup instructions
- `ANOMALY-TRACKING-IMPLEMENTATION.md` - This file

### Modified Files:
- `package.json` - Added `pg` dependency for PostgreSQL
- `monitor-backend.js` - Added anomaly detection and logging

## ✅ Features Implemented

### 1. **Automatic Anomaly Detection**
Every traceroute automatically checks for:
- **High Latency**: Any hop with >200ms response time
- **Timeouts**: Any hop that doesn't respond
- **Packet Loss**: Calculated from timeout frequency

### 2. **Complete Data Storage**
When an anomaly is detected:
- ✅ Saves full event details (timestamp, target, issue type)
- ✅ Stores complete hop-by-hop traceroute path
- ✅ Identifies which hop is problematic
- ✅ Includes latency, IP, hostname for each hop

### 3. **Powerful Query API**
5 new API endpoints for accessing anomaly data:

| Endpoint | Purpose | Query Parameters |
|----------|---------|------------------|
| `GET /api/anomalies` | Get filtered anomalies | `target`, `issue_type`, `hours`, `limit`, `hop` |
| `GET /api/anomalies/:id/hops` | Get full hop path for event | Event ID in URL |
| `GET /api/hop-stats` | Problem hop statistics | `days`, `limit` |
| `GET /api/anomaly-timeline` | Time-series data | `hours`, `interval` |
| `GET /api/export/anomalies` | Export to CSV | `hours`, `target` |

### 4. **Database Schema**
Two tables + two views:

**Tables:**
- `network_events` - High-level anomaly records
- `event_hops` - Complete hop paths for each event

**Views:**
- `recent_anomalies` - Quick access to last 7 days
- `hop_problem_stats` - Hop problem frequency aggregation

## 🚀 Getting Started

### Step 1: Set Up Database

```bash
# 1. Run the schema
psql -h 192.168.4.44 -p 5432 -U postgres -d pingplot -f schema.sql

# 2. Verify tables were created
psql -h 192.168.4.44 -p 5432 -U postgres -d pingplot -c "\dt"
```

See `DATABASE-SETUP.md` for detailed instructions.

### Step 2: Start Backend

```bash
# The backend is already configured to connect to your database
npm start

# You should see:
# ✓ Database connected successfully
```

### Step 3: Test Anomaly Detection

```bash
# Run a traceroute (will auto-detect and log anomalies)
curl http://localhost:3002/api/traceroute/vodafone.de

# Check if any anomalies were logged
curl http://localhost:3002/api/anomalies
```

## 📊 API Usage Examples

### Get Recent Anomalies (last 24 hours)
```bash
curl 'http://localhost:3002/api/anomalies?hours=24&limit=50'
```

### Filter by Target
```bash
curl 'http://localhost:3002/api/anomalies?target=vodafone.de'
```

### Filter by Issue Type
```bash
curl 'http://localhost:3002/api/anomalies?issue_type=high_latency'
```

### Get Full Hop Path for Specific Event
```bash
# Replace 123 with actual event ID
curl 'http://localhost:3002/api/anomalies/123/hops'
```

### Get Problem Hop Statistics
```bash
curl 'http://localhost:3002/api/hop-stats?days=30&limit=10'
```

### Export to CSV
```bash
# Download last 24 hours
curl 'http://localhost:3002/api/export/anomalies?hours=24' > anomalies.csv

# Download for specific target
curl 'http://localhost:3002/api/export/anomalies?target=vodafone.de' > vodafone_anomalies.csv
```

## 📈 Example Queries

### SQL: View Recent Anomalies
```sql
SELECT * FROM recent_anomalies LIMIT 20;
```

### SQL: Find Most Problematic Hops
```sql
SELECT * FROM hop_problem_stats ORDER BY problem_count DESC LIMIT 10;
```

### SQL: Get Events for Specific Hop
```sql
SELECT ne.*, eh.latency_ms, eh.hostname
FROM network_events ne
JOIN event_hops eh ON ne.id = eh.event_id
WHERE ne.problematic_hop = 8  -- Check hop 8
  AND ne.timestamp > NOW() - INTERVAL '24 hours'
ORDER BY ne.timestamp DESC;
```

### SQL: Hourly Anomaly Count
```sql
SELECT 
    date_trunc('hour', timestamp) AS hour,
    COUNT(*) as count,
    issue_type
FROM network_events
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour, issue_type
ORDER BY hour DESC;
```

## 🎨 Frontend Integration (Next Steps)

The backend is ready! Here's what you could build for the UI:

### Option 1: Add Tab to PingPlotter
Add a new "Anomaly History" tab to `pingplotter.html` with:
- Filterable table of anomalies
- Click to expand → show full hop path
- Export button
- Statistics cards (total anomalies, worst hop, etc.)

### Option 2: Standalone Anomaly Viewer Page
Create new `anomaly-viewer.html` with:
- Date range picker
- Target/hop/type filters
- Data table with expand/collapse rows
- Charts (timeline, hop frequency)
- Export functionality

### Key API Calls to Use:
```javascript
// Get recent anomalies
const response = await fetch('http://localhost:3002/api/anomalies?hours=24');
const data = await response.json();
// data.anomalies = array of anomaly objects

// Get full hop path when user clicks on anomaly
const hopResponse = await fetch(`http://localhost:3002/api/anomalies/${eventId}/hops`);
const hopData = await hopResponse.json();
// hopData.hop_path = array of all hops

// Get hop statistics for visualization
const statsResponse = await fetch('http://localhost:3002/api/hop-stats?days=7');
const stats = await statsResponse.json();
// stats.hop_stats = array of problem hop statistics
```

## 🔍 What Gets Logged

### Example Anomaly Event in Database:

**network_events table:**
```
id: 1
timestamp: 2025-01-24 20:15:32
target: vodafone.de
target_ip: 134.119.57.59
issue_type: high_latency
total_hops: 15
problematic_hop: 8
avg_latency: 245.3
packet_loss_pct: 0
```

**event_hops table (for above event):**
```
Hop 1: 192.168.0.1, 2.3ms
Hop 2: 10.0.0.1, 15.2ms
...
Hop 8: 151.101.1.69, 245.8ms ← PROBLEMATIC
...
Hop 15: 134.119.57.59, 18.2ms
```

## ⚙️ Configuration

### Anomaly Thresholds
Edit in `monitor-backend.js`:
```javascript
const ANOMALY_THRESHOLDS = {
    HIGH_LATENCY: 200, // ms - change this value
    PACKET_LOSS: 5     // percent
};
```

### Database Connection
Set in `backend/.env` or it defaults to:
```
DATABASE_URL=postgresql://postgres:***REMOVED***@192.168.4.44:5432/pingplot
```

### Data Retention
Currently unlimited. To add automatic cleanup, see `DATABASE-SETUP.md`.

## 🎯 Current State

### ✅ Completed:
- [x] Database schema designed and created
- [x] Anomaly detection logic (>200ms, timeouts)
- [x] Automatic logging to PostgreSQL
- [x] Full hop path storage
- [x] API endpoints for querying data
- [x] CSV export functionality
- [x] Hop statistics aggregation
- [x] Timeline data for charting
- [x] Filtering capabilities

### 📋 Next Steps (Optional):
- [ ] Create frontend UI for viewing anomalies
- [ ] Add filtering interface (date, target, hop)
- [ ] Visualize hop problem frequency
- [ ] Add charts for timeline data
- [ ] Implement search functionality
- [ ] Add data retention automation

## 💡 Usage Tips

1. **Let it run for a while**: Anomalies are only logged when detected (>200ms or timeouts)
2. **Check the logs**: Backend console shows when anomalies are logged
3. **Use filters**: The API supports many filters to narrow down results
4. **Export regularly**: Use CSV export for Excel analysis
5. **Monitor hop stats**: Identify recurring problem spots in your network path

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check database connection
psql -h 192.168.4.44 -p 5432 -U postgres -d pingplot -c "SELECT version();"

# Check if schema is installed
psql -h 192.168.4.44 -p 5432 -U postgres -d pingplot -c "\dt"
```

### No anomalies being logged
- Check if latency is actually >200ms in traceroutes
- Check backend console for error messages
- Verify database connection succeeded on startup

### Can't query anomalies
```bash
# Test database connection
curl http://localhost:3002/health

# Check if any data exists
curl http://localhost:3002/api/anomalies?limit=1
```

## 📚 Related Files

- `DATABASE-SETUP.md` - Complete database setup guide
- `schema.sql` - Database schema
- `monitor-backend.js` - Backend implementation
- `package.json` - Dependencies

## 🎓 Learning Resources

**SQL Queries:**
- All example queries are in `DATABASE-SETUP.md`
- Views provide shortcuts for common queries

**API Examples:**
- See "API Usage Examples" section above
- All endpoints return JSON (except CSV export)

---

**Status**: Backend implementation complete and production-ready!
**Ready for**: Frontend development to visualize and interact with the data
