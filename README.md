# APIFlow — Web-based API Tester

A web-based API testing tool with collection management, request builder, and execution history.

## Tech Stack
- **Frontend**: Angular 17
- **Backend**: Node.js + Express
- **Database**: SQLite (via better-sqlite3)

## Project Structure

```
ai_powered_api_tester/
├── backend/
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       ├── models/
│       ├── database/
│       └── utils/
└── frontend/
    ├── package.json
    └── src/
        └── app/
            ├── components/navbar/
            ├── pages/home/
            ├── pages/request-builder/
            ├── pages/collections/
            ├── pages/scenario-runner/  (locked)
            └── services/
```

## Getting Started

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm start
```

Backend runs on `http://localhost:3000`  
Frontend runs on `http://localhost:4200`

## Features

| Feature             | Status      |
|---------------------|-------------|
| Request Builder     | ✅ Active   |
| Request Saving      | ✅ Active   |
| Collection Manager  | ✅ Active   |
| Response Viewer     | ✅ Active   |
| AI Scenario Agent   | 🔒 Locked   |

## Locked Feature — AI Scenario Agent

Planned for a future version. The AI agent will analyze natural language test scenarios, identify matching requests from saved collections, generate multi-step API workflows, and validate expected outcomes automatically.
