# RCA Agent — VS Code Ready

This project converts the supplied single React component into a proper full-stack app:

- `frontend/` — Vite + React UI
- `backend/` — Express API that securely calls Anthropic
- The Anthropic API key is **never exposed to the browser**
- `/api/health` verifies the backend configuration
- The diagnostic request uses structured JSON output validation
- The follow-up chat uses the same backend agent

The original UI/data model is preserved from the uploaded RCA agent. The main change is that the AI call now goes through the backend instead of calling Anthropic directly from the browser. The uploaded source itself currently calls the Anthropic Messages API from the React client, which is not appropriate for a real local app because the API credential would have to live client-side. fileciteturn0file0L180-L221

## 1. Requirements

Install:

- Node.js 20+ recommended
- An Anthropic API key

## 2. Open in VS Code

Open the **`rca-agent-vscode`** folder in VS Code.

You should see:

```text
rca-agent-vscode/
├── frontend/
│   ├── src/
│   │   ├── RCAAgent.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
├── backend/
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── README.md
```

## 3. Install dependencies

Open two VS Code terminals.

### Terminal 1 — backend

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and put your real Anthropic key in it:

```env
ANTHROPIC_API_KEY=your_real_key_here
ANTHROPIC_MODEL=claude-sonnet-5
PORT=4000
FRONTEND_ORIGIN=http://localhost:5173
```

Then run:

```bash
npm run dev
```

You should see:

```text
RCA backend running on http://localhost:4000
```

### Terminal 2 — frontend

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally:

```text
http://localhost:5173
```

## 4. Test the agent

1. Open the dashboard.
2. Click **Run diagnostic**.
3. Wait for the ranked root causes and recommendations.
4. Use **Ask the agent** for follow-up questions.

For example:

```text
Why did West decline so sharply?
```

or:

```text
Which issue should operations fix first?
```

## 5. Why the old version would fail

The uploaded component contains a browser-side function that directly sends requests to `https://api.anthropic.com/v1/messages`. fileciteturn0file0L181-L198

That creates three practical problems:

1. You need to expose an API credential to frontend code.
2. Browser CORS/security behavior can interfere with direct API calls.
3. There is no backend validation/rate/error boundary.

This version fixes that by making the browser call:

```text
React → /api/agent → Express → Anthropic → Express → React
```

## 6. Better agent behavior

The diagnostic prompt already asks the model to stay grounded in the supplied business statistics and return ranked causes/recommendations. fileciteturn0file0L208-L221

The backend additionally validates the analysis shape before returning it to the UI. That means a malformed AI response does not silently break the dashboard.

## 7. Change the model

You can change:

```env
ANTHROPIC_MODEL=claude-sonnet-5
```

without changing the React code.

Anthropic's current documentation describes `claude-sonnet-5` as the newer Sonnet model and documents migration from `claude-sonnet-4-6`. Verify the model available to your API account before switching. citeturn0search0

## 8. Production notes

Before deploying:

- Put the backend behind HTTPS.
- Restrict CORS to the actual frontend domain.
- Add authentication.
- Add rate limiting.
- Add request IDs/logging.
- Never commit `backend/.env`.
- Replace the deterministic dummy dataset with your real reviews/orders database or CSV ingestion layer.

## 9. Important

The dashboard is currently based on deterministic dummy business data. The data-generation logic is in `RCAAgent.jsx`; the supplied source creates four regions and a deliberately injected West-region anomaly so the agent has something meaningful to diagnose. fileciteturn0file0L30-L103

That is useful for the demo, but it is not yet a real customer-feedback/order-data pipeline. The next step for a production version would be to add CSV/database ingestion and have the backend compute the same statistics from real records.
