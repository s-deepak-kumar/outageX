import { Incident, LogEntry, CommitInfo, ResearchResult } from '../utils/types';

/**
 * Mock Cloudflare Outage Scenario
 */

export const mockIncident: Incident = {
  id: 'incident-cf-2024-001',
  title: 'API Gateway 502 Errors - Cloudflare Workers',
  description: 'Sudden spike in 502 Bad Gateway errors across all API endpoints. Multiple customer reports of service unavailability.',
  severity: 'critical',
  status: 'detecting',
  startedAt: new Date(),
  affectedServices: [
    'api.example.com',
    'cdn.example.com',
    'workers.example.com'
  ]
};

export const mockLogs: LogEntry[] = [
  {
    timestamp: new Date(Date.now() - 300000),
    level: 'error',
    message: 'Worker exceeded CPU time limit',
    service: 'cloudflare-worker-api',
    metadata: { zone: 'us-east', workerId: 'worker-123' }
  },
  {
    timestamp: new Date(Date.now() - 290000),
    level: 'error',
    message: 'Unhandled Promise rejection in main handler',
    service: 'cloudflare-worker-api',
    metadata: { error: 'Cannot read property of undefined', line: 42 }
  },
  {
    timestamp: new Date(Date.now() - 280000),
    level: 'error',
    message: 'Worker exceeded CPU time limit',
    service: 'cloudflare-worker-api',
    metadata: { zone: 'us-west', workerId: 'worker-123' }
  },
  {
    timestamp: new Date(Date.now() - 270000),
    level: 'warn',
    message: 'High memory usage detected: 95%',
    service: 'cloudflare-worker-api',
    metadata: { memoryMB: 122 }
  },
  {
    timestamp: new Date(Date.now() - 260000),
    level: 'error',
    message: '502 Bad Gateway returned to client',
    service: 'cloudflare-worker-api',
    metadata: { endpoint: '/api/v1/users', responseTime: 30001 }
  },
  {
    timestamp: new Date(Date.now() - 250000),
    level: 'error',
    message: 'Worker exceeded CPU time limit',
    service: 'cloudflare-worker-api',
    metadata: { zone: 'eu-west', workerId: 'worker-123' }
  },
  {
    timestamp: new Date(Date.now() - 240000),
    level: 'error',
    message: 'Unhandled Promise rejection in main handler',
    service: 'cloudflare-worker-api',
    metadata: { error: 'Cannot read property of undefined', line: 42 }
  },
  {
    timestamp: new Date(Date.now() - 230000),
    level: 'error',
    message: '502 Bad Gateway returned to client',
    service: 'cloudflare-worker-api',
    metadata: { endpoint: '/api/v1/orders', responseTime: 30002 }
  },
  {
    timestamp: new Date(Date.now() - 220000),
    level: 'error',
    message: 'Worker exceeded CPU time limit',
    service: 'cloudflare-worker-api',
    metadata: { zone: 'ap-south', workerId: 'worker-123' }
  },
  {
    timestamp: new Date(Date.now() - 210000),
    level: 'error',
    message: 'Maximum concurrent requests exceeded',
    service: 'cloudflare-worker-api',
    metadata: { currentRequests: 1500, limit: 1000 }
  }
];

export const mockCommits: CommitInfo[] = [
  {
    sha: 'a1b2c3d4e5f6',
    author: 'john.doe@example.com',
    message: 'feat: Add recursive data processing in worker\n\nImplemented deep object traversal for nested API responses\nAdded memoization for performance optimization',
    timestamp: new Date(Date.now() - 7200000), // 2 hours ago
    filesChanged: ['src/worker/handler.ts', 'src/utils/processor.ts'],
    additions: 145,
    deletions: 23
  },
  {
    sha: 'b2c3d4e5f6g7',
    author: 'jane.smith@example.com',
    message: 'fix: Update dependency versions\n\nupdated: wrangler to 3.0.0',
    timestamp: new Date(Date.now() - 86400000), // 1 day ago
    filesChanged: ['package.json', 'package-lock.json'],
    additions: 8,
    deletions: 8
  },
  {
    sha: 'c3d4e5f6g7h8',
    author: 'mike.jones@example.com',
    message: 'docs: Update README with deployment instructions',
    timestamp: new Date(Date.now() - 172800000), // 2 days ago
    filesChanged: ['README.md'],
    additions: 25,
    deletions: 5
  },
  {
    sha: 'd4e5f6g7h8i9',
    author: 'sarah.wilson@example.com',
    message: 'refactor: Improve error handling',
    timestamp: new Date(Date.now() - 259200000), // 3 days ago
    filesChanged: ['src/worker/handler.ts', 'src/middleware/errors.ts'],
    additions: 67,
    deletions: 34
  }
];

