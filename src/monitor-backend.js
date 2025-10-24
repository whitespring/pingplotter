const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const { Pool } = require('pg');

const execPromise = promisify(exec);

const app = express();
const PORT = 3002;

// Enable CORS for browser access
app.use(cors());
app.use(express.json());

// PostgreSQL connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:***REMOVED***@192.168.4.44:5432/pingplot',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection on startup
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
        console.log('⚠️  Anomaly logging will be disabled. Run schema.sql to set up the database.');
    } else {
        console.log('✓ Database connected successfully');
        release();
    }
});

// Configuration for anomaly detection
const ANOMALY_THRESHOLDS = {
    HIGH_LATENCY: 200, // ms
    PACKET_LOSS: 3     // percent
};

// Database logging toggle (can be changed via API)
let databaseLoggingEnabled = true;

// In-memory tracking for per-hop statistics (aggregated per minute)
const hopStatsBuffer = new Map(); // key: 'target:hop:ip:minute' -> { attempts, losses, latencies }

// Detect anomalies in traceroute results
function detectAnomalies(hops) {
    const anomalies = [];
    
    // Check if we reached the destination (last hop has a valid response)
    const reachedDestination = hops.length > 0 && 
        hops[hops.length - 1].latency !== null && 
        !hops[hops.length - 1].timeout;
    
    hops.forEach((hop, index) => {
        // Check for high latency (>200ms)
        if (hop.latency && hop.latency > ANOMALY_THRESHOLDS.HIGH_LATENCY) {
            anomalies.push({
                type: 'high_latency',
                hop: hop.hop,
                value: hop.latency,
                threshold: ANOMALY_THRESHOLDS.HIGH_LATENCY
            });
        }
        
        // Only flag timeout as anomaly if:
        // 1. We DIDN'T reach the destination
        // 2. It's the last hop
        // 3. The hop has a valid IP address (hops without IPs are just routers that don't respond to ICMP)
        if (hop.timeout && !reachedDestination && index === hops.length - 1 && hop.ip && hop.ip !== '*') {
            anomalies.push({
                type: 'timeout',
                hop: hop.hop,
                value: null,
                threshold: null
            });
        }
    });
    
    return anomalies;
}

// Find the most problematic hop
function findProblematicHop(hops, anomalies) {
    if (anomalies.length === 0) return null;
    
    // Prioritize: timeout > highest latency
    const timeoutAnomaly = anomalies.find(a => a.type === 'timeout');
    if (timeoutAnomaly) return timeoutAnomaly.hop;
    
    const highLatencyAnomalies = anomalies.filter(a => a.type === 'high_latency');
    if (highLatencyAnomalies.length > 0) {
        // Return hop with highest latency
        const worst = highLatencyAnomalies.reduce((max, a) => a.value > max.value ? a : max);
        return worst.hop;
    }
    
    return null;
}

// Calculate average latency and packet loss
function calculateStats(hops) {
    const validHops = hops.filter(h => h.latency !== null && !h.timeout);
    
    // Only count timeouts for hops with valid IP addresses
    // (hops without IPs are routers that don't respond to ICMP, not real packet loss)
    const timeouts = hops.filter(h => h.timeout && h.ip && h.ip !== '*').length;
    
    // Only count hops with IPs for packet loss calculation
    const hopsWithIPs = hops.filter(h => h.ip && h.ip !== '*').length;
    
    const avgLatency = validHops.length > 0
        ? validHops.reduce((sum, h) => sum + h.latency, 0) / validHops.length
        : null;
    
    const packetLoss = hopsWithIPs > 0
        ? (timeouts / hopsWithIPs) * 100
        : 0;
    
    return { avgLatency, packetLoss };
}

// Get destination IP from hops
function getDestinationIP(hops) {
    if (hops.length === 0) return null;
    const lastHop = hops[hops.length - 1];
    return lastHop.ip !== '*' ? lastHop.ip : null;
}

