# Internet Connectivity Monitor with Real Traceroute

A standalone browser-based connectivity monitor with real traceroute functionality via a minimal backend server.

## Features

- 🌐 **Real-time Connectivity Monitoring**
  - Monitor multiple targets simultaneously
  - Visual latency graphs with Chart.js
  - Automatic outage detection and tracking
  
- 🔍 **Real Traceroute**
  - Actual network path analysis (not simulated)
  - Hop-by-hop latency measurements
  - Works with any target (domains or IP addresses)
  
- 📊 **Statistics Dashboard**
  - Uptime percentage
  - Packet loss rate
  - Outage history with duration tracking
  - Consecutive failure counter

- ⚡ **Lightweight & Simple**
  - Single HTML file for the frontend
  - Minimal backend (just Express + system traceroute)
  - No database required
  - Easy setup

## Quick Start

### 1. Install Dependencies

```bash
# In the WebPing directory
npm install --prefix . express cors
```

Or if you prefer using the package.json:

```bash
# Copy the package file
cp monitor-backend-package.json package.json

# Install dependencies
npm install
```

### 2. Start the Backend Server

```bash
node monitor-backend.js
```

You should see:
```
╔════════════════════════════════════════════════╗
║  Connectivity Monitor Backend Server          ║
║  Running on http://localhost:3002              ║
║  Platform: darwin                              ║
╚════════════════════════════════════════════════╝

Endpoints:
  GET /health - Health check
  GET /api/traceroute/:target - Run traceroute
```

### 3. Open the Monitor

Open `connectivity-monitor.html` in your browser (Chrome, Firefox, Safari, etc.)

The monitor will start automatically and begin tracking connectivity.

### 4. Run Traceroute

Click the **"Run Traceroute"** button in the Control Panel.

The first time you run traceroute without the backend running, you'll see helpful instructions on how to start it.

## Usage

### Monitoring

The monitor automatically pings configured targets every 3 seconds:
- **Google** (https://www.google.com) - Primary target
- **Cloudflare DNS** (https://1.1.1.1) - Primary target

**Adding Targets:**
1. Enter a URL in the input field (e.g., `https://example.com`)
2. Click "Add Target"
3. The new target will be monitored immediately

**Removing Targets:**
- Click the "Remove" button on any target card
- Note: You must keep at least one primary target

### Outage Detection

The monitor detects connectivity problems by:
1. Tracking consecutive failures
2. Alerting after 3 consecutive failures
3. Recording outage start time and duration
4. Notifying when connectivity is restored

### Traceroute

Traceroute shows the network path from your computer to the target:

1. Click "Run Traceroute" button
2. Wait 30-60 seconds for completion
3. View hop-by-hop results showing:
   - Hop number (router sequence)
   - IP address
   - Hostname (if available)
   - Latency per hop

**Interpreting Results:**
- High latency at a specific hop indicates a bottleneck
- Timeouts (`* * *`) may indicate firewalls or filtered routers
- Compare multiple traceroutes to identify persistent issues

## Architecture

```
┌─────────────────────────────────────┐
│  Browser (connectivity-monitor.html)│
│  - Connectivity monitoring          │
│  - Visual dashboard                 │
│  - Chart.js graphs                  │
└────────────┬────────────────────────┘
             │
             │ HTTP Request
             │ GET /api/traceroute/:target
             ▼
┌─────────────────────────────────────┐
│  Backend (monitor-backend.js:3002)  │
│  - Express server                   │
│  - CORS enabled                     │
│  - Input validation                 │
└────────────┬────────────────────────┘
             │
             │ executes
             ▼
┌─────────────────────────────────────┐
│  System Traceroute Command          │
│  - macOS/Linux: traceroute          │
│  - Windows: tracert                 │
└─────────────────────────────────────┘
```

## API Reference

### Backend Endpoints

#### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "connectivity-monitor-backend",
  "platform": "darwin"
}
```

#### GET /api/traceroute/:target
Run traceroute to specified target.

**Parameters:**
- `target` (URL parameter): Domain name or IP address

**Example:**
```bash
curl http://localhost:3002/api/traceroute/google.com
```

**Success Response:**
```json
{
  "target": "google.com",
  "timestamp": "2025-10-24T17:30:00.000Z",
  "hops": [
    {
      "hop": 1,
      "ip": "192.168.1.1",
      "hostname": "router.local",
      "latency": 2.5,
      "timeout": false
    },
    ...
  ],
  "platform": "darwin"
}
```

**Error Response:**
```json
{
  "error": "Traceroute failed",
  "message": "Invalid target"
}
```

## Configuration

### Backend Configuration

Edit `monitor-backend.js` to change:

```javascript
const PORT = 3002;  // Change server port
```

### Traceroute Timeout

Modify traceroute parameters in `monitor-backend.js`:

```javascript
// macOS/Linux
command = `traceroute -m 15 -w 2 ${target}`;
// -m 15: max 15 hops
// -w 2: 2 second timeout per hop

// Windows
command = `tracert -h 15 -w 2000 ${target}`;
// -h 15: max 15 hops
// -w 2000: 2000ms timeout per hop
```

### Frontend Configuration

Edit `connectivity-monitor.html` constants:

```javascript
const PING_INTERVAL = 3000;        // Ping interval (ms)
const FAILURE_THRESHOLD = 3;       // Alert after N failures
const TIMEOUT = 5000;              // Ping timeout (ms)
```

## Troubleshooting

### Backend Won't Start

**Error: `Cannot find module 'express'`**
```bash
npm install express cors
```

**Error: `Port 3002 already in use`**
- Change PORT in `monitor-backend.js`
- Or stop the process using port 3002

### Traceroute Issues

**Error: "Cannot connect to backend server"**
- Ensure backend is running: `node monitor-backend.js`
- Check if port 3002 is accessible
- Verify no firewall blocking localhost:3002

**Error: "Traceroute failed"**
- Some networks block ICMP packets
- Corporate firewalls may prevent traceroute
- Try different targets (e.g., 8.8.8.8)

**Traceroute permission issues (Linux/macOS):**
```bash
# If you get permission errors, run with sudo
sudo node monitor-backend.js
```

### Browser Issues

**Ping not working:**
- Browsers can only measure HTTP request timing, not true ICMP ping
- This is normal behavior due to browser security
- The latency measurements are still useful for monitoring

**CORS errors:**
- Ensure backend is running
- Backend has CORS enabled by default
- Check browser console for specific errors

## Best Practices

### For Internet Connectivity Monitoring

1. **Multi-Level Targets:**
   - Add your ISP's DNS server
   - Add a public DNS (Google: 8.8.8.8, Cloudflare: 1.1.1.1)
   - Add your router's local IP (e.g., 192.168.1.1)

2. **Pattern Detection:**
   - Monitor over several days
   - Look for time-of-day patterns
   - Check if issues coincide with high usage

3. **Outage Documentation:**
   - Take screenshots during outages
   - Run traceroute when issues occur
   - Compare "healthy" vs "problem" traceroutes

### For Traceroute Analysis

1. **Compare Multiple Runs:**
   - Run traceroute during normal operation
   - Run again during connectivity issues
   - Compare the network paths

2. **Identify Problematic Hops:**
   - Look for sudden latency increases
   - Check if specific ISP routers are slow
   - Note which hop the connection fails at

3. **Understanding Timeouts:**
   - Some routers don't respond to traceroute
   - This doesn't always mean a problem
   - Look at the overall path, not individual timeouts

## System Requirements

- **Node.js**: Version 14 or higher
- **Operating System**: macOS, Linux, or Windows
- **Browser**: Modern browser (Chrome, Firefox, Safari, Edge)
- **Network**: `traceroute` command available (usually pre-installed)

## Port Usage

- **Backend Server**: Port 3002 (configurable)
- **Frontend**: No server required (opens directly in browser)

## Security Notes

- Backend validates targets to prevent command injection
- CORS enabled for localhost development
- For production use, add authentication and rate limiting
- Consider restricting CORS to specific origins

## License

MIT

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Verify backend is running and accessible
3. Check browser console for error messages
4. Review backend terminal output for error logs
