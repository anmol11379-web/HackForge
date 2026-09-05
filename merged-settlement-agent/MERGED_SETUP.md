# Merged Settlement Q&A Agent

This folder combines the standalone HTML interface with the Python FastAPI backend.

## Start

From this folder, install dependencies:

```powershell
python -m pip install -r requirements.txt
```

Configure the backend in `.env` if needed:

```env
LLM_PROVIDER=auto
GEMINI_API_KEY=your_key_here
# or GROQ_API_KEY=your_key_here
```

Start the application:

```powershell
python main.py
```

Open [http://localhost:8000](http://localhost:8000). The same FastAPI process serves the HTML frontend and the API.

Swagger documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

## What changed

- The browser no longer calls Gemini directly.
- The frontend sends questions to `POST /api/v1/settlements/query`.
- Gemini, Groq, or deterministic fallback runs in the Python backend.
- API keys remain server-side in `.env`.
- The frontend is served from `/` by FastAPI.

The table preview in the original HTML still contains its original sample rows. The investigation response now comes from the Python backend datasets.