// Log anomaly to database
async function logAnomaly(target, hops, anomalies) {
    if (anomalies.length === 0) return;
    
    try {
        const problematicHop = findProblematicHop(hops, anomalies);
        const stats = calculateStats(hops);
        const destinationIP = getDestinationIP(hops);
        
        // Determine primary issue type
        let issueType = 'high_latency';
        if (anomalies.some(a => a.type === 'timeout')) {
            issueType = 'timeout';
        } else if (stats.packetLoss > ANOMALY_THRESHOLDS.PACKET_LOSS) {
            issueType = 'packet_loss';
        }
        
        // Insert event
        const eventResult = await pool.query(
            `INSERT INTO network_events 
             (timestamp, target, target_ip, issue_type, total_hops, problematic_hop, avg_latency, packet_loss_pct)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
                new Date(),
                target,
                destinationIP,
                issueType,
                hops.length,
                problematicHop,
                stats.avgLatency,
                stats.packetLoss
            ]
        );
        
        const eventId = eventResult.rows[0].id;
        
        // Insert all hops individually with conflict handling
        for (const hop of hops) {
            try {
                await pool.query(
                    `INSERT INTO event_hops 
                     (event_id, hop_number, ip_address, hostname, latency_ms, timeout, is_problematic)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (event_id, hop_number) DO NOTHING`,
                    [
                        eventId,
                        hop.hop,
                        hop.ip !== '*' ? hop.ip : null,
                        hop.hostname !== 'Request timed out' ? hop.hostname : null,
                        hop.latency,
                        hop.timeout,
                        hop.hop === problematicHop
                    ]
                );
            } catch (hopError) {
                // Silently skip duplicate hops
                continue;
            }
        }
        
        console.log(`📊 Anomaly logged: ${issueType} for ${target} (Event ID: ${eventId}, Hop: ${problematicHop})`);
        
    } catch (error) {
        console.error('Failed to log anomaly:', error.message);
    }
}

// Track per-hop statistics
function trackHopStatistics(target, hops) {
    const now = new Date();
    const minute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0);
    
    hops.forEach(hop => {
        // Skip hops without IP addresses (they're likely just routers that don't respond to ICMP)
        if (!hop.ip || hop.ip === '*') {
            return;
        }
        
        const key = `${target}:${hop.hop}:${hop.ip}:${minute.getTime()}`;
        
        if (!hopStatsBuffer.has(key)) {
            hopStatsBuffer.set(key, {
                target,
                hop_number: hop.hop,
                hop_ip: hop.ip,
                hop_hostname: hop.hostname !== 'Request timed out' ? hop.hostname : null,
                timestamp_minute: minute,
                total_attempts: 0,
                total_losses: 0,
                latencies: []
            });
        }
        
        const stats = hopStatsBuffer.get(key);
        stats.total_attempts++;
        
        if (hop.timeout || hop.latency === null) {
            stats.total_losses++;
        } else {
            stats.latencies.push(hop.latency);
        }
    });
}

// Flush hop statistics to database (called periodically)
async function flushHopStatistics() {
    if (hopStatsBuffer.size === 0) return;
    
    const entries = Array.from(hopStatsBuffer.entries());
    hopStatsBuffer.clear();
    
    for (const [key, stats] of entries) {
        try {
            const avgLatency = stats.latencies.length > 0
                ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
                : null;
            const minLatency = stats.latencies.length > 0 ? Math.min(...stats.latencies) : null;
            const maxLatency = stats.latencies.length > 0 ? Math.max(...stats.latencies) : null;
            
            await pool.query(`
                INSERT INTO hop_statistics 
                (timestamp_minute, target, hop_number, hop_ip, hop_hostname, total_attempts, total_losses, avg_latency, min_latency, max_latency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (target, hop_number, hop_ip, timestamp_minute) 
                DO UPDATE SET
                    total_attempts = hop_statistics.total_attempts + EXCLUDED.total_attempts,
                    total_losses = hop_statistics.total_losses + EXCLUDED.total_losses,
                    avg_latency = (COALESCE(hop_statistics.avg_latency, 0) * hop_statistics.total_attempts + EXCLUDED.avg_latency * EXCLUDED.total_attempts) / (hop_statistics.total_attempts + EXCLUDED.total_attempts),
                    min_latency = LEAST(hop_statistics.min_latency, EXCLUDED.min_latency),
                    max_latency = GREATEST(hop_statistics.max_latency, EXCLUDED.max_latency)
            `, [
                stats.timestamp_minute,
                stats.target,
                stats.hop_number,
                stats.hop_ip,
                stats.hop_hostname,
                stats.total_attempts,
                stats.total_losses,
                avgLatency,
                minLatency,
                maxLatency
            ]);
        } catch (error) {
            console.error('Failed to flush hop statistics:', error.message);
        }
    }
    
    console.log(`📈 Flushed hop statistics for ${entries.length} unique hops`);
}

// Flush hop statistics every minute
setInterval(flushHopStatistics, 60000);

// Parse traceroute output
function parseTracerouteOutput(output) {
    const lines = output.split('\n');
    const hops = [];
    
    for (const line of lines) {
        // Skip header lines and empty lines
        if (!line.trim() || line.includes('traceroute to')) {
            continue;
        }
        
        // Match hop number at the start of line
        const hopMatch = line.match(/^\s*(\d+)/);
        if (!hopMatch) continue;
        
        const hopNumber = parseInt(hopMatch[1]);
        
        // Extract IP address
        const ipMatch = line.match(/\((\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\)/);
        const ip = ipMatch ? ipMatch[1] : null;
        
        // Extract hostname (text before the IP address)
        let hostname = null;
        if (ipMatch) {
            const hostnameMatch = line.match(/\d+\s+([^\s(]+)\s*\(/);
            hostname = hostnameMatch ? hostnameMatch[1] : ip;
        }
        
        // Extract latencies (looking for patterns like "12.345 ms")
        const latencyMatches = line.match(/(\d+\.?\d*)\s*ms/g);
        let latency = null;
        
        if (latencyMatches && latencyMatches.length > 0) {
            // Use the first latency value
            const firstLatency = parseFloat(latencyMatches[0].replace('ms', '').trim());
            latency = firstLatency;
        }
        
        // Check for timeout/no response
        const isTimeout = line.includes('* * *') || line.includes('!H') || line.includes('!N');
        
        if (ip || isTimeout) {
            hops.push({
                hop: hopNumber,
                ip: ip || '*',
                hostname: hostname || (isTimeout ? 'Request timed out' : ip),
                latency: latency,
                timeout: isTimeout
            });
        }
    }
    
    return hops;
}

// Traceroute endpoint
app.get('/api/traceroute/:target', async (req, res) => {
    const { target } = req.params;
    
    // Basic validation to prevent command injection
    if (!target || target.length > 253 || /[;&|`$()]/.test(target)) {
        return res.status(400).json({ 
            error: 'Invalid target',
            message: 'Target must be a valid domain or IP address'
        });
    }
    
    try {
        const startTime = new Date().toLocaleString('de-DE', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        console.log(`[${startTime}] Running traceroute for: ${target}`);
        
        // Determine OS and use appropriate command
        const platform = process.platform;
        let command;
        
        if (platform === 'darwin' || platform === 'linux') {
            // macOS and Linux: use traceroute with max 15 hops, 2 second timeout per hop
            command = `traceroute -m 15 -w 2 ${target}`;
        } else if (platform === 'win32') {
            // Windows: use tracert with max 15 hops
            command = `tracert -h 15 -w 2000 ${target}`;
        } else {
            throw new Error('Unsupported operating system');
        }
        
        const { stdout, stderr } = await execPromise(command, {
            timeout: 60000 // 60 second total timeout
        });
        
        if (stderr && !stdout) {
            throw new Error(stderr);
        }
        
        const hops = parseTracerouteOutput(stdout);
        
        // Track per-hop statistics
        trackHopStatistics(target, hops);
        
        // Detect and log anomalies
        const anomalies = detectAnomalies(hops);
        if (anomalies.length > 0 && databaseLoggingEnabled) {
            await logAnomaly(target, hops, anomalies);
        }
        
        res.json({
            target,
            timestamp: new Date().toISOString(),
            hops,
            platform,
            anomalies: anomalies.length > 0 ? anomalies : undefined
        });
        
    } catch (error) {
        console.error('Traceroute error:', error);
        
        // Check if it's a timeout
        if (error.killed && error.signal === 'SIGTERM') {
            return res.status(504).json({ 
                error: 'Traceroute timeout',
                message: 'Traceroute took too long to complete'
            });
        }
        
        res.status(500).json({ 
            error: 'Traceroute failed',
            message: error.message || 'An error occurred during traceroute'
        });
    }
});

// Get anomalies with filtering
app.get('/api/anomalies', async (req, res) => {
    try {
        const {
            target,
            issue_type,
            hours = 24,
            limit = 100,
            hop,
            min_latency,
            max_latency
        } = req.query;
        
        let query = `
            SELECT ne.*, 
                   eh.ip_address as problem_hop_ip,
                   eh.hostname as problem_hop_hostname,
                   eh.latency_ms as problem_hop_latency
            FROM network_events ne
            LEFT JOIN event_hops eh ON ne.id = eh.event_id AND ne.problematic_hop = eh.hop_number
            WHERE ne.timestamp > NOW() - INTERVAL '${parseInt(hours)} hours'
        `;
        
        const params = [];
        let paramCount = 0;
        
        if (target) {
            paramCount++;
            query += ` AND ne.target = $${paramCount}`;
            params.push(target);
        }
        
        if (issue_type) {
            paramCount++;
            query += ` AND ne.issue_type = $${paramCount}`;
            params.push(issue_type);
        }
        
        if (hop) {
            paramCount++;
            query += ` AND ne.problematic_hop = $${paramCount}`;
            params.push(parseInt(hop));
        }
        
        if (min_latency) {
            paramCount++;
            query += ` AND eh.latency_ms >= $${paramCount}`;
            params.push(parseFloat(min_latency));
        }
        
        if (max_latency) {
            paramCount++;
            query += ` AND eh.latency_ms < $${paramCount}`;
            params.push(parseFloat(max_latency));
        }
        
        query += ` ORDER BY ne.timestamp DESC LIMIT $${paramCount + 1}`;
        params.push(parseInt(limit));
        
        const result = await pool.query(query, params);
        res.json({ anomalies: result.rows, count: result.rows.length });
        
    } catch (error) {
        console.error('Query anomalies error:', error);
        res.status(500).json({ error: 'Failed to query anomalies', message: error.message });
    }
});

// Get full hop path for a specific event
app.get('/api/anomalies/:id/hops', async (req, res) => {
    try {
        const eventId = parseInt(req.params.id);
        
        const result = await pool.query(`
            SELECT 
                ne.timestamp,
                ne.target,
                ne.issue_type,
                ne.problematic_hop,
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
            WHERE ne.id = $1
            GROUP BY ne.id, ne.timestamp, ne.target, ne.issue_type, ne.problematic_hop
        `, [eventId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        res.json(result.rows[0]);
        
    } catch (error) {
        console.error('Get event hops error:', error);
        res.status(500).json({ error: 'Failed to get event hops', message: error.message });
    }
});

// Get cross-target hop analysis (hops affecting multiple targets)
app.get('/api/cross-target-hop-analysis', async (req, res) => {
    try {
        const { hours = 24, min_targets = 1 } = req.query;
        
        const result = await pool.query(`
            SELECT 
                hop_ip,
                hop_hostname,
                COUNT(DISTINCT target) as targets_affected,
                array_agg(DISTINCT target) as affected_targets,
                SUM(total_attempts) as total_attempts,
                SUM(total_losses) as total_losses,
                CASE 
                    WHEN SUM(total_attempts) > 0 
                    THEN (SUM(total_losses)::NUMERIC / SUM(total_attempts)::NUMERIC * 100)
                    ELSE 0 
                END as overall_packet_loss_pct,
                AVG(avg_latency) as avg_latency,
                MAX(max_latency) as max_latency,
                MIN(min_latency) as min_latency,
                MIN(timestamp_minute) as first_seen,
                MAX(timestamp_minute) as last_seen
            FROM hop_statistics
            WHERE timestamp_minute > NOW() - INTERVAL '${parseInt(hours)} hours'
              AND hop_ip IS NOT NULL
            GROUP BY hop_ip, hop_hostname
            HAVING COUNT(DISTINCT target) >= $1
            ORDER BY overall_packet_loss_pct DESC, targets_affected DESC
        `, [parseInt(min_targets)]);
        
        res.json({ 
            cross_target_hops: result.rows, 
            count: result.rows.length,
            period_hours: parseInt(hours)
        });
        
    } catch (error) {
        console.error('Get cross-target hop analysis error:', error);
        res.status(500).json({ error: 'Failed to get cross-target hop analysis', message: error.message });
    }
});

// Get per-hop packet loss statistics
app.get('/api/hop-packet-loss', async (req, res) => {
    try {
        const { target, hours = 24, hop_number } = req.query;
        
        let query = `
            SELECT 
                target,
                hop_number,
                hop_ip,
                hop_hostname,
                SUM(total_attempts) as total_attempts,
                SUM(total_losses) as total_losses,
                CASE 
                    WHEN SUM(total_attempts) > 0 
                    THEN (SUM(total_losses)::NUMERIC / SUM(total_attempts)::NUMERIC * 100)
                    ELSE 0 
                END as packet_loss_pct,
                AVG(avg_latency) as avg_latency,
                MIN(min_latency) as min_latency,
                MAX(max_latency) as max_latency,
                MIN(timestamp_minute) as first_seen,
                MAX(timestamp_minute) as last_seen
            FROM hop_statistics
            WHERE timestamp_minute > NOW() - INTERVAL '${parseInt(hours)} hours'
        `;
        
        const params = [];
        let paramCount = 0;
        
        if (target) {
            paramCount++;
            query += ` AND target = $${paramCount}`;
            params.push(target);
        }
        
        if (hop_number) {
            paramCount++;
            query += ` AND hop_number = $${paramCount}`;
            params.push(parseInt(hop_number));
        }
        
        query += `
            GROUP BY target, hop_number, hop_ip, hop_hostname
            ORDER BY packet_loss_pct DESC, total_attempts DESC
        `;
        
        const result = await pool.query(query, params);
        res.json({ 
            hop_statistics: result.rows, 
            count: result.rows.length,
            period_hours: parseInt(hours)
        });
        
    } catch (error) {
        console.error('Get hop packet loss error:', error);
        res.status(500).json({ error: 'Failed to get hop packet loss statistics', message: error.message });
    }
});

// Get hop statistics
app.get('/api/hop-stats', async (req, res) => {
    try {
        const { days = 30, limit = 20 } = req.query;
        
        const result = await pool.query(`
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
              AND ne.timestamp > NOW() - INTERVAL '${parseInt(days)} days'
            GROUP BY eh.hop_number, eh.hostname, eh.ip_address, ne.target
            ORDER BY problem_count DESC
            LIMIT $1
        `, [parseInt(limit)]);
        
        res.json({ hop_stats: result.rows, count: result.rows.length });
        
    } catch (error) {
        console.error('Get hop stats error:', error);
        res.status(500).json({ error: 'Failed to get hop statistics', message: error.message });
    }
});

// Get anomaly timeline (for charting)
app.get('/api/anomaly-timeline', async (req, res) => {
    try {
        const { hours = 24, interval = 'hour' } = req.query;
        
        const validIntervals = ['hour', 'day'];
        const timeInterval = validIntervals.includes(interval) ? interval : 'hour';
        
        const result = await pool.query(`
            SELECT 
                date_trunc($1, timestamp) AS time_bucket,
                COUNT(*) as anomaly_count,
                issue_type,
                target
            FROM network_events
            WHERE timestamp > NOW() - INTERVAL '${parseInt(hours)} hours'
            GROUP BY time_bucket, issue_type, target
            ORDER BY time_bucket DESC
        `, [timeInterval]);
        
        res.json({ timeline: result.rows, count: result.rows.length });
        
    } catch (error) {
        console.error('Get timeline error:', error);
        res.status(500).json({ error: 'Failed to get timeline', message: error.message });
    }
});

// Export anomalies to CSV
app.get('/api/export/anomalies', async (req, res) => {
    try {
        const { hours = 24, target } = req.query;
        
        let query = `
            SELECT 
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
            WHERE ne.timestamp > NOW() - INTERVAL '${parseInt(hours)} hours'
        `;
        
        const params = [];
        if (target) {
            query += ' AND ne.target = $1';
            params.push(target);
        }
        
        query += ' ORDER BY ne.timestamp DESC';
        
        const result = await pool.query(query, params);
        
        // Generate CSV
        const headers = ['Timestamp', 'Target', 'Issue Type', 'Problematic Hop', 'Avg Latency', 'Packet Loss %', 'Problem Hop IP', 'Problem Hop Hostname', 'Problem Hop Latency'];
        const csvRows = [headers.join(',')];
        
        for (const row of result.rows) {
            const values = [
                row.timestamp,
                row.target,
                row.issue_type,
                row.problematic_hop || '',
                row.avg_latency ? parseFloat(row.avg_latency).toFixed(2) : '',
                row.packet_loss_pct ? parseFloat(row.packet_loss_pct).toFixed(2) : '',
                row.problem_hop_ip || '',
                row.problem_hop_hostname || '',
                row.problem_hop_latency ? parseFloat(row.problem_hop_latency).toFixed(2) : ''
            ];
            csvRows.push(values.join(','));
        }
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=anomalies_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvRows.join('\n'));
        
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export data', message: error.message });
    }
});

// Database status endpoint
app.get('/api/database/status', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({
            connected: true,
            logging_enabled: databaseLoggingEnabled,
            timestamp: result.rows[0].now
        });
    } catch (error) {
        res.json({
            connected: false,
            logging_enabled: databaseLoggingEnabled,
            error: error.message
        });
    }
});

