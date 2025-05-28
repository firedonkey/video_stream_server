#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Define source and destination directories
FRONTEND_SRC="$SCRIPT_DIR/../frontend"
FRONTEND_DST="$SCRIPT_DIR/frontend"

# Remove existing frontend directory if it exists
if [ -d "$FRONTEND_DST" ]; then
    rm -rf "$FRONTEND_DST"
fi

# Copy frontend files
cp -r "$FRONTEND_SRC" "$FRONTEND_DST"

echo "Frontend files copied successfully to $FRONTEND_DST" 