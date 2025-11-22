# OutageX Backend

Node.js/Express backend for OutageX - Autonomous AI-Powered Incident Response System.

---

## 🚀 Quick Start

### **Installation**
```bash
npm install
```

### **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your configuration
```

### **Database Migration**
```bash
npm run db:generate
npm run db:migrate
```

### **Run Development Server**
```bash
npm run dev
```

Server runs on `http://localhost:3001` by default.

---

## 📋 Environment Variables

### **Required**
```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# API Keys
GROQ_API_KEY=your_groq_api_key
E2B_API_KEY=your_e2b_api_key

# Server
PORT=3001
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:3001
```

### **Optional**
```env
# MCP Server API Keys
PERPLEXITY_API_KEY=your_perplexity_key
EXA_API_KEY=your_exa_key
BRAVE_SEARCH_API_KEY=your_brave_key  # Currently disabled

# Encryption (auto-generated if not provided)
ENCRYPTION_KEY=your_32_char_encryption_key
```

---

## 🏗️ Architecture

### **Directory Structure**
```
backend/
├── src/
│   ├── agent/          # AI agent system
│   │   ├── detector.ts      # Incident detection
│   │   ├── analyzer.ts      # Log analysis
│   │   ├── researcher.ts   # Research with MCP
│   │   ├── solver.ts        # Solution generation
│   │   ├── executor.ts      # PR creation & merging
│   │   └── orchestrator.ts   # Main orchestrator
│   ├── db/             # Database
│   │   ├── schema.ts        # Drizzle schema
│   │   └── migrate.ts       # Migration script
│   ├── groq/           # Groq AI client
│   ├── integrations/   # External integrations
│   │   ├── github.ts        # GitHub API
│   │   └── vercel.ts        # Vercel API
│   ├── mcp/            # MCP servers (via E2B)
│   │   ├── e2b-mcp-manager.ts
│   │   ├── github.ts
│   │   └── search.ts
│   ├── routes/         # API routes
│   │   ├── incidents.ts
│   │   ├── integrations.ts
│   │   ├── projects.ts
│   │   ├── webhooks.ts
│   │   └── ai-chat.ts
│   ├── services/       # Business logic
│   │   ├── integration-manager.ts
│   │   └── runtime-monitor.ts
│   ├── websocket/      # Socket.io handlers
│   └── index.ts        # Entry point
```

---

## 🔌 API Endpoints

### **Health Check**
```
GET /health
```

### **Projects**
```
GET    /api/projects              # List all projects
POST   /api/projects              # Add new project
GET    /api/projects/:id          # Get project details
PUT    /api/projects/:id          # Update project
DELETE /api/projects/:id          # Delete project
GET    /api/projects/:id/logs     # Get project logs
GET    /api/projects/:id/health   # Get project health
GET    /api/projects/:id/metrics  # Get project metrics
```

### **Integrations**
```
GET    /api/integrations          # List integrations
POST   /api/integrations/vercel   # Connect Vercel
POST   /api/integrations/github   # Connect GitHub
GET    /api/integrations/github/repos  # List GitHub repos
DELETE /api/integrations/:id     # Disconnect integration
```

### **Incidents**
```
GET    /api/incidents             # List incidents
GET    /api/incidents/:id         # Get incident details
POST   /api/incidents/:id/execute # Execute solution
```

### **AI Chat**
```
POST   /api/ai-chat               # Chat with AI about code
```

### **Webhooks**
```
POST   /api/webhooks/error-report    # SDK error reports
POST   /api/webhooks/vercel-logs     # Vercel log drain
POST   /api/webhooks/github          # GitHub webhooks
POST   /api/webhooks/vercel          # Vercel webhooks
```

---

## 🤖 AI Agent System

### **Incident Response Flow**

1. **Detection** (`detector.ts`)
   - Monitors runtime errors from SDK
   - Triggers incident when threshold met (3 errors in 5 minutes)

2. **Analysis** (`analyzer.ts`)
   - Analyzes error logs and stack traces
   - Extracts error patterns and context

3. **Research** (`researcher.ts`)
   - Uses Perplexity/Exa MCP for similar issues
   - Correlates with recent GitHub commits
   - Finds related documentation

4. **Solution Generation** (`solver.ts`)
   - Groq AI generates code fix
   - Tests fix in E2B sandbox
   - Validates syntax and logic

5. **Execution** (`executor.ts`)
   - Creates GitHub branch
   - Commits fix
   - Creates pull request
   - Optionally auto-merges if confidence high

### **Orchestrator** (`orchestrator.ts`)
- Coordinates all phases
- Manages incident timeline
- Emits Socket.io events for real-time updates

---

## 🔗 MCP Integration

OutageX uses **Model Context Protocol (MCP)** via E2B Sandbox to access:

- **GitHub MCP** - Repository operations (commits, PRs, file reading)
- **Perplexity MCP** - AI-powered research with citations
- **Exa MCP** - Semantic web search

MCP servers run in isolated E2B sandbox for security.

---

## 📊 Database Schema

### **Tables**
- `projects` - Vercel projects
- `integrations` - User integrations (Vercel, GitHub)
- `incidents` - Detected incidents
- `runtime_logs` - Runtime logs from SDK/Vercel
- `webhooks` - Webhook configurations

See `src/db/schema.ts` for full schema.

---

## 🔐 Security

- **Encrypted Credentials** - All integration tokens encrypted (AES-256-GCM)
- **Webhook Signatures** - GitHub/Vercel webhook signature verification
- **CORS** - Configurable CORS for frontend
- **Auth Middleware** - Demo user for POC (replace with real auth)

---

## 🧪 Testing

```bash
# Type checking
npm run type-check

# Run tests (if available)
npm test
```

---

## 📝 Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run db:generate  # Generate database migrations
npm run db:migrate   # Run database migrations
npm run type-check   # TypeScript type checking
```

---

## 🐛 Troubleshooting

### **E2B MCP Not Initializing**
- Check `E2B_API_KEY` is set correctly
- Verify API key is valid
- Check E2B sandbox logs

### **MCP Tools Not Found**
- Ensure API keys are set (Perplexity, Exa)
- Wait 5 seconds after startup for MCP initialization
- Check backend logs for MCP errors

### **Database Connection Issues**
- Verify `DATABASE_URL` is correct
- Check database is accessible
- Run migrations: `npm run db:migrate`

---

## 📚 Related Documentation

- [Main README](../README.md)
- [Frontend README](../frontend/README.md)
- [SDK README](../sdk/README.md)

