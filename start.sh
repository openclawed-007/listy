#!/bin/bash

# Shopping List - Easy Start Script

echo "🚀 Starting Shopping List Setup..."

# 1. Check if node_modules exists, if not install
if [ ! -d "node_modules" ]; then
    echo "📦 node_modules not found. Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed."
fi

# 2. Check for Firebase config
if grep -q "YOUR_API_KEY" src/firebase.ts; then
    echo "⚠️  Note: You haven't updated your Firebase config in src/firebase.ts yet."
    echo "   The app will start, but login/database features will require valid keys."
fi

echo "🌐 Starting development server at http://localhost:5173"
echo "💡 Press Ctrl+C to stop everything."

# 3. Start the dev server
# We use 'exec' so that signals (like Ctrl+C) are passed directly to vite
npm run dev
