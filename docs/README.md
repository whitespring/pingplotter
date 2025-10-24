# WebPing - Network Monitoring Application

A proof of concept for a network monitoring application with multi-target ping monitoring, traceroute capabilities, and NocoDB integration.

## Features

- Multi-target ping monitoring with configurable intervals
- Real-time data visualization with charts
- Traceroute functionality for network path analysis
- PostgreSQL/TimescaleDB for time-series data storage
- NocoDB integration for data management and dashboards
- WebSocket-based real-time updates

## Architecture

The application consists of:

1. **Frontend**: React application for user interface
2. **Backend**: Node.js/Express server with WebSocket support
3. **Database**: PostgreSQL with TimescaleDB extension
4. **Task Queue**: Redis with BullMQ for background jobs
5. **NocoDB**: For data management and dashboard visualization

## Prerequisites

- Docker and Docker Compose (recommended)
- Node.js (for local development)
- npm or yarn

## Installation Options

### Option 1: Using Docker (Recommended)

If you have Docker installed, you can run the complete application with all services:

1. Start the services:
   ```bash
   docker compose up -d
   ```

2. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

### Option 2: Local Development Setup

If you don't have Docker, you can run the services locally:

1. Install PostgreSQL with TimescaleDB extension:
   - Download and install PostgreSQL from https://www.postgresql.org/download/
   - Install TimescaleDB extension from https://docs.timescale.com/getting-started/latest/
   - Create a database named "webping" with username "postgres" and password "password"

2. Install Redis:
   - Download and install Redis from https://redis.io/download/
   - Start Redis server with `redis-server`

3. Run backend:
   ```bash
   cd backend
   npm install
   npm start
   ```

4. Run frontend:
   ```bash
   cd frontend
   npm install
   npm start
   ```

5. Access the application at http://localhost:3000

## Setup and Installation

### 1. Start the Services

```bash
docker-compose up -d
```

This will start:
- PostgreSQL with TimescaleDB
- Redis
- Backend service
- Frontend service

### 2. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

### 3. NocoDB Integration

To integrate with your existing NocoDB:

1. Open your NocoDB instance
2. Create a new project and connect to the PostgreSQL database:
   - Host: localhost
   - Port: 5432
   - Database: webping
   - Username: postgres
   - Password: password
3. NocoDB will automatically detect the tables:
   - `ping_results`: Stores ping monitoring data
   - `traceroute_results`: Stores traceroute data
4. Create views and dashboards in NocoDB to visualize the data

## API Endpoints

### Targets Management
- `GET /api/targets` - Get all monitoring targets
- `POST /api/targets` - Add a new target
- `DELETE /api/targets/:target` - Remove a target

### Data Retrieval
- `GET /api/results/:target` - Get ping results for a target
- `GET /api/traceroute/:target` - Get traceroute results for a target

## Development

### Backend Development

```bash
cd backend
npm install
npm run dev
```

### Frontend Development

```bash
cd frontend
npm install
npm start
```

## Database Schema

### ping_results
```sql
CREATE TABLE ping_results (
  id SERIAL PRIMARY KEY,
  target TEXT NOT NULL,
  latency FLOAT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT
);
```

### traceroute_results
```sql
CREATE TABLE traceroute_results (
  id SERIAL PRIMARY KEY,
  target TEXT NOT NULL,
  hop_number INTEGER,
  ip_address TEXT,
  latency FLOAT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Environment Variables

### Backend
- `DATABASE_URL`: PostgreSQL connection string (default: postgresql://postgres:password@database:5432/webping)
- `REDIS_URL`: Redis connection string (default: redis://redis:6379)
- `PORT`: Server port (default: 3001)

### Frontend
- `REACT_APP_API_URL`: Backend API URL (default: http://localhost:3001)

## Using an External PostgreSQL Database

To use an external PostgreSQL database instead of the one provided in Docker Compose:

1. Edit the `backend/.env` file
2. Uncomment and modify the DATABASE_URL line with your external database connection details:
   ```
   DATABASE_URL=postgresql://username:password@your-external-host:5432/your-database-name
   ```
3. Make sure your external database has the TimescaleDB extension installed
4. Run the application with `docker-compose up -d`

The application will automatically connect to your external database while still using the Redis container provided in Docker Compose.

## How It Works

1. **Ping Monitoring**: The backend uses a job queue to periodically ping configured targets and store results in the database.
2. **Traceroute**: When a new target is added, a traceroute is performed and results are stored.
3. **Real-time Updates**: WebSocket connections push updates to connected clients.
4. **Data Visualization**: The frontend displays real-time charts and tables.
5. **NocoDB Integration**: NocoDB connects directly to the PostgreSQL database to provide additional data management capabilities.

## Future Enhancements

- Authentication and user management
- Alerting system (email, SMS, etc.)
- More advanced data analysis and filtering
- Mobile-responsive design
- Export capabilities
- Historical data analysis
