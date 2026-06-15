#!/bin/bash
set -e

echo "🎙 ZoomScribe — Starting..."
echo ""

if [ -f .env ]; then
  echo "🔧 Loading .env..."
  set -a
  . ./.env
  set +a
fi

# Install Python deps
echo "📦 Installing Python dependencies..."
pip install -r backend/requirements.txt -q

# Install Node deps
echo "📦 Installing Node dependencies..."
cd frontend && npm install --silent && cd ..

echo ""
echo "✅ Dependencies installed!"
echo ""
echo "🚀 Backend  → http://localhost:8000"
echo "🌐 Frontend → http://localhost:5173"
echo ""

# Start both servers
npx concurrently \
  --names "backend,frontend" \
  --prefix-colors "blue,green" \
  "cd backend && uvicorn main:app --reload --port 8000" \
  "cd frontend && npm run dev"
