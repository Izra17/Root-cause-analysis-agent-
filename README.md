# RCA Agent 

This project converts the supplied single React component into a proper full-stack app:

- `frontend/` — Vite + React UI
- `backend/` — Express API that securely calls Google Gemini
- The Gemini API key is **never exposed to the browser**
- `/api/health` verifies the backend configuration
- The diagnostic request uses structured JSON output validation
- The follow-up chat uses the same backend agent

The original UI/data model is preserved from the uploaded RCA agent. The main change is that the AI call now goes through the backend instead of calling the AI provider directly from the browser. Calling an AI API from the React client directly is not appropriate for a real local app because the API credential would have to live client-side.

## Overview

### The problem

When a business metric moves unexpectedly — a region's sales decline sharply, returns spike, or a KPI drops — the underlying data usually exists somewhere, but finding *why* it happened is slow and manual. Someone has to dig through regional stats, compare them against historical baselines, and manually connect numbers to a plausible explanation before anyone can act. That process doesn't scale across many regions or metrics, and it delays the point at which operations, product, or marketing teams can actually respond.

### The solution

**RCA Agent** is a dashboard that automates the first pass of root cause analysis. It takes structured business statistics (currently a deterministic dummy dataset covering four regions, including a deliberately injected anomaly in the West region) and sends them to an AI model, which returns a ranked list of likely root causes along with recommended actions. Users can also ask natural-language follow-up questions — like *"Why did West decline so sharply?"* — and get grounded answers back from the same backend agent, without needing to write their own queries or dig through raw numbers themselves.

Architecturally, the AI call is kept entirely on the backend (Express) rather than the browser, so the API key is never exposed to the client and the response shape is validated before it reaches the UI — meaning a malformed AI response can't silently break the dashboard.

## 1. Requirements

Install:

- Node.js 20+ recommended
- A Google Gemini API key

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

Copy `.env.example` to `.env` and put your real Gemini key in it:

```env
GEMINI_API_KEY=your_real_key_here
GEMINI_MODEL=gemini-3.6-flash
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

A browser-side function that directly sends requests to an AI provider's API creates three practical problems:

1. You need to expose an API credential to frontend code.
2. Browser CORS/security behavior can interfere with direct API calls.
3. There is no backend validation/rate/error boundary.

This version fixes that by making the browser call:

```text
React → /api/agent → Express → Gemini → Express → React
```

## 6. Better agent behavior

The diagnostic prompt asks the model to stay grounded in the supplied business statistics and return ranked causes/recommendations.

The backend additionally validates the analysis shape before returning it to the UI. That means a malformed AI response does not silently break the dashboard.

## 7. Change the model

You can change:

```env
GEMINI_MODEL=gemini-3.6-flash
```

without changing the React code.

Google's documentation lists `gemini-3.6-flash` as part of the current Gemini 3.x Flash line, optimized for multi-step orchestration, coding, and general reasoning. Verify the model available to your API account before switching.

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

The dashboard is currently based on deterministic dummy business data. The data-generation logic is in `RCAAgent.jsx`; the supplied source creates four regions and a deliberately injected West-region anomaly so the agent has something meaningful to diagnose.

That is useful for the demo, but it is not yet a real customer-feedback/order-data pipeline. The next step for a production version would be to add CSV/database ingestion and have the backend compute the same statistics from real records.
