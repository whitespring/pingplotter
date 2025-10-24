#!/bin/bash

# PingPlotter Startup Script for macOS/Linux
# This script starts the backend server and opens the frontend in the browser

echo "╔════════════════════════════════════════════════╗"
echo "║        PingPlotter - Network Analyzer          ║"
echo "║              Starting up...                    ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js found: $(node --version)"

# Check if npm packages are installed
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to install dependencies"
        exit 1
    fi
fi

echo "✓ Dependencies installed"
echo ""

# Kill any existing backend process
echo "🔄 Stopping any existing backend..."
pkill -f "node monitor-backend.js" 2>/dev/null

# Wait a moment for the process to stop
sleep 1

# Start the backend server in the background
echo "🚀 Starting backend server..."
node monitor-backend.js &
BACKEND_PID=$!

# Wait for backend to be ready (max 10 seconds)
echo "⏳ Waiting for backend to start..."
for i in {1..20}; do
    if curl -s http://localhost:3002/health > /dev/null 2>&1; then
        echo "✓ Backend server is running (PID: $BACKEND_PID)"
        break
    fi
    if [ $i -eq 20 ]; then
        echo "❌ Error: Backend failed to start within 10 seconds"
        kill $BACKEND_PID 2>/dev/null
        exit 1
    fi
    sleep 0.5
done

echo ""
echo "🌐 Opening PingPlotter in browser..."
sleep 1

# Open the HTML file in the default browser
if command -v open &> /dev/null; then
    # macOS
    open pingplotter.html
elif command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open pingplotter.html
else
    echo "⚠️  Could not open browser automatically"
    echo "Please open pingplotter.html manually"
fi

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║           PingPlotter is now running!          ║"
echo "║                                                ║"
echo "║  Backend:  http://localhost:3002               ║"
echo "║  Frontend: pingplotter.html (opened)           ║"
echo "║                                                ║"
echo "║  Press Ctrl+C to stop the backend server       ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Keep the script running and forward signals to backend
trap "echo ''; echo '🛑 Stopping backend server...'; kill $BACKEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Wait for the backend process
wait $BACKEND_PID
