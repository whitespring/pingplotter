# PingPlotter - Network Monitoring Tool

A real-time network monitoring and traceroute visualization tool with anomaly detection, database tracking, and interactive analysis features.

## Features

### Live Monitoring
- Multi-target network monitoring with configurable trace intervals (2-30 seconds)
- Real-time traceroute visualization with hop-by-hop latency tracking
- Interactive latency timeline charts
- Packet loss percentage tracking per hop
- Color-coded status indicators (Good/Warning/Critical)

### Database Analysis
- Historical anomaly tracking (high latency, timeouts, packet loss)
- Cross-target hop analysis - identify problematic network hops affecting multiple destinations
- Interactive chart filtering - click charts to filter data
- Sortable data tables with multiple filters
- Time range selection (10 minutes to 1 week)
- CSV export functionality

### Anomaly Detection
- Automatic detection of high latency (>200ms)
- Timeout detection with intelligent filtering (ignores ICMP-silent routers)
- Packet loss calculation excluding hops without IP addresses
- Per-hop statistics tracking with 1-minute aggregation

## Architecture

```
├── src/
│   ├── pingplotter.html      # Single-page application (frontend)
│   ├── monitor-backend.js    # Node.js backend server
│   ├── schema.sql           # PostgreSQL database schema
│   └── package.json         # Node.js dependencies
├── scripts/                  # Start/stop scripts
├── docs/                     # Documentation
└── .gitignore
```

## Prerequisites

### Option 1: Docker (Recommended)
- Docker and Docker Compose
- PostgreSQL database (external or via Docker)

### Option 2: Local Installation
- Node.js (v14 or higher)
- PostgreSQL database
- macOS, Linux, or Windows

## Installation

### Docker Deployment (Recommended)

The easiest way to run PingPlotter is using Docker. Pre-built multi-architecture images are available on Docker Hub.

#### Using Docker Compose (with Dockge or Standalone)

1. **Create a docker-compose.yml file:**

```yaml
version: '3.8'

services:
  pingplotter:
    image: netsaver/pingplotter:latest
    container_name: pingplotter
    ports:
      - "9911:9911"
    environment:
      - DATABASE_URL=postgresql://user:password@your-db-host:5432/pingplot
      - PORT=9911
      - NODE_ENV=production
    restart: always
```

2. **Configure your database:**
   - Update the `DATABASE_URL` with your PostgreSQL connection details
   - The database must be accessible from the container
   - Use `host.docker.internal` for databases on the same machine

3. **Start the container:**

```bash
docker-compose up -d
```

4. **Access PingPlotter:**
   - Open your browser to `http://localhost:9911`
   - The frontend is served directly by the backend

#### Using Docker CLI

```bash
docker run -d \
  --name pingplotter \
  -p 9911:9911 \
  -e DATABASE_URL=postgresql://user:password@your-db-host:5432/pingplot \
  -e PORT=9911 \
  --restart always \
  netsaver/pingplotter:latest
```

#### Supported Architectures

The Docker image supports:
- **linux/amd64** - Intel/AMD 64-bit processors
- **linux/arm64** - ARM 64-bit processors (Raspberry Pi, Apple Silicon, etc.)

#### Environment Variables

- `PORT` - Server port (default: 9911)
- `DATABASE_URL` - PostgreSQL connection string (**required**)
- `NODE_ENV` - Environment mode (default: production)

#### Docker Hub

**🎉 Live and Ready!** Pre-built multi-architecture images are available:

**Docker Hub**: https://hub.docker.com/r/netsaver/pingplotter

**Pull Command:**
```bash
docker pull netsaver/pingplotter:latest
```

**Available Tags:**
- `latest` - Latest stable version (recommended)

**Supported Platforms:**
- linux/amd64 (Intel/AMD 64-bit)
- linux/arm64 (ARM 64-bit, Raspberry Pi, Apple Silicon)

### Local Installation

#### 1. Clone the Repository

```bash
git clone https://github.com/whitespring/pingplotter.git
cd pingplotter
```

#### 2. Install Dependencies

```bash
cd src
npm install
```

#### 3. Set Up Database

Create a PostgreSQL database and run the schema:

```bash
psql -U postgres -d your_database < schema.sql
```

See [DATABASE-SETUP.md](DATABASE-SETUP.md) for detailed instructions.

#### 4. Configure Environment

Edit `src/.env` (or create it) with your database connection:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/pingplot
```

#### 5. Start the Backend

```bash
# From project root
./scripts/start-pingplotter.sh

