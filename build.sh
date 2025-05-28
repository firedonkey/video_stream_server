#!/bin/bash

# Check if we're in production
if [ "$ENVIRONMENT" = "production" ]; then
    # In production, copy frontend files to backend directory
    echo "Production environment detected. Copying frontend files to backend directory..."
    cp -r frontend/* backend/frontend/
else
    echo "Development environment detected. Using frontend files from root directory."
fi

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
python3 -m pip install -r requirements.txt

echo "Build completed successfully!" 