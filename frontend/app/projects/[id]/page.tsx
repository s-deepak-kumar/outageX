'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, Activity, Terminal, RefreshCw, ExternalLink, Loader2, ArrowLeft, Cpu, Database, Gauge, Zap, Copy } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { toast } from "sonner";
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Project {
  id: string;
  vercelProjectId: string;
  vercelProjectName: string;
  githubOwner: string;
  githubRepo: string;
  enabled: boolean;
  autoFix: boolean;
  autoFixThreshold: number;
  framework?: string;
  vercelWebhookId?: string;
  githubWebhookId?: string;
  createdAt: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectHealth, setProjectHealth] = useState<any>(null);
  const [projectMetrics, setProjectMetrics] = useState<any>(null);
  const [systemMetrics, setSystemMetrics] = useState<any>(null);
  const [projectLogs, setProjectLogs] = useState<any[]>([]);
  const [projectDeployments, setProjectDeployments] = useState<any[]>([]);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logType, setLogType] = useState<'runtime' | 'deployment'>('runtime');

  useEffect(() => {
    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  useEffect(() => {
    if (project) {
      // Fetch system metrics and runtime logs when project is loaded
      fetchSystemMetrics();
      fetchProjectLogs(undefined, 'runtime');
    }
  }, [project]);

  const fetchProject = async () => {
    try {
      const res = await fetch(`http://localhost:3001/api/projects/${projectId}`, {
        headers: { 'x-user-id': 'demo-user' },
      });
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      } else {
        toast.error('Project not found');
        router.push('/projects');
      }
    } catch (error) {
      console.error('Failed to fetch project:', error);
      toast.error('Failed to load project');
      router.push('/projects');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectHealth = async () => {
    if (loadingHealth || !project) return;
    
    setLoadingHealth(true);
    try {
      const res = await fetch(`http://localhost:3001/api/projects/${projectId}/health`, {
        headers: { 'x-user-id': 'demo-user' },
      });
      const data = await res.json();
      if (data.success) {
        setProjectHealth(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch health:', error);
      toast.error('Failed to fetch health data');
    } finally {
      setLoadingHealth(false);
    }
  };

  const fetchProjectMetrics = async () => {
    if (!project) return;
    try {
      const res = await fetch(`http://localhost:3001/api/projects/${projectId}/metrics`, {
        headers: { 'x-user-id': 'demo-user' },
      });
      const data = await res.json();
      if (data.success) {
        setProjectMetrics(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  const fetchSystemMetrics = async () => {
    if (!project) return;
    try {
      const res = await fetch(`http://localhost:3001/api/projects/${projectId}/system-metrics`, {
        headers: { 'x-user-id': 'demo-user' },
      });
      const data = await res.json();
      if (data.success) {
        setSystemMetrics(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch system metrics:', error);
    }
  };

  const fetchProjectDeployments = async () => {
    if (!project) return;
    try {
      const res = await fetch(`http://localhost:3001/api/projects/${projectId}/deployments?limit=5`, {
        headers: { 'x-user-id': 'demo-user' },
      });
      const data = await res.json();
      if (data.success) {
        setProjectDeployments(data.data);
        // Fetch runtime logs (not deployment logs)
        fetchProjectLogs(undefined, 'runtime');
      }
    } catch (error) {
      console.error('Failed to fetch deployments:', error);
    }
  };

  const fetchProjectLogs = async (deploymentId?: string, logType: 'runtime' | 'deployment' = 'runtime') => {
    if (loadingLogs || !project) return;
    
    setLoadingLogs(true);
    try {
      // Get runtime logs by default (console.log, runtime errors)
      // Use type=runtime for runtime logs, type=deployment for build logs
      const params = new URLSearchParams({
        type: logType,
        limit: '200', // Get more logs to filter better
      });
      
      if (deploymentId && logType === 'deployment') {
        params.append('deploymentId', deploymentId);
      }
      
      // Get logs from last 24 hours for runtime logs (to catch recent activity)
      // For deployment logs, we don't need 'since' as we want all build logs
      if (logType === 'runtime') {
        const since = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
        params.append('since', since.toString());
      }
      
      const url = `http://localhost:3001/api/projects/${projectId}/logs?${params.toString()}`;
      
      const res = await fetch(url, {
        headers: { 'x-user-id': 'demo-user' },
      });
      const data = await res.json();
      if (data.success) {
        const logs = data.data || [];
        // Sort by timestamp (newest first)
        const sortedLogs = logs.sort((a: any, b: any) => {
          const timeA = new Date(a.created || a.timestamp || 0).getTime();
          const timeB = new Date(b.created || b.timestamp || 0).getTime();
          return timeB - timeA; // Newest first
        });
        setProjectLogs(sortedLogs);
      } else {
        toast.error(data.error || 'Failed to fetch logs');
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      toast.error('Failed to fetch logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  const refreshHealthData = () => {
    fetchProjectHealth();
    fetchProjectMetrics();
    fetchSystemMetrics();
    fetchProjectDeployments();
  };

  const getStatusColor = (value: number, isError: boolean = false) => {
    if (isError) {
      // For error rates, lower is better
      if (value < 5) return 'text-green-600 dark:text-green-400';
      if (value < 15) return 'text-yellow-600 dark:text-yellow-400';
      return 'text-destructive';
    } else {
      // For resource usage, lower is better
      if (value < 60) return 'text-green-600 dark:text-green-400';
      if (value < 80) return 'text-yellow-600 dark:text-yellow-400';
      return 'text-destructive';
    }
  };

  const toggleProject = async (enabled: boolean) => {
    if (!project) return;
    try {
      const res = await fetch(`http://localhost:3001/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        await fetchProject();
        toast.success(`Monitoring ${enabled ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      console.error('Failed to toggle project:', error);
      toast.error('Failed to update project');
    }
  };

  const toggleAutoFix = async (autoFix: boolean) => {
    if (!project) return;
    try {
      const res = await fetch(`http://localhost:3001/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({ autoFix }),
      });
      if (res.ok) {
        await fetchProject();
        toast.success(`Auto-fix ${autoFix ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      console.error('Failed to toggle auto-fix:', error);
      toast.error('Failed to update project');
    }
  };

  if (loading) {
    return (
      <>
        <Breadcrumbs pageName="Projects" />
        <PageWrapper>
          <Header title="Project Details">Loading project...</Header>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </PageWrapper>
      </>
    );
  }

  if (!project) {
    return null;
  }

  const pageData = {
    name: "Projects",
    title: project.vercelProjectName,
    description: `${project.githubOwner}/${project.githubRepo}`,
  };

  return (
    <>
      <Breadcrumbs pageName={pageData.name} />
      <PageWrapper>
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/projects')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Projects
          </Button>
        </div>
        <Header title={pageData.title}>
          <div className="flex items-center gap-2 flex-wrap">
            <span>{pageData.description}</span>
            <div className="flex items-center gap-2 px-2 py-1 bg-muted rounded-md">
              <span className="text-xs text-muted-foreground font-mono">{projectId}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => {
                  navigator.clipboard.writeText(projectId);
                  toast.success('Project ID copied to clipboard');
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            {project.enabled ? (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="h-3 w-3 mr-1" />
                Disabled
              </Badge>
            )}
            {project.framework && <Badge variant="outline">{project.framework}</Badge>}
          </div>
        </Header>

        <Tabs defaultValue="health" className="w-full">
          <TabsList>
            <TabsTrigger value="health">Health</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          </TabsList>

          <TabsContent value="health" className="space-y-4 mt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium">System Health</h3>
                <p className="text-sm text-muted-foreground">Real-time deployment status and metrics</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshHealthData}
                disabled={loadingHealth}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingHealth ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {loadingHealth ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : projectHealth ? (
              <div className="space-y-4">
                {/* System Metrics (CPU, Memory, Error Rate, Requests/sec) */}
                {systemMetrics && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        System Metrics
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* CPU */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <span>CPU Usage</span>
                          </div>
                          <span className={cn('font-mono font-semibold', getStatusColor(systemMetrics.cpu))}>
                            {systemMetrics.cpu}%
                          </span>
                        </div>
                        <Progress value={systemMetrics.cpu} className="h-2" />
                      </div>

                      {/* Memory */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            <span>Memory</span>
                          </div>
                          <span className={cn('font-mono font-semibold', getStatusColor(systemMetrics.memory))}>
                            {systemMetrics.memory}%
                          </span>
                        </div>
                        <Progress value={systemMetrics.memory} className="h-2" />
                      </div>

                      {/* Error Rate */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Gauge className="h-4 w-4 text-destructive" />
                            <span>Error Rate</span>
                          </div>
                          <span className={cn('font-mono font-semibold', getStatusColor(systemMetrics.errorRate, true))}>
                            {systemMetrics.errorRate.toFixed(1)}%
                          </span>
                        </div>
                        <Progress value={Math.min(systemMetrics.errorRate, 100)} className="h-2" />
                      </div>

                      {/* Requests/sec */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                            <span>Requests/sec</span>
                          </div>
                          <span className="font-mono font-semibold">
                            {systemMetrics.requestsPerSecond.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Health Status */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Deployment Status</span>
                      <Badge
                        variant={
                          projectHealth.status === 'healthy'
                            ? 'default'
                            : projectHealth.status === 'degraded'
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {projectHealth.status || 'unknown'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {projectHealth.deployment && (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Deployment URL:</span>
                          <a
                            href={`https://${projectHealth.deployment.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            {projectHealth.deployment.url}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">State:</span>
                          <span>{projectHealth.deployment.state}</span>
                        </div>
                        {projectHealth.errorCount > 0 && (
                          <div className="flex justify-between text-destructive">
                            <span>Errors:</span>
                            <span>{projectHealth.errorCount}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Metrics */}
                {projectMetrics && (
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-sm text-muted-foreground mb-1">Total Deployments</div>
                        <div className="text-2xl font-bold">{projectMetrics.totalDeployments || 0}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-sm text-muted-foreground mb-1">Success Rate</div>
                        <div className="text-2xl font-bold text-green-600">
                          {projectMetrics.totalDeployments > 0
                            ? Math.round(
                                (projectMetrics.successfulDeployments /
                                  projectMetrics.totalDeployments) *
                                  100
                              )
                            : 0}
                          %
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Recent Deployments */}
                {projectDeployments && projectDeployments.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Recent Deployments</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {projectDeployments.slice(0, 3).map((deployment: any) => (
                          <div
                            key={deployment.uid}
                            className="p-3 bg-muted rounded-lg text-sm flex items-center justify-between"
                          >
                            <div>
                              <div className="font-medium">{deployment.url || 'Deployment'}</div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(deployment.created), 'MMM d, yyyy HH:mm')}
                              </div>
                            </div>
                            <Badge
                              variant={
                                deployment.readyState === 'READY'
                                  ? 'default'
                                  : deployment.readyState === 'ERROR'
                                  ? 'destructive'
                                  : 'secondary'
                              }
                            >
                              {deployment.readyState}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                  <p className="text-muted-foreground">Click "Refresh" to load health data</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="logs" className="space-y-4 mt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium">Runtime Logs</h3>
                <p className="text-sm text-muted-foreground">
                  Runtime errors from SDK and console logs from Vercel Log Drains
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 border rounded-md p-1">
                  <Button
                    variant={logType === 'runtime' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      setLogType('runtime');
                      fetchProjectLogs(undefined, 'runtime');
                    }}
                    className="h-7 text-xs"
                  >
                    Runtime
                  </Button>
                  <Button
                    variant={logType === 'deployment' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => {
                      setLogType('deployment');
                      const latestDeployment = projectDeployments?.[0]?.uid;
                      fetchProjectLogs(latestDeployment, 'deployment');
                    }}
                    className="h-7 text-xs"
                  >
                    Build
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    fetchProjectLogs(undefined, logType);
                  }}
                  disabled={loadingLogs}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loadingLogs ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            {loadingLogs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
                    ) : projectLogs && projectLogs.length > 0 ? (
                      <Card>
                        <CardContent className="p-0">
                          <ScrollArea className="h-[500px] w-full rounded-md border bg-muted/20 p-4">
                            <div className="space-y-1 font-mono text-xs">
                              {projectLogs.map((log: any, index: number) => {
                                // Handle different log formats from Vercel API and SDK
                                const logText = log.message || 
                                               log.payload?.text || 
                                               log.text ||
                                               log.content ||
                                               (typeof log === 'string' ? log : JSON.stringify(log));
                                
                                const logLevel = log.level || 
                                                log.type || 
                                                (logText?.toLowerCase().includes('error') ? 'error' : 
                                                 logText?.toLowerCase().includes('warn') ? 'warn' : 'info');
                                
                                const timestamp = log.timestamp || 
                                                 log.created || 
                                                 log.time ||
                                                 log.date ||
                                                 new Date().toISOString();
                                
                                const isError = logLevel === 'error' || 
                                               logLevel === 'stderr' ||
                                               logText?.toLowerCase().includes('error') ||
                                               logText?.toLowerCase().includes('failed');
                                
                                const isWarning = logLevel === 'warn' || 
                                                 logText?.toLowerCase().includes('warn');
                                
                                // Check if log is from SDK
                                const isFromSDK = log.source === 'client_sdk' || 
                                                 log.metadata?.source === 'client_sdk' ||
                                                 log.source === 'sdk';
                                
                                // Get stack trace if available (from SDK)
                                const stackTrace = log.metadata?.stack || log.stack;
                                
                                return (
                                  <div
                                    key={log.id || index}
                                    className={`flex items-start gap-2 p-2 rounded border ${
                                      isError
                                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                                        : isWarning
                                        ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20'
                                        : logLevel === 'stdout' || logLevel === 'info'
                                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                                        : 'text-muted-foreground border-border'
                                    }`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-muted-foreground flex-shrink-0 text-[10px]">
                                          {timestamp ? format(new Date(timestamp), 'HH:mm:ss.SSS') : '--:--:--'}
                                        </span>
                                        {logLevel && (
                                          <Badge 
                                            variant="outline" 
                                            className={`text-[9px] px-1 py-0 h-4 ${
                                              isError ? 'border-red-500 text-red-600 dark:text-red-400' :
                                              isWarning ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400' :
                                              'border-blue-500 text-blue-600 dark:text-blue-400'
                                            }`}
                                          >
                                            {logLevel.toUpperCase()}
                                          </Badge>
                                        )}
                                        {isFromSDK && (
                                          <Badge 
                                            variant="secondary" 
                                            className="text-[9px] px-1 py-0 h-4 bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30"
                                          >
                                            SDK
                                          </Badge>
                                        )}
                                        {log.url && (
                                          <span className="text-[9px] text-muted-foreground truncate max-w-[200px]">
                                            {log.url}
                                          </span>
                                        )}
                                      </div>
                                      <div className="break-words whitespace-pre-wrap">
                                        {logText}
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
                                      {log.metadata && Object.keys(log.metadata).length > 0 && !stackTrace && (
                                        <details className="mt-2">
                                          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                                            Metadata
                                          </summary>
                                          <pre className="mt-1 text-[10px] text-muted-foreground bg-muted/50 p-2 rounded overflow-x-auto">
                                            {JSON.stringify(log.metadata, null, 2)}
                                          </pre>
                                        </details>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">No runtime logs available</p>
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg text-left max-w-md mx-auto">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                      💡 Get Started with SDK
                    </p>
                    <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                      Add the OutageX SDK to your app to automatically capture runtime errors. SDK logs will appear here with a <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30 inline-block">SDK</Badge> badge.
                    </p>
                    <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                      <strong>Quick Setup:</strong>
                    </p>
                    <ol className="text-xs text-blue-800 dark:text-blue-200 mt-1 ml-4 list-decimal space-y-1">
                      <li>Copy the SDK code from the Settings tab</li>
                      <li>Add it to your app's root layout</li>
                      <li>Errors will automatically appear here</li>
                    </ol>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Project Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Monitoring</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically detect incidents from this project
                    </p>
                  </div>
                  <Switch
                    checked={project.enabled}
                    onCheckedChange={toggleProject}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-Fix</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically create PRs for high-confidence fixes (≥{project.autoFixThreshold}%)
                    </p>
                  </div>
                  <Switch
                    checked={project.autoFix}
                    onCheckedChange={toggleAutoFix}
                  />
                </div>
              </CardContent>
            </Card>

            {/* SDK Setup Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">SDK Setup</CardTitle>
                <CardDescription>
                  Add the Firefighter SDK to your app to automatically capture runtime errors
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Step 1: Add Environment Variable</Label>
                  <div className="bg-muted p-3 rounded-md font-mono text-sm">
                    <div className="text-muted-foreground mb-1">.env.local</div>
                    <div>NEXT_PUBLIC_BACKEND_URL=http://localhost:3001</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Step 2: Initialize SDK in Your App</Label>
                  <div className="bg-muted p-3 rounded-md font-mono text-xs overflow-x-auto">
                    <div className="text-muted-foreground mb-2">// app/layout.tsx or pages/_app.tsx</div>
                    <div className="whitespace-pre-wrap">{`import { initFirefighter } from '@/lib/firefighter-sdk';
import { useEffect } from 'react';

export default function Layout({ children }) {
  useEffect(() => {
    initFirefighter({
      projectId: '${projectId}',
      backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
    });
  }, []);

  return <>{children}</>;
}`}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const code = `import { initFirefighter } from '@/lib/firefighter-sdk';
import { useEffect } from 'react';

export default function Layout({ children }) {
  useEffect(() => {
    initFirefighter({
      projectId: '${projectId}',
      backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
    });
  }, []);

  return <>{children}</>;
}`;
                      navigator.clipboard.writeText(code);
                      toast.success('Code copied to clipboard!');
                    }}
                  >
                    Copy Code
                  </Button>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    ✅ What happens next?
                  </p>
                  <ul className="text-blue-800 dark:text-blue-200 text-xs space-y-1 ml-4 list-disc">
                    <li>SDK automatically captures all unhandled errors</li>
                    <li>Errors are stored in Runtime Logs tab</li>
                    <li>When 3+ errors occur in 5 minutes, incident response triggers automatically</li>
                    <li>System analyzes, researches, and generates fixes</li>
                  </ul>
                </div>

                <div className="pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/SDK_SETUP_GUIDE.md', '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Full Documentation
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Webhook Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <div className="font-medium text-sm">Vercel Webhook</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        ID: {project.vercelWebhookId || 'Not set'}
                      </div>
                    </div>
                    {project.vercelWebhookId && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <div className="font-medium text-sm">GitHub Webhook</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        ID: {project.githubWebhookId || 'Not set'}
                      </div>
                    </div>
                    {project.githubWebhookId && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-100">Webhooks are automatically managed</p>
                  <p className="text-blue-800 dark:text-blue-200 text-xs mt-1">
                    Deleting this project will automatically remove webhooks from Vercel and GitHub
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </>
  );
}