# Or manually
cd src
node monitor-backend.js
```

#### 6. Open the Frontend

Open `src/pingplotter.html` in your web browser, or use:

```bash
open src/pingplotter.html  # macOS
```

## Building Docker Image

To build your own Docker image:

### Prerequisites
- Docker with buildx support
- Docker Hub account (for pushing)

### Build Scripts

**Unix/macOS:**
```bash
# Build and push multi-architecture image
cd docker
./scripts/build-and-push.sh

# Build specific version
./scripts/build-and-push.sh v1.0.0
```

**Windows:**
```cmd
cd docker
scripts\build-and-push.bat

REM Build specific version
scripts\build-and-push.bat v1.0.0
```

The build script will:
1. Create a buildx builder if needed
2. Build for AMD64 and ARM64 architectures
3. Push to Docker Hub automatically
4. Tag as both `latest` and your specified version

### Manual Build

```bash
# Build for local testing (single architecture)
docker build -f docker/Dockerfile -t pingplotter .

# Build and push multi-architecture
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t netsaver/pingplotter:latest \
  -f docker/Dockerfile \
  --push \
  .
```

## Quick Start Scripts (Local Installation)

### Unix/macOS
```bash
# Start monitoring
./scripts/start-pingplotter.sh

# Stop monitoring
./scripts/stop-pingplotter.sh
```

### Windows
```bash
# Start monitoring
scripts\start-pingplotter.bat

# Stop monitoring
scripts\stop-pingplotter.bat
```

## Usage

### Adding Targets

1. Click "+ Add Target" in the Live Monitoring tab
2. Enter a hostname or IP address (e.g., google.com, 8.8.8.8)
3. Click "Add"

### Monitoring Features

- **Live Tab**: Real-time traceroute visualization with latency graphs
- **Database Analysis Tab**: Historical data analysis with filtering and charts
- Click on any hop row to view its latency timeline
- Adjust trace interval from 2-30 seconds
- Pause/Resume database logging as needed

### Interactive Charts

In the Database Analysis tab:
- Click bars in "Hops by Target" to filter by target
- Click bars in "Delay Distribution" to filter by latency range
- Use time range and issue type filters for detailed analysis
- Export filtered results to CSV

## Configuration

### Backend (monitor-backend.js)

- `PORT`: Server port (default: 3002)
- `ANOMALY_THRESHOLDS.HIGH_LATENCY`: Latency threshold in ms (default: 200)
- `ANOMALY_THRESHOLDS.PACKET_LOSS`: Packet loss threshold % (default: 3)

### Database

Connection string format:
```
postgresql://user:password@host:port/database
```

## API Endpoints

### Traceroute
- `GET /api/traceroute/:target` - Run traceroute for target

### Anomalies
- `GET /api/anomalies` - Get anomalies with filtering
  - Query params: `target`, `issue_type`, `hours`, `limit`, `min_latency`, `max_latency`
- `GET /api/anomalies/:id/hops` - Get full hop path for event

### Statistics
- `GET /api/hop-stats` - Get problematic hop statistics
- `GET /api/cross-target-hop-analysis` - Get cross-target analysis
- `GET /api/hop-packet-loss` - Get per-hop packet loss data

### Database Management
- `GET /api/database/status` - Check database connection and logging status
- `POST /api/database/logging` - Toggle anomaly logging
- `GET /api/export/anomalies` - Export anomalies to CSV

## Database Schema

See [schema.sql](../src/schema.sql) for complete schema.

**Main Tables:**
- `network_events` - Anomaly events (high latency, timeouts, packet loss)
- `event_hops` - Individual hop data for each event
- `hop_statistics` - Aggregated per-hop statistics (per minute)

## Documentation

- [DATABASE-SETUP.md](DATABASE-SETUP.md) - Database configuration guide
- [ANOMALY-TRACKING-IMPLEMENTATION.md](ANOMALY-TRACKING-IMPLEMENTATION.md) - Technical details
- [MONITOR-README.md](MONITOR-README.md) - Monitoring features guide

## Troubleshooting

### Backend Not Starting
- Check if PostgreSQL is running
- Verify DATABASE_URL in environment or .env file
- Ensure port 3002 is available

### No Data Appearing
- Verify database connection in browser console
- Check backend terminal for errors
- Ensure traceroute command is available on your system

### CORS Errors
- Backend runs on localhost:3002
- Open HTML file directly or use a local web server

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript, Chart.js
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **Network Tools**: System traceroute command

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

[Your License Here]

## Repository

https://github.com/whitespring/pingplotter
