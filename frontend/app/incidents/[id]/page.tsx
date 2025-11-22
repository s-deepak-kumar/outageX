'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initializeSocket, getSocket } from '@/lib/socket';
import { useFirefighterStore } from '@/store/firefighter';
import { Terminal, GitBranch, Code, CheckCircle2, XCircle, Loader2, ExternalLink, AlertTriangle, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from '@/lib/utils';
import { Timeline } from '@/components/firefighter/dashboard/Timeline';
import { ScrollArea } from "@/components/ui/scroll-area";

interface Incident {
  id: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  detectedAt: string;
  resolvedAt?: string;
  rootCause?: string;
  rootCauseConfidence?: number;
}

interface Log {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  service: string;
  metadata?: any;
}

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  timestamp: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  phase?: string;
  metadata?: any;
  incidentId?: string;
}

interface Solution {
  id: string;
  type: string;
  description: string;
  reasoning?: string;
  code?: string;
  confidence: number;
  executed: boolean;
  executionResult?: {
    success: boolean;
    url?: string;
    prNumber?: number;
    branch?: string;
    message?: string;
    error?: string;
  };
  testResults?: any;
  createdAt: string;
}

interface Commit {
  id: string;
  sha: string;
  author: string;
  message: string;
  timestamp: string;
  filesChanged: string[];
  diff?: string;
  isSuspicious: boolean;
}

const levelColors = {
  error: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20',
  warn: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  info: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
  debug: 'text-muted-foreground bg-muted/50 border-border',
};

export default function IncidentDetailPage() {
  const params = useParams();
  const incidentId = params.id as string;
  
  const [incident, setIncident] = useState<Incident | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveLogs, setLiveLogs] = useState<Log[]>([]);
  const [currentPhase, setCurrentPhase] = useState<{ phase: string; status: string; message: string } | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const isConnected = useFirefighterStore((state) => state.isConnected);

  // Fetch incident data
  useEffect(() => {
    const fetchIncident = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
        const res = await fetch(`${backendUrl}/api/incidents/${incidentId}`, {
          headers: { 'x-user-id': 'demo-user' },
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.data) {
            setIncident(data.data.incident);
            setLogs(data.data.logs || []);
            setTimeline(data.data.timeline || []);
            setSolutions(data.data.solutions || []);
            setCommits(data.data.commits || []);
            
            // Extract project ID from affected services
            if (data.data.incident?.affectedServices && data.data.incident.affectedServices.length > 0) {
              const firstService = data.data.incident.affectedServices[0];
              setProjectId(firstService);
              
              // Fetch project logs
              fetchProjectLogs(firstService);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch incident:', error);
      } finally {
        setLoading(false);
      }
    };

    if (incidentId) {
      fetchIncident();
    }
  }, [incidentId]);

  // Fetch project logs
  const fetchProjectLogs = async (projId: string) => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const since = Date.now() - (24 * 60 * 60 * 1000); // Last 24 hours
      const params = new URLSearchParams({
        type: 'runtime',
        limit: '200',
        since: since.toString(),
      });

      const res = await fetch(`${backendUrl}/api/projects/${projId}/logs?${params.toString()}`, {
        headers: { 'x-user-id': 'demo-user' },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          const projectLogs = data.data.map((log: any) => ({
            id: log.id || `log-${Date.now()}-${Math.random()}`,
            timestamp: log.timestamp || log.created || new Date().toISOString(),
            level: log.level || 'info',
            message: log.message || JSON.stringify(log.metadata || {}),
            service: log.source || 'system',
            metadata: log.metadata,
            stack: log.metadata?.stack || log.stack,
          }));
          
          setLogs((prev) => {
            const combined = [...prev, ...projectLogs];
            const unique = combined.filter((log, index, self) => 
              index === self.findIndex((l) => l.id === log.id)
            );
            return unique.sort((a, b) => 
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch project logs:', error);
    }
  };

  // Setup socket for live updates
  useEffect(() => {
    const socket = getSocket() || initializeSocket();
    
    const handleLogsStream = (data: any) => {
      if (!data.logs || !Array.isArray(data.logs)) return;
      
      const newLogs = data.logs
        .filter((log: any) => {
          // Match by projectId if we have it, or by incidentId, or show all if no filter
          if (projectId && log.projectId === projectId) return true;
          if (log.incidentId === incidentId) return true;
          // If no projectId set yet, show all logs (will be filtered once projectId is known)
          if (!projectId) return true;
          return false;
        })
        .map((log: any) => ({
          id: log.id || `log-${Date.now()}-${Math.random()}`,
          timestamp: log.timestamp || new Date().toISOString(),
          level: log.level || 'info',
          message: log.message || JSON.stringify(log.metadata || {}),
          service: log.source || log.projectName || 'system',
          metadata: log.metadata,
          stack: log.stack || log.metadata?.stack,
        }));
      
      if (newLogs.length > 0) {
        setLiveLogs((prev) => {
          const existingIds = new Set(prev.map((l: Log) => l.id));
          const unique = newLogs.filter((l: Log) => !existingIds.has(l.id));
          const combined = [...prev, ...unique];
          // Sort by timestamp ascending (oldest first, newest at bottom)
          const sorted = combined.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          return sorted.slice(-200); // Keep last 200 logs
        });
      }
    };

    const handleTimelineAdd = (data: any) => {
      if (data.entry) {
        const entry = data.entry;
        // Match by incidentId or check if it's for this incident
        if (entry.incidentId === incidentId || !entry.incidentId) {
          setTimeline((prev) => {
            // Check for duplicates
            const existing = prev.find(e => e.id === entry.id);
            if (existing) {
              // Update existing entry
              return prev.map(e => e.id === entry.id ? entry : e);
            }
            // Add new entry and sort by timestamp
            const updated = [...prev, entry];
            return updated.sort((a, b) => 
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
          });
        }
      }
    };

    const handleAgentUpdate = (data: any) => {
      if (data.phase && data.status && data.message) {
        setCurrentPhase({
          phase: data.phase,
          status: data.status,
          message: data.message,
        });
        
        // Also add to timeline if not already present
        setTimeline((prev) => {
          const existing = prev.find(e => e.phase === data.phase && e.status === 'in_progress');
          if (existing) {
            return prev.map(e => 
              e.id === existing.id 
                ? { ...e, description: data.message, metadata: { ...e.metadata, ...data.data } }
                : e
            );
          }
          
          // Add new timeline entry for this phase
          const newEntry: TimelineEvent = {
            id: `timeline-${Date.now()}-${Math.random()}`,
            incidentId: incidentId,
            type: 'agent_update',
            phase: data.phase,
            title: data.status,
            description: data.message,
            status: 'in_progress',
            timestamp: new Date().toISOString(),
            metadata: data.data,
          };
          
          const updated = [...prev, newEntry];
          return updated.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        });
      }
    };

    const handleSolutionProposed = (data: any) => {
      if (data.solution) {
        // Refresh solutions
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/incidents/${incidentId}`, {
          headers: { 'x-user-id': 'demo-user' },
        })
          .then(res => res.json())
          .then(data => {
            if (data.data?.solutions) {
              setSolutions(data.data.solutions);
            }
          });
      }
    };

    const handleStatusChange = (data: any) => {
      if (data.incident && data.incident.id === incidentId) {
        setIncident((prev) => prev ? { ...prev, status: data.incident.status } : null);
      }
    };

    socket.on('logs:stream', handleLogsStream);
    socket.on('timeline:add', handleTimelineAdd);
    socket.on('agent:update', handleAgentUpdate);
    socket.on('solution:proposed', handleSolutionProposed);
    socket.on('status:change', handleStatusChange);

    return () => {
      socket.off('logs:stream', handleLogsStream);
      socket.off('timeline:add', handleTimelineAdd);
      socket.off('agent:update', handleAgentUpdate);
      socket.off('solution:proposed', handleSolutionProposed);
      socket.off('status:change', handleStatusChange);
    };
  }, [incidentId, projectId]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [liveLogs]);

  // Combine static and live logs
  const allLogs = [...logs, ...liveLogs].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  if (loading) {
    return (
      <>
        <Breadcrumbs pageName="Incident Details" />
        <PageWrapper>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </PageWrapper>
      </>
    );
  }

  if (!incident) {
    return (
      <>
        <Breadcrumbs pageName="Incident Details" />
        <PageWrapper>
          <Card>
            <CardContent className="p-8 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Incident not found</p>
            </CardContent>
          </Card>
        </PageWrapper>
      </>
    );
  }

  const executedSolution = solutions.find(s => s.executed);
  const hasPR = executedSolution?.executionResult?.url;

  return (
    <>
      <Breadcrumbs pageName={`Incident: ${incident.title}`} />
      <PageWrapper>
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold">{incident.title}</h1>
            <Badge
              variant={
                incident.severity === 'critical' ? 'destructive' :
                incident.severity === 'high' ? 'default' : 'secondary'
              }
            >
              {incident.severity}
            </Badge>
          </div>
          <p className="text-muted-foreground">{incident.description}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>Detected: {format(new Date(incident.detectedAt), 'MMM d, yyyy HH:mm:ss')}</span>
            {incident.resolvedAt && (
              <span>Resolved: {format(new Date(incident.resolvedAt), 'MMM d, yyyy HH:mm:ss')}</span>
            )}
          </div>
        </div>

        {/* Main Layout: Left (Logs) + Right (Timeline) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Left: Logs and Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Live Logs & Actions
              </CardTitle>
              <CardDescription>
                {allLogs.length} log entries • {allLogs.filter(l => l.level === 'error').length} errors
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-1 font-mono text-xs">
                  {allLogs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No logs available
                    </div>
                  ) : (
                    allLogs.map((log) => {
                      const isError = log.level === 'error';
                      const logTimestamp = new Date(log.timestamp);
                      
                      return (
                        <div
                          key={log.id}
                          className={cn(
                            "flex items-start gap-2 p-2 rounded border",
                            isError ? levelColors.error :
                            log.level === 'warn' ? levelColors.warn :
                            log.level === 'info' ? levelColors.info :
                            levelColors.debug
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-muted-foreground text-[10px]">
                                {format(logTimestamp, 'HH:mm:ss.SSS')}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[9px] px-1 py-0 h-4',
                                  isError ? 'border-red-500 text-red-600' :
                                  log.level === 'warn' ? 'border-yellow-500 text-yellow-600' :
                                  'border-blue-500 text-blue-600'
                                )}
                              >
                                {log.level.toUpperCase()}
                              </Badge>
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                                {log.service}
                              </Badge>
                            </div>
                            <div className="break-words whitespace-pre-wrap">
                              {log.message}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right: Timeline/Process */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Investigation Timeline
              </CardTitle>
              <CardDescription>
                {currentPhase ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {currentPhase.phase.replace('_', ' ')}: {currentPhase.message}
                  </span>
                ) : (
                  'Real-time process status'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 && !currentPhase ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No timeline events yet</p>
                  <p className="text-xs mt-2">Waiting for process to start...</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {/* Show current phase if active */}
                    {currentPhase && (
                      <div className="p-3 border rounded-lg bg-blue-500/10 border-blue-500/20">
                        <div className="flex items-center gap-2 mb-1">
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          <span className="font-semibold text-sm">
                            {currentPhase.phase.replace('_', ' ').toUpperCase()}
                          </span>
                          <Badge variant="outline" className="text-xs">In Progress</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{currentPhase.message}</p>
                      </div>
                    )}
                    
                    {timeline.map((event, index) => {
                      const isLast = index === timeline.length - 1;
                      const status = event.status || 'completed';
                      const phase = event.phase || event.type;
                      
                      // Status icons
                      const StatusIcon = status === 'completed' ? CheckCircle2 :
                                       status === 'in_progress' ? Loader2 :
                                       status === 'failed' ? XCircle : Clock;
                      
                      // Status colors
                      const statusColor = status === 'completed' ? 'text-green-600 dark:text-green-400' :
                                         status === 'in_progress' ? 'text-blue-600 dark:text-blue-400' :
                                         status === 'failed' ? 'text-red-600 dark:text-red-400' :
                                         'text-muted-foreground';
                      
                      return (
                        <div key={event.id} className="flex gap-3 relative">
                          {!isLast && (
                            <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-border" />
                          )}
                          <div className="flex-shrink-0 mt-1">
                            {status === 'in_progress' ? (
                              <Loader2 className={`h-10 w-10 ${statusColor} animate-spin`} />
                            ) : (
                              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                                status === 'completed' ? 'bg-green-500/10' :
                                status === 'failed' ? 'bg-red-500/10' :
                                'bg-muted/50'
                              }`}>
                                <StatusIcon className={`h-5 w-5 ${statusColor}`} />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {phase && (
                                <Badge variant="secondary" className="text-xs">
                                  {phase.replace('_', ' ')}
                                </Badge>
                              )}
                              <Badge 
                                variant={
                                  status === 'completed' ? 'default' :
                                  status === 'in_progress' ? 'outline' :
                                  'destructive'
                                }
                                className="text-xs"
                              >
                                {status.replace('_', ' ')}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(event.timestamp), 'MMM d, HH:mm:ss')}
                              </span>
                            </div>
                            <h4 className="font-medium mb-1">{event.title}</h4>
                            {event.description && (
                              <p className="text-sm text-muted-foreground">{event.description}</p>
                            )}
                            {event.metadata && Object.keys(event.metadata).length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                  View Details
                                </summary>
                                <pre className="mt-1 text-xs text-muted-foreground bg-muted/50 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(event.metadata, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom: Code Changes & GitHub PRs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Code Changes & GitHub Patches
            </CardTitle>
            <CardDescription>
              Real-time code fixes and pull requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            {solutions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No solutions generated yet.</p>
                <p className="text-sm mt-2">Solutions will appear here when the AI generates fixes.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {solutions.map((solution) => (
                  <div
                    key={solution.id}
                    className="border rounded-lg p-4 space-y-4"
                  >
                    {/* Solution Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">{solution.type}</Badge>
                          <Badge
                            variant={solution.confidence >= 90 ? 'default' : 'secondary'}
                          >
                            {solution.confidence}% confidence
                          </Badge>
                          {solution.executed && (
                            <Badge
                              variant={solution.executionResult?.success ? 'default' : 'destructive'}
                              className="flex items-center gap-1"
                            >
                              {solution.executionResult?.success ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3" />
                                  Executed
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-3 w-3" />
                                  Failed
                                </>
                              )}
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold mb-1">{solution.description}</h3>
                        {solution.reasoning && (
                          <p className="text-sm text-muted-foreground">{solution.reasoning}</p>
                        )}
                      </div>
                    </div>

                    {/* Code Changes */}
                    {solution.code && (
                      <div className="bg-muted rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Code className="h-4 w-4" />
                          <span className="text-sm font-medium">Generated Code</span>
                        </div>
                        <pre className="text-xs overflow-x-auto bg-background p-3 rounded border">
                          <code>{solution.code}</code>
                        </pre>
                      </div>
                    )}

                    {/* GitHub PR Information */}
                    {solution.executionResult && (
                      <div className="border-t pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <GitBranch className="h-4 w-4" />
                          <span className="text-sm font-medium">GitHub Pull Request</span>
                        </div>
                        {solution.executionResult.success && solution.executionResult.url ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                                PR Created
                              </Badge>
                              {solution.executionResult.prNumber && (
                                <Badge variant="secondary">
                                  PR #{solution.executionResult.prNumber}
                                </Badge>
                              )}
                              {solution.executionResult.branch && (
                                <Badge variant="outline">
                                  Branch: {solution.executionResult.branch}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                              >
                                <a
                                  href={solution.executionResult.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View PR on GitHub
                                </a>
                              </Button>
                            </div>
                            {solution.executionResult.message && (
                              <p className="text-sm text-muted-foreground">
                                {solution.executionResult.message}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-destructive">
                            <XCircle className="h-4 w-4 inline mr-1" />
                            {solution.executionResult.error || 'Failed to create PR'}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Test Results */}
                    {solution.testResults && (
                      <div className="border-t pt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-sm font-medium">E2B Sandbox Test Results</span>
                        </div>
                        {solution.testResults.success ? (
                          <Badge variant="default" className="flex items-center gap-1 w-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            Tests Passed
                          </Badge>
                        ) : (
                          <div className="text-sm text-destructive">
                            <XCircle className="h-4 w-4 inline mr-1" />
                            Tests Failed: {solution.testResults.errors?.join(', ') || 'Unknown error'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageWrapper>
    </>
  );
}

