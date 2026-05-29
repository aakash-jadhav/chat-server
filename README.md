# Secure P2P Chat — Server

The **backend** of Secure P2P Chat: a temporary, real-time messaging app where users connect via **6-digit codes**, accept or reject chat requests, and hold **multiple simultaneous conversations** — without storing identity in the browser.

This package is the **Node/Express + Socket.io API** that powers the [client](../client). It issues anonymous sessions, signs identity into an **HTTP-only JWT cookie**, brokers connection requests, relays messages in real time, and persists everything to **MongoDB Atlas** with TTL-based auto-expiry.

> This is one half of a monorepo. For the full system overview, architecture diagram, and end-to-end workflow, see the [root README](../README.md).

---

## What it does

| Responsibility | Description |
|----------------|-------------|
| **Anonymous sessions** | `/api/init` creates or restores a session, generates a unique 6-digit code, and sets an HTTP-only cookie. |
| **Cookie-based auth** | A JWT containing the `sessionId` is signed into an `HttpOnly`, `SameSite=Strict` cookie and validated against MongoDB on every request and socket handshake. |
| **Connection brokering** | Handles `connect-request` / `respond-request`, enforcing a **3-hour lockout** on rejected senders. |
| **Real-time messaging** | Saves messages to MongoDB and relays them instantly to the recipient over WebSockets. |
| **Live presence & names** | Pushes connection updates and display-name changes to connected peers without polling. |
| **Auto-expiring data** | MongoDB **TTL indexes** clean up sessions, messages, and rejection logs automatically — no cron jobs. |

---

## How the backend is built

The server is an **Express 5** application that shares a single HTTP server with **Socket.io 4**. REST endpoints handle bootstrapping and data hydration, while the socket layer handles all live interactions. **Mongoose** models define the schemas and their TTL indexes, and a small config layer loads environment variables and resolves the MongoDB connection (with a Windows-friendly SRV-DNS fallback).

### Tech & libraries

| Technology | Role |
|------------|------|
| **Node.js (ESM)** | Runtime; `node --watch` for dev reloads |
| **Express 5** | REST API, routing, CORS, cookie handling |
| **Socket.io 4** | WebSocket server; cookie auth on handshake |
| **Mongoose 8** | MongoDB schemas, queries, and TTL indexes |
| **jsonwebtoken** | Signs the `sessionId` into an HTTP-only cookie |
| **cookie-parser** / **cookie** | Reads the session cookie on HTTP and socket handshakes |
| **cors** | Restricts credentialed requests to `CLIENT_URL` |
| **dotenv** | Loads configuration from `server/.env` |

### Data model (MongoDB Atlas)

| Collection | Stores | Auto-delete (TTL) |
|------------|--------|-------------------|
| **sessions** | User code, name, socket id | 30 days |
| **messages** | Chat text between two users | 30 days |
| **requestlogs** (rejected) | Rejection lockout records | 3 hours |
| **connections** | Accepted peer links | No TTL (cleared on wipe / session expiry) |

### Project structure

```
server/
├── .env.example            # Template for required environment variables
└── src/
    ├── index.js            # Express + Socket.io entry point
    ├── routes/
    │   └── api.js          # REST routes (/api/*)
    ├── socket/
    │   └── index.js        # Real-time event handlers
    ├── middleware/
    │   └── auth.js         # JWT cookie verification
    ├── models/             # Mongoose schemas + TTL indexes
    │   ├── Session.js
    │   ├── Connection.js
    │   ├── Message.js
    │   └── RequestLog.js
    ├── config/
    │   ├── env.js          # Loads + validates env vars
    │   ├── db.js           # Mongoose connection
    │   └── resolveMongoUri.js  # SRV-DNS fallback for Windows
    └── utils/
        ├── jwt.js          # Sign/verify helpers
        └── generateCode.js # Unique 6-digit code generator
```

### REST endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/init` | Create or restore session; sets cookie |
| `POST` | `/api/logout` | Clear cookie; delete session |
| `POST` | `/api/clear-session` | Wipe user data; new session + cookie |
| `GET` | `/api/connections` | List accepted peers (auth required) |
| `GET` | `/api/messages/:peerId` | Message history for a peer |

### Socket events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `connect-request` | Client → Server | Request a chat via code |
| `respond-request` | Client → Server | Accept or reject a request |
| `incoming-request` | Server → Client | Show request modal |
| `connection-success` / `connections-updated` / `connections-sync` | Server → Client | Peer list updates |
| `send-message` | Client → Server | Save + relay a message |
| `message-received` / `message-sent` | Server → Client | Update chat UI |
| `update-name` | Client → Server | Rename + notify peers |
| `peer-name-updated` | Server → Client | Sidebar name update |

---

## How to run

### Prerequisites

- **Node.js 18+**
- A **MongoDB Atlas** cluster ([free tier](https://www.mongodb.com/cloud/atlas) works)

### 1. Configure environment

Copy the example file and fill in your values:

```powershell
cd C:\Programming\Chat\server
copy .env.example .env
```

| Variable | Description |
|----------|-------------|
| `PORT` | API port (default `5000`) |
| `MONGODB_URI` | Atlas connection string (include `/secure-p2p-chat`) |
| `JWT_SECRET` | Long random secret for signing cookies |
| `CLIENT_URL` | Frontend origin for CORS (default `http://localhost:5173`) |
| `NODE_ENV` | `development` or `production` |
| `MONGODB_URI_STANDARD` | Optional fallback if SRV DNS lookup fails on Windows |

**Atlas one-time setup:** allow your IP under **Network Access**, create a read/write user under **Database Access**, then paste the connection string into `MONGODB_URI`.

### 2. Start the server

```powershell
cd C:\Programming\Chat\server
npm install
npm run dev
```

The API listens on **http://localhost:5000** (verify with `http://localhost:5000/api/health`).

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with `node --watch` (auto-reload on changes) |
| `npm start` | Start once, without watch (production-style) |

> You can also run the whole stack (API + client) together from the monorepo root with `npm run dev`. See the [root README](../README.md) for details.

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `querySrv ECONNREFUSED` | Check Atlas Network Access; or set `MONGODB_URI_STANDARD` |
| Port 5000 in use | Stop other terminals using the port and restart |
| Client can't reach API | Ensure `CLIENT_URL` matches the frontend origin for CORS |