// Delete data within date range
app.delete('/api/database/cleanup', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'start_date and end_date are required' });
        }
        
        // Delete from network_events (CASCADE will delete event_hops automatically)
        const eventsResult = await pool.query(
            `DELETE FROM network_events 
             WHERE timestamp >= $1 AND timestamp <= $2 
             RETURNING id`,
            [start_date, end_date]
        );
        
        // Delete from hop_statistics
        const statsResult = await pool.query(
            `DELETE FROM hop_statistics 
             WHERE timestamp_minute >= $1 AND timestamp_minute <= $2`,
            [start_date, end_date]
        );
        
        console.log(`🗑️  Deleted ${eventsResult.rowCount} events and ${statsResult.rowCount} hop statistics records`);
        
        res.json({
            success: true,
            events_deleted: eventsResult.rowCount,
            hop_stats_deleted: statsResult.rowCount,
            message: `Deleted data from ${start_date} to ${end_date}`
        });
        
    } catch (error) {
        console.error('Database cleanup error:', error);
        res.status(500).json({ error: 'Failed to clean up database', message: error.message });
    }
});

// Toggle database logging
app.post('/api/database/logging', (req, res) => {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    
    databaseLoggingEnabled = enabled;
    console.log(`📊 Database logging ${enabled ? 'ENABLED' : 'DISABLED'}`);
    
    res.json({
        logging_enabled: databaseLoggingEnabled,
        message: `Database logging ${enabled ? 'enabled' : 'disabled'}`
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'connectivity-monitor-backend',
        platform: process.platform
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`╔════════════════════════════════════════════════╗`);
    console.log(`║  Connectivity Monitor Backend Server          ║`);
    console.log(`║  Running on http://localhost:${PORT}            ║`);
    console.log(`║  Platform: ${process.platform.padEnd(36)}║`);
    console.log(`╚════════════════════════════════════════════════╝`);
    console.log(`\nEndpoints:`);
    console.log(`  GET /health - Health check`);
    console.log(`  GET /api/traceroute/:target - Run traceroute`);
    console.log(`\nAnomaly Tracking (>200ms latency, timeouts):`);
    console.log(`  GET /api/anomalies - Get anomalies with filtering`);
    console.log(`  GET /api/anomalies/:id/hops - Get full hop path for event`);
    console.log(`  GET /api/hop-stats - Get problem hop statistics`);
    console.log(`  GET /api/anomaly-timeline - Get timeline data for charting`);
    console.log(`  GET /api/export/anomalies - Export anomalies to CSV\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    process.exit(0);
});
