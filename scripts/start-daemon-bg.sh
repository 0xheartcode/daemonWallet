#!/bin/bash

# Start daemon in true background mode
DAEMON_PATH="$1"
LOG_FILE="$2"

# Export environment variable
export DAEMON_MODE=background

# Start daemon in background, redirect output to log, and fully detach
nohup node "$DAEMON_PATH" >> "$LOG_FILE" 2>&1 &

# Get the PID and save it
echo $! > ~/.daemon-wallet/daemon.pid

echo "Daemon started with PID: $!"