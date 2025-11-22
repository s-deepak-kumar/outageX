'use client';

import { useEffect, useState, useRef } from 'react';
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initializeSocket, getSocket } from '@/lib/socket';
import { useFirefighterStore } from '@/store/firefighter';
import { Wifi, WifiOff, Activity, AlertTriangle, Terminal, TrendingUp, Server, Zap } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from '@/lib/utils';

const pageData = {
  name: "Dashboard",
  title: "Dashboard",
  description: "Real-time monitoring and incident detection",
};

interface LiveLog {
  id: string;
  projectId: string;
  projectName?: string;
  timestamp: Date;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  source?: string;
  url?: string;
  metadata?: Record<string, any>;
  stack?: string;
}

interface LiveIncident {
  id: string;
  title: string;
  status: string;
  severity: string;
  projectName?: string;
  startedAt: Date;
}

const levelColors = {
  error: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20',
  warn: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  info: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
  debug: 'text-muted-foreground bg-muted/50 border-border',
};

export default function DashboardPage() {
  const isConnected = useFirefighterStore((state) => state.isConnected);
  const incident = useFirefighterStore((state) => state.incident);
  const storeLogs = useFirefighterStore((state) => state.logs);
  
  const [liveLogs, setLiveLogs] = useState<LiveLog[]>([]);
  const [liveIncidents, setLiveIncidents] = useState<LiveIncident[]>([]);
  const [metrics, setMetrics] = useState({
    totalErrors: 0,
    totalWarnings: 0,
    activeIncidents: 0,
    projectsMonitored: 0,
  });
  const [chartData, setChartData] = useState<Array<{ time: string; errors: number; warnings: number }>>([]);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Initialize socket connection once
  useEffect(() => {
    console.log('🚀 Dashboard: Initializing socket...');
    const socket = initializeSocket();
    
    // Wait for socket to connect
    if (!socket.connected) {
      console.log('⏳ Dashboard: Socket not connected, waiting...');
      socket.on('connect', () => {
        console.log('✅ Dashboard: Socket connected');
      });
    } else {
      console.log('✅ Dashboard: Socket already connected');
    }

    socket.on('connect', () => {
      console.log('✅ Dashboard: Socket connected event fired');
    });

    socket.on('disconnect', () => {
      console.log('❌ Dashboard: Socket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Dashboard: Socket connection error', error);
    });

    // Setup listeners for dashboard-specific events
    const handleLogsStream = (data: any) => {
      console.log('📥 Dashboard: Received logs:stream event', {
        logsCount: data.logs?.length || 0,
        data: data,
      });

      if (!data.logs || !Array.isArray(data.logs)) {
        console.warn('⚠️ Dashboard: Invalid logs data', data);
        return;
      }

      const newLogs = data.logs.map((log: any) => {
        const processedLog = {
          id: log.id || `log-${Date.now()}-${Math.random()}`,
          projectId: log.projectId,
          projectName: log.projectName || log.project?.name || 'Unknown',
          timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
          level: (log.level || 'info') as 'error' | 'warn' | 'info' | 'debug',
          message: log.message || log.text || JSON.stringify(log.metadata || log || {}),
          source: log.source || 'unknown',
          metadata: log.metadata || {},
        };
        
        console.log('📋 Dashboard: Processed log', {
          id: processedLog.id,
          level: processedLog.level,
          message: processedLog.message.substring(0, 50),
          projectId: processedLog.projectId,
        });
        
        return processedLog;
      });

      console.log('✅ Dashboard: Processing', newLogs.length, 'new logs');

      // Add to local state (ascending order: oldest first, newest at bottom)
      setLiveLogs((prev) => {
        // Filter out duplicates
        const existingIds = new Set(prev.map((l: LiveLog) => l.id));
        const uniqueNewLogs = newLogs.filter((l: LiveLog) => !existingIds.has(l.id));
        
        console.log('🔄 Dashboard: Adding', uniqueNewLogs.length, 'unique logs (prev:', prev.length, ')');
        
        if (uniqueNewLogs.length === 0) {
          console.log('⚠️ Dashboard: All logs are duplicates, skipping');
          return prev;
        }
        
        const combined = [...prev, ...uniqueNewLogs];
        // Sort by timestamp ascending
        const sorted = combined.sort((a, b) => {
          const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
          const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
          return timeA - timeB;
        });
        // Keep last 500 logs
        const result = sorted.slice(-500);
        console.log('📊 Dashboard: Total logs after update:', result.length);
        return result;
      });
      
      // Update metrics
      const errors = newLogs.filter((l: any) => l.level === 'error').length;
      const warnings = newLogs.filter((l: any) => l.level === 'warn').length;
      
      console.log('📈 Dashboard: Metrics update', { errors, warnings });
      
      if (errors > 0 || warnings > 0) {
        setMetrics((prev) => {
          const updated = {
            ...prev,
            totalErrors: prev.totalErrors + errors,
            totalWarnings: prev.totalWarnings + warnings,
          };
          console.log('📊 Dashboard: Updated metrics', updated);
          return updated;
        });

        // Update chart data (last 24 hours, grouped by hour)
        const now = new Date();
        const timeKey = format(now, 'HH:00');
        
        setChartData((prev) => {
          const existing = prev.find((d) => d.time === timeKey);
          if (existing) {
            return prev.map((d) =>
              d.time === timeKey
                ? { ...d, errors: d.errors + errors, warnings: d.warnings + warnings }
                : d
            );
          }
          const hourAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          return [
            { time: timeKey, errors, warnings },
            ...prev.filter((d) => {
              const dTime = new Date(`2000-01-01 ${d.time}`);
              return dTime >= hourAgo;
            }),
          ].slice(0, 24);
        });
      }
    };

    const handleIncidentDetected = (data: any) => {
      console.log('📥 Dashboard: Received incident:detected event', data);
      const incident = data.incident || data;
      const newIncident: LiveIncident = {
        id: incident.id,
        title: incident.title || incident.message || 'Incident detected',
        status: incident.status || 'detecting',
        severity: incident.severity || 'medium',
        projectName: Array.isArray(incident.affectedServices) 
          ? incident.affectedServices[0] 
          : incident.affectedServices || incident.projectName,
        startedAt: new Date(incident.startedAt || incident.detectedAt || incident.createdAt || Date.now()),
      };
      console.log('✅ Dashboard: Processed incident', newIncident);
      setLiveIncidents((prev) => {
        // Avoid duplicates
        if (prev.find(i => i.id === newIncident.id)) {
          console.log('⚠️ Dashboard: Incident already exists, skipping');
          return prev;
        }
        console.log('➕ Dashboard: Adding new incident', newIncident.id);
        return [newIncident, ...prev].slice(0, 20);
      });
      setMetrics((prev) => ({
        ...prev,
        activeIncidents: prev.activeIncidents + 1,
      }));
    };

    const handleStatusChange = (data: any) => {
      if (data.incident) {
        setLiveIncidents((prev) =>
          prev.map((inc) =>
            inc.id === data.incident.id
              ? { ...inc, status: data.incident.status }
              : inc
          )
        );
        
        if (data.incident.status === 'resolved') {
          setMetrics((prev) => ({
            ...prev,
            activeIncidents: Math.max(0, prev.activeIncidents - 1),
          }));
        }
      }
    };

    socket.on('logs:stream', handleLogsStream);
    socket.on('incident:detected', handleIncidentDetected);
    socket.on('status:change', handleStatusChange);

    // Also sync with store logs (backup in case socket misses some)
    let previousStoreLogsLength = 0;
    const storeUnsubscribe = useFirefighterStore.subscribe((state) => {
      const storeLogs = state.logs;
      // Only process if logs have changed
      if (storeLogs && storeLogs.length > previousStoreLogsLength) {
        const newStoreLogs = storeLogs.slice(previousStoreLogsLength);
        previousStoreLogsLength = storeLogs.length;
        
        console.log('📦 Dashboard: Syncing', newStoreLogs.length, 'logs from store');
        const newLogs = newStoreLogs.map((log: any) => ({
          id: log.id || `log-${Date.now()}-${Math.random()}`,
          projectId: log.projectId,
          projectName: log.projectName || 'Unknown',
          timestamp: log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp),
          level: (log.level || 'info') as 'error' | 'warn' | 'info' | 'debug',
          message: log.message || JSON.stringify(log.metadata || {}),
          source: log.source || 'store',
          metadata: log.metadata || {},
        }));

        setLiveLogs((prev) => {
          const existingIds = new Set(prev.map((l: LiveLog) => l.id));
          const uniqueNewLogs = newLogs.filter((l: LiveLog) => !existingIds.has(l.id));
          if (uniqueNewLogs.length === 0) return prev;
          
          console.log('📦 Dashboard: Adding', uniqueNewLogs.length, 'logs from store');
          
          const combined = [...prev, ...uniqueNewLogs];
          const sorted = combined.sort((a, b) => {
            const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
            const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
            return timeA - timeB;
          });
          return sorted.slice(-500);
        });
      }
    });

    // Cleanup on unmount
    return () => {
      socket.off('logs:stream', handleLogsStream);
      socket.off('incident:detected', handleIncidentDetected);
      socket.off('status:change', handleStatusChange);
      storeUnsubscribe();
    };
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [liveLogs]);

  // Fetch initial projects count and incidents
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
    
    // Fetch projects
    fetch(`${backendUrl}/api/projects`, {
      headers: { 'x-user-id': 'demo-user' },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setMetrics((prev) => ({
            ...prev,
            projectsMonitored: data.length,
          }));
          console.log('📊 Dashboard: Loaded', data.length, 'projects');
        }
      })
      .catch((error) => {
        console.error('❌ Dashboard: Failed to fetch projects', error);
      });

    // Fetch existing incidents
    fetch(`${backendUrl}/api/incidents`, {
      headers: { 'x-user-id': 'demo-user' },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.data && Array.isArray(data.data)) {
          const incidents = data.data.map((inc: any) => ({
            id: inc.id,
            title: inc.title || 'Incident detected',
            status: inc.status || 'detecting',
            severity: inc.severity || 'medium',
            projectName: Array.isArray(inc.affectedServices) ? inc.affectedServices[0] : undefined,
            startedAt: new Date(inc.detectedAt || inc.createdAt),
          }));
          setLiveIncidents(incidents.slice(0, 20));
          setMetrics((prev) => ({
            ...prev,
            activeIncidents: incidents.filter((i: any) => i.status !== 'resolved' && i.status !== 'failed').length,
          }));
          console.log('📊 Dashboard: Loaded', incidents.length, 'incidents');
        }
      })
      .catch((error) => {
        console.error('❌ Dashboard: Failed to fetch incidents', error);
      });
  }, []);

  // Debug: Log current state
  useEffect(() => {
    const errorCount = liveLogs.filter((log) => log.level === 'error').length;
    const warningCount = liveLogs.filter((log) => log.level === 'warn').length;
    console.log('📊 Dashboard State:', {
      liveLogsCount: liveLogs.length,
      errorLogsCount: errorCount,
      warningLogsCount: warningCount,
      isConnected,
      metrics,
      sampleLog: liveLogs.length > 0 ? liveLogs[liveLogs.length - 1] : null,
    });
  }, [liveLogs.length, isConnected, metrics]);

  const errorLogs = liveLogs.filter((log) => log.level === 'error');
  const warningLogs = liveLogs.filter((log) => log.level === 'warn');
  const recentLogs = liveLogs.slice(0, 20);

  return (
    <>
      <Breadcrumbs pageName={pageData.name} />
      <PageWrapper>
        <div className="flex items-center justify-between mb-6">
          <Header title={pageData.title}>{pageData.description}</Header>
          <Badge variant={isConnected ? "default" : "destructive"} className="ml-2">
            {isConnected ? (
              <>
                <Wifi className="w-3 h-3 mr-1" />
                Live
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 mr-1" />
                Offline
              </>
            )}
          </Badge>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalErrors}</div>
              <p className="text-xs text-muted-foreground">
                {errorLogs.length} in last hour
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Incidents</CardTitle>
              <Activity className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.activeIncidents}</div>
              <p className="text-xs text-muted-foreground">
                {liveIncidents.filter((i) => i.status !== 'resolved').length} ongoing
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Projects Monitored</CardTitle>
              <Server className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.projectsMonitored}</div>
              <p className="text-xs text-muted-foreground">
                All projects active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Warnings</CardTitle>
              <Zap className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalWarnings}</div>
              <p className="text-xs text-muted-foreground">
                {warningLogs.length} in last hour
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">
              <Activity className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Terminal className="w-4 h-4 mr-2" />
              Live Logs
            </TabsTrigger>
            <TabsTrigger value="incidents">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Incidents
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <TrendingUp className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Recent Incidents */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Incidents</CardTitle>
                  <CardDescription>Latest detected incidents</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    {liveIncidents.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No incidents detected
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {liveIncidents.map((inc) => (
                          <div
                            key={inc.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge
                                  variant={
                                    inc.severity === 'critical'
                                      ? 'destructive'
                                      : inc.severity === 'high'
                                      ? 'default'
                                      : 'secondary'
                                  }
                                >
                                  {inc.severity}
                                </Badge>
                                <Badge variant="outline">{inc.status}</Badge>
                              </div>
                              <p className="text-sm font-medium">{inc.title}</p>
                              {inc.projectName && (
                                <p className="text-xs text-muted-foreground">
                                  {inc.projectName}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(inc.startedAt, 'MMM d, HH:mm:ss')}
                              </p>
                            </div>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/incidents/${inc.id}`}>View</Link>
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Error Rate Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Error Rate (24h)</CardTitle>
                  <CardDescription>Errors and warnings over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] flex items-end justify-between gap-1">
                    {chartData.length === 0 ? (
                      <div className="w-full text-center py-8 text-muted-foreground">
                        No data yet
                      </div>
                    ) : (
                      chartData.map((data, idx) => {
                        const maxValue = Math.max(
                          ...chartData.map((d) => d.errors + d.warnings),
                          1
                        );
                        const errorHeight = (data.errors / maxValue) * 100;
                        const warningHeight = (data.warnings / maxValue) * 100;
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full flex flex-col-reverse gap-0.5 h-full">
                              <div
                                className="bg-red-500 rounded-t"
                                style={{ height: `${errorHeight}%` }}
                                title={`${data.errors} errors`}
                              />
                              <div
                                className="bg-yellow-500 rounded-t"
                                style={{ height: `${warningHeight}%` }}
                                title={`${data.warnings} warnings`}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground rotate-45 origin-bottom-left">
                              {data.time}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Live System Logs</CardTitle>
                    <CardDescription>
                      Real-time logs from all projects ({liveLogs.length} total)
                      {errorLogs.length > 0 && (
                        <span className="text-red-600 dark:text-red-400 ml-2">
                          • {errorLogs.length} errors detected
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  {isConnected ? (
                    <Badge variant="default" className="bg-green-500">
                      <Wifi className="h-3 w-3 mr-1" />
                      Live
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <WifiOff className="h-3 w-3 mr-1" />
                      Offline
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div 
                  ref={logsContainerRef}
                  className="h-[600px] overflow-y-auto border rounded-lg p-4 bg-background"
                >
                  {liveLogs.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No logs received yet.</p>
                      <p className="text-sm mt-2">Waiting for logs from connected projects...</p>
                      {!isConnected && (
                        <p className="text-xs mt-2 text-yellow-600 dark:text-yellow-400">
                          ⚠️ Socket not connected. Check your connection.
                        </p>
                      )}
                      <div className="mt-4 text-xs">
                        <p>Debug Info:</p>
                        <p>Socket Connected: {isConnected ? 'Yes' : 'No'}</p>
                        <p>Store Logs: {storeLogs.length}</p>
                        <p>Live Logs: {liveLogs.length}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 font-mono text-xs">
                      {liveLogs.map((log, idx) => {
                        const isError = log.level === 'error';
                        const isWarning = log.level === 'warn';
                        const logTimestamp = log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp);
                        const logMessage = log.message || JSON.stringify(log.metadata || {});
                        const stackTrace = log.metadata?.stack;

                        return (
                          <div
                            key={log.id || `log-${idx}`}
                            className={cn(
                              "flex items-start gap-2 p-2 rounded border transition-colors",
                              isError
                                ? levelColors.error
                                : isWarning
                                ? levelColors.warn
                                : log.level === 'info'
                                ? levelColors.info
                                : levelColors.debug
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-muted-foreground flex-shrink-0 text-[10px]">
                                  {format(logTimestamp, 'HH:mm:ss.SSS')}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[9px] px-1 py-0 h-4',
                                    isError
                                      ? 'border-red-500 text-red-600 dark:text-red-400'
                                      : isWarning
                                      ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                                      : 'border-blue-500 text-blue-600 dark:text-blue-400'
                                  )}
                                >
                                  {log.level.toUpperCase()}
                                </Badge>
                                {log.projectName && (
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                                    {log.projectName}
                                  </Badge>
                                )}
                                {log.source && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                    {log.source === 'client_sdk' ? 'SDK' : log.source}
                                  </Badge>
                                )}
                              </div>
                              <div className="break-words whitespace-pre-wrap">
                                {logMessage}
                              </div>
                              {stackTrace && (
                                <details className="mt-2">
                                  <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                                    Stack Trace
                                  </summary>
                                  <pre className="mt-1 text-[10px] text-muted-foreground bg-muted/50 p-2 rounded overflow-x-auto">
                                    {stackTrace}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={logsEndRef} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="incidents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Incidents</CardTitle>
                <CardDescription>
                  Complete incident history ({liveIncidents.length} total)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {liveIncidents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No incidents detected yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {liveIncidents.map((inc) => (
                        <div
                          key={inc.id}
                          className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge
                                  variant={
                                    inc.severity === 'critical'
                                      ? 'destructive'
                                      : inc.severity === 'high'
                                      ? 'default'
                                      : 'secondary'
                                  }
                                >
                                  {inc.severity}
                                </Badge>
                                <Badge variant="outline">{inc.status}</Badge>
                              </div>
                              <h3 className="font-semibold mb-1">{inc.title}</h3>
                              {inc.projectName && (
                                <p className="text-sm text-muted-foreground mb-2">
                                  Project: {inc.projectName}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Started: {format(inc.startedAt, 'MMM d, yyyy HH:mm:ss')}
                              </p>
                            </div>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/incidents/${inc.id}`}>View Details</Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Error Distribution</CardTitle>
                  <CardDescription>By severity level</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Errors</span>
                      <span className="font-bold">{errorLogs.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Warnings</span>
                      <span className="font-bold">{warningLogs.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Info</span>
                      <span className="font-bold">
                        {liveLogs.filter((l) => l.level === 'info').length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>System Health</CardTitle>
                  <CardDescription>Overall status</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Connection</span>
                      <Badge variant={isConnected ? "default" : "destructive"}>
                        {isConnected ? "Connected" : "Disconnected"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Active Projects</span>
                      <span className="font-bold">{metrics.projectsMonitored}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Total Logs</span>
                      <span className="font-bold">{liveLogs.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </>
  );
}
