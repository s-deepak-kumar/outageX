# OutageX Frontend

Next.js 14 frontend for OutageX - Autonomous AI-Powered Incident Response System.

---

## 🚀 Quick Start

### **Installation**
```bash
npm install
```

### **Environment Setup**
```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

### **Run Development Server**
```bash
npm run dev
```

Application runs on `http://localhost:3000` by default.

---

## 📋 Environment Variables

### **Required**
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

### **Optional**
```env
# Database (if using Supabase)
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Auth (if using NextAuth)
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

---

## 🏗️ Architecture

### **Directory Structure**
```
frontend/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth pages
│   ├── ai-chat/           # AI Chat page
│   ├── integrations/      # Integrations page
│   ├── logs/              # Logs viewer
│   ├── projects/          # Projects management
│   └── page.tsx           # Dashboard
├── components/
│   ├── firefighter/       # Incident response components
│   ├── parts/             # Shared components (Header, Nav, etc.)
│   └── ui/                # shadcn/ui components
├── lib/
│   ├── socket.ts          # Socket.io client
│   └── data/              # API data fetching
└── store/
    └── firefighter.ts     # Zustand store
```

---

## 📄 Pages

### **Dashboard** (`/`)
- Real-time incident monitoring
- Live logs streaming
- System metrics
- Connection status

### **Logs** (`/logs`)
- Project selector in breadcrumb
- Live logs from selected project
- Real-time updates via Socket.io
- Color-coded by log level

### **Projects** (`/projects`)
- List all Vercel projects
- Add new projects
- Configure auto-fix settings
- View project details

### **Project Detail** (`/projects/[id]`)
- Health metrics (CPU, memory, error rate, RPS)
- Runtime logs viewer
- Build logs
- Settings and webhook management

### **Integrations** (`/integrations`)
- Connect Vercel account
- Connect GitHub account
- View integration status

### **AI Chat** (`/ai-chat`)
- ChatGPT-style interface
- Ask questions about codebase
- Context-aware responses
- Markdown code formatting

---

## 🎨 UI Components

### **Design System**
- Built with **shadcn/ui** components
- **Tailwind CSS** for styling
- **Dark mode** support
- Responsive design

### **Key Components**
- `Header` - Page headers with breadcrumbs
- `Nav` - Sidebar navigation
- `PageWrapper` - Consistent page layout
- `LogsViewer` - Real-time log display
- `IncidentCard` - Incident status cards

---

## 🔌 Real-time Features

### **Socket.io Integration**
- Real-time incident updates
- Live log streaming
- Agent status updates
- Chat messages

### **Connection Management**
- Auto-reconnect on disconnect
- Connection status indicator
- Error handling

---

## 📦 State Management

### **Zustand Stores**
- `useFirefighterStore` - Incident response state
- `useChatStore` - AI chat messages

---

## 🛠️ Development

### **Scripts**
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test:unit    # Run unit tests
```

### **Type Checking**
```bash
npx tsc --noEmit
```

---

## 🎯 Features

### **1. Real-time Dashboard**
- Live incident monitoring
- Streaming logs
- System metrics
- Connection status

### **2. Project Management**
- Add Vercel projects
- Auto-detect GitHub repos
- Configure monitoring
- View health metrics

### **3. Live Logs Viewer**
- Real-time log streaming
- Project filtering
- Color-coded by level
- Stack trace display

### **4. AI Code Assistant**
- ChatGPT-style interface
- Code analysis
- Context-aware responses
- Markdown formatting

### **5. Integration Management**
- Vercel connection
- GitHub connection
- Automatic webhook setup
- Secure credential storage

---

## 🔐 Authentication

Currently using **demo user** for POC:
- User: "S Deepak Kumar"
- Email: "dipkfilms@gmail.com"
- User ID: "demo-user"

Replace with real authentication (NextAuth) for production.

---

## 📚 Related Documentation

- [Main README](../README.md)
- [Backend README](../backend/README.md)
- [SDK README](../sdk/README.md)

---

## 🐛 Troubleshooting

### **Socket Connection Issues**
- Check `NEXT_PUBLIC_SOCKET_URL` is set
- Verify backend is running
- Check CORS configuration

### **API Calls Failing**
- Verify `NEXT_PUBLIC_BACKEND_URL` is set
- Check backend is accessible
- Review browser console for errors

---

## 📝 License

MIT
