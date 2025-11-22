# 🔥 OutageX DevOps Firefighter SDK

Automatically capture runtime errors and trigger AI-powered incident response.

---

## 📦 Installation

### **Option 1: Copy SDK File (Recommended)**

1. Copy `outagex-sdk.ts` to your project
2. Place it in your project (e.g., `lib/outagex-sdk.ts` or `src/utils/outagex-sdk.ts`)

### **Option 2: Install as Package (Future)**

```bash
npm install @outagex/sdk
```

---

## 🚀 Quick Start

### **Step 1: Get Your Project ID**

1. Go to your OutageX dashboard
2. Navigate to `/projects` page
3. Click on your project
4. Copy the project ID from the URL: `/projects/[project-id]`

**Example:** 
- URL: `/projects/a5a51cb7-d45f-44de-a318-43f381210e81`
- Project ID: `a5a51cb7-d45f-44de-a318-43f381210e81`

### **Step 2: Initialize SDK**

#### **Next.js 13+ (App Router)**

```tsx
// app/layout.tsx
'use client';

import { useEffect } from 'react';
import { initOutageX } from '@/lib/outagex-sdk';

export default function RootLayout({ children }) {
  useEffect(() => {
    initOutageX({
      projectId: 'your-project-id-here',
      backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001',
    });
  }, []);

  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

#### **Next.js Pages Router**

```tsx
// pages/_app.tsx
import { useEffect } from 'react';
import { initOutageX } from '@/lib/outagex-sdk';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    initOutageX({
      projectId: 'your-project-id-here',
      backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001',
    });
  }, []);

  return <Component {...pageProps} />;
}
```

#### **React (Create React App)**

```tsx
// src/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initOutageX } from './lib/outagex-sdk';
import App from './App';

// Initialize SDK
initOutageX({
  projectId: 'your-project-id-here',
  backendUrl: process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001',
});

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
```

#### **Vue.js**

```ts
// main.ts
import { createApp } from 'vue';
import { initOutageX } from './lib/outagex-sdk';
import App from './App.vue';

// Initialize SDK
initOutageX({
  projectId: 'your-project-id-here',
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001',
});

createApp(App).mount('#app');
```

#### **Vanilla JavaScript**

```html
<!-- index.html -->
<script type="module">
  import { initOutageX } from './lib/outagex-sdk.js';

  initOutageX({
    projectId: 'your-project-id-here',
    backendUrl: 'http://localhost:3001',
  });
</script>
```

---

## ⚙️ Configuration

```ts
initOutageX({
  // Required: Your project ID from OutageX dashboard
  projectId: 'a5a51cb7-d45f-44de-a318-43f381210e81',
  
  // Required: Your OutageX backend URL
  backendUrl: 'https://your-backend.com',
  
  // Optional: Enable/disable SDK (default: true)
  enabled: true,
  
  // Optional: Custom error handler
  onError: (error) => {
    console.log('Error captured:', error);
    // Add custom logic here
  },
});
```

---

## 📝 Manual Error Reporting

You can also manually report errors:

```ts
import { captureError } from '@/lib/outagex-sdk';

try {
  // Your code
  throw new Error('Something went wrong');
} catch (error) {
  // Manually capture error
  await captureError(error as Error, {
    userId: 'user-123',
    action: 'checkout',
    metadata: { orderId: 'order-456' },
  });
}
```

---

## ✅ What Gets Captured Automatically

The SDK automatically captures:

1. **Unhandled Errors**
   ```ts
   // This will be automatically captured
   throw new Error('Something broke');
   ```

2. **Unhandled Promise Rejections**
   ```ts
   // This will be automatically captured
   Promise.reject(new Error('Async error'));
   ```

3. **Console Errors** (optional)
   - Only if error message contains "error", "failed", or "exception"

---

## 🔄 How It Works

```
1. Error occurs in your app
   ↓
2. SDK captures error automatically
   ↓
3. POST /api/webhooks/error-report
   ↓
4. Error stored in database
   ↓
5. Error count tracked (5-minute window)
   ↓
6. If 3+ errors → Automatic incident trigger
   ↓
7. Full AI-powered incident response:
   - Log analysis
   - Commit correlation
   - Research & diagnosis
   - Solution generation
   - PR creation (if auto-fix enabled)
```

---

## 🧪 Testing

### **Test 1: Trigger an Error**

Add this to any component:

```tsx
// TestComponent.tsx
'use client';

export default function TestComponent() {
  const triggerError = () => {
    throw new Error('Test error for OutageX SDK');
  };

  return (
    <button onClick={triggerError}>
      Trigger Test Error
    </button>
  );
}
```

### **Test 2: Check Dashboard**

1. Go to `/projects/[id]` → Runtime Logs tab
2. You should see the error logged there
3. Trigger 3 errors within 5 minutes to see automatic incident response

---

## 🔍 Debugging

### **Check if SDK is Initialized**

Open browser console, you should see:
```
🔥 OutageX SDK initialized for project: your-project-id
```

### **Check Network Requests**

1. Open DevTools → Network tab
2. Trigger an error
3. Look for POST request to `/api/webhooks/error-report`
4. Check response (should be `{ received: true, stored: 1 }`)

### **Common Issues**

**Issue: SDK not capturing errors**
- ✅ Check if `enabled: true` is set
- ✅ Check if project ID is correct
- ✅ Check if backend URL is correct
- ✅ Check browser console for errors

**Issue: Errors not showing in dashboard**
- ✅ Check if project is enabled in `/projects/[id]` → Settings
- ✅ Check backend logs for errors
- ✅ Check if backend is running

**Issue: CORS errors**
- ✅ Ensure backend CORS allows your frontend domain
- ✅ Check `NEXT_PUBLIC_BACKEND_URL` is set correctly

---

## 📊 Error Threshold

By default, incidents are triggered when:
- **3+ errors** occur within **5 minutes**

This threshold is configurable on the backend.

---

## 🎯 Features

- ✅ **Automatic Error Capture** - No code changes needed
- ✅ **Real-time Reporting** - Errors sent immediately
- ✅ **Automatic Incident Response** - AI analyzes and fixes
- ✅ **Zero Configuration** - Works out of the box
- ✅ **Lightweight** - < 5KB minified
- ✅ **Framework Agnostic** - Works with any JS framework

---

## 📚 API Reference

### **Functions**

#### `initOutageX(config)`
Initialize the SDK.

**Parameters:**
- `config.projectId` (required): Your project ID
- `config.backendUrl` (required): Backend URL
- `config.enabled` (optional): Enable/disable SDK
- `config.onError` (optional): Custom error handler

#### `captureError(error, metadata?)`
Manually capture an error.

**Parameters:**
- `error` (required): Error object
- `metadata` (optional): Additional metadata

---

## 🔗 Related Documentation

- [Full Setup Guide](../SDK_SETUP_GUIDE.md)
- [Runtime Error Detection](../RUNTIME_ERROR_DETECTION.md)
- [API Endpoints](../API_ENDPOINTS.md)

---

## 📄 License

MIT

---

## 🆘 Support

For issues or questions:
1. Check the [Full Setup Guide](../SDK_SETUP_GUIDE.md)
2. Review backend logs
3. Check project settings in dashboard

---

## 🎉 You're All Set!

Once initialized, the SDK will automatically:
- ✅ Capture all unhandled errors
- ✅ Report them to the backend
- ✅ Store in database
- ✅ Trigger incidents when threshold is met
- ✅ Show logs in dashboard

**No additional code needed!** The SDK works automatically once initialized.