export const suspiciousCommitDiff = `diff --git a/src/worker/handler.ts b/src/worker/handler.ts
index 1234567..abcdefg 100644
--- a/src/worker/handler.ts
+++ b/src/worker/handler.ts
@@ -15,10 +15,25 @@ export async function handleRequest(request: Request): Promise<Response> {
   const data = await fetchAPIData(endpoint);
   
-  return new Response(JSON.stringify(data), {
+  const processed = processDataRecursively(data);
+  
+  return new Response(JSON.stringify(processed), {
     headers: { 'Content-Type': 'application/json' },
   });
 }
 
+function processDataRecursively(obj: any): any {
+  if (typeof obj !== 'object' || obj === null) return obj;
+  
+  const result: any = Array.isArray(obj) ? [] : {};
+  
+  for (const key in obj) {
+    // Recursive processing without depth limit
+    result[key] = processDataRecursively(obj[key]);
+  }
+  
+  return result;
+}
+
 async function fetchAPIData(endpoint: string) {
   const response = await fetch(\`https://api.backend.com\${endpoint}\`);`;

export const mockResearchResults: ResearchResult[] = [
  {
    source: 'Stack Overflow',
    title: 'Cloudflare Worker CPU time limit exceeded',
    summary: 'Workers have a 50ms CPU time limit on free tier and 200ms on paid. Recursive operations without depth limits often cause this.',
    url: 'https://stackoverflow.com/questions/cloudflare-cpu-limit',
    relevance: 0.95
  },
  {
    source: 'Cloudflare Docs',
    title: 'Understanding Worker CPU limits',
    summary: 'CPU time limits are enforced strictly. Recursive functions, large loops, and complex JSON parsing can exceed limits.',
    url: 'https://developers.cloudflare.com/workers/limits',
    relevance: 0.92
  },
  {
    source: 'GitHub Issue',
    title: 'Unbounded recursion causing 502 errors',
    summary: 'Deep recursive processing of nested objects caused workers to hit CPU limit. Solution: add depth limit or use iterative approach.',
    url: 'https://github.com/cloudflare/workers/issues/1234',
    relevance: 0.88
  },
  {
    source: 'Dev.to Article',
    title: 'Common Cloudflare Worker Pitfalls',
    summary: 'Avoid recursive operations on user-provided data. Always set maximum depth limits and use timeouts.',
    url: 'https://dev.to/avoiding-worker-pitfalls',
    relevance: 0.82
  }
];

export const mockSolution = {
  type: 'patch' as const,
  description: 'Add depth limit to recursive data processing function',
  reasoning: `The root cause is unbounded recursion in the processDataRecursively function introduced in commit a1b2c3d4e5f6. 
  
When processing deeply nested API responses, the function recursively traverses without any depth limit, causing CPU time to exceed Cloudflare Worker limits (50-200ms).

The fix adds a maximum depth parameter to prevent infinite/excessive recursion.`,
  risk: 'low' as const,
  confidence: 94,
  estimatedTime: '2 minutes',
  steps: [
    'Add maxDepth parameter with default value of 10',
    'Track current depth in recursion',
    'Return original value when depth exceeded',
    'Deploy updated worker',
    'Monitor error rates'
  ],
  code: `function processDataRecursively(obj: any, depth: number = 0, maxDepth: number = 10): any {
  // Prevent excessive recursion
  if (depth >= maxDepth) {
    return obj;
  }
  
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const result: any = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    result[key] = processDataRecursively(obj[key], depth + 1, maxDepth);
  }
  
  return result;
}`
};

// Python script for log analysis in E2B
export const logAnalysisScript = `
import json
from collections import Counter
from datetime import datetime

logs = """${JSON.stringify(mockLogs)}"""

parsed_logs = json.loads(logs)

# Analyze error patterns
error_messages = [log['message'] for log in parsed_logs if log['level'] == 'error']
error_counts = Counter(error_messages)

# Most common error
most_common = error_counts.most_common(3)

# Calculate error rate
total_logs = len(parsed_logs)
error_logs = len([l for l in parsed_logs if l['level'] == 'error'])
error_rate = (error_logs / total_logs) * 100

# Affected services
services = list(set([log['service'] for log in parsed_logs]))

# Time range
timestamps = [log['timestamp'] for log in parsed_logs]

result = {
    "total_logs": total_logs,
    "error_count": error_logs,
    "error_rate": round(error_rate, 2),
    "most_common_errors": [{"message": msg, "count": count} for msg, count in most_common],
    "affected_services": services,
    "analysis": "High frequency of 'Worker exceeded CPU time limit' errors indicates resource exhaustion. Pattern suggests recursive or compute-intensive operation."
}

print(json.dumps(result, indent=2))
`;

