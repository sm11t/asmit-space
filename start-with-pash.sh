#!/bin/bash
# Start asmit.space website with Pash integration

echo "🚀 Starting asmit.space with Pash integration"
echo ""

# Check if Pash backend is running
if ! lsof -ti:8000 > /dev/null; then
    echo "⚠️  Pash backend not running on port 8000"
    echo ""
    echo "In a separate terminal, run:"
    echo "  cd /Users/sm1t/Code/pash/backend"
    echo "  source venv/bin/activate"
    echo "  uvicorn main:app --port 8000 --reload"
    echo ""
    echo "Press Enter when backend is ready, or Ctrl+C to exit..."
    read
else
    echo "✅ Pash backend is running on port 8000"
fi

# Check if Pash worker is running (optional)
echo ""
echo "💡 Optional: Start Pash worker for audio processing"
echo "   In a separate terminal:"
echo "     cd /Users/sm1t/Code/pash/backend/worker"
echo "     source ../venv/bin/activate"
echo "     python worker.py"
echo ""

# Start the Express server
echo "🌐 Starting Express server with routing..."
echo ""
node server.js
