'use client';

import { useState, useEffect, useRef } from 'react';
import { PageWrapper } from "@/components/parts/page-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Terminal, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { initializeSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { useFirefighterStore } from '@/store/firefighter';
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const pageData = {
  name: "Logs",
};

interface Project {
  id: string;
  vercelProjectName: string;
  githubOwner: string;
  githubRepo: string;
}

interface LogEntry {
  id: string;
  projectId: string;
  timestamp: Date | string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  source?: string;
  url?: string;
  metadata?: Record<string, any>;
}

const levelColors = {
  error: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20',
  warn: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  info: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
  debug: 'text-muted-foreground bg-muted/50 border-border',
};

export default function LogsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const isConnected = useFirefighterStore((state) => state.isConnected);

  // Initialize socket connection once
  useEffect(() => {
    fetchProjects();
    const socket = initializeSocket();

    return () => {
      // Don't disconnect socket here - let it stay connected for other pages
      socket.off('logs:stream');
    };
  }, []);

  // Listen for live logs from socket
  useEffect(() => {
    let socket = getSocket();
    if (!socket) {
      console.log('⚠️ Socket not available, initializing...');
      socket = initializeSocket();
    }
    
    if (!socket) {
      console.error('❌ Failed to initialize socket');
      return;
    }

    // Wait for socket to connect
    if (!socket.connected) {
      console.log('⏳ Socket not connected, waiting...');
      socket.on('connect', () => {
        console.log('✅ Socket connected');
      });
    } else {
      console.log('✅ Socket already connected');
    }

    const handleLogsStream = (data: any) => {
      console.log('📥 Received logs:stream event:', {
        logsCount: data.logs?.length || 0,
        selectedProjectId: selectedProject?.id,
        selectedProjectName: selectedProject?.vercelProjectName,
      });

      if (!data.logs || !Array.isArray(data.logs)) {
        console.warn('⚠️ Invalid logs data:', data);
        return;
      }

      const newLogs = data.logs.map((log: any) => ({
        ...log,
        timestamp: new Date(log.timestamp),
      }));
      
      console.log('📋 Processed logs:', {
        count: newLogs.length,
        projectIds: newLogs.map((l: any) => l.projectId),
      });
      
      // Only add logs if they match the selected project
      if (selectedProject) {
        const projectLogs = newLogs.filter((log: any) => {
          const matches = log.projectId === selectedProject.id || 
                        log.projectName === selectedProject.vercelProjectName;
          if (!matches) {
            console.log('🔍 Log filtered out:', {
              logProjectId: log.projectId,
              selectedProjectId: selectedProject.id,
              logProjectName: log.projectName,
              selectedProjectName: selectedProject.vercelProjectName,
            });
          }
          return matches;
        });
        
        console.log('✅ Matching logs:', {
          count: projectLogs.length,
          totalLogs: newLogs.length,
        });
        
        if (projectLogs.length > 0) {
          // Append new logs to the end (ascending order: oldest first, newest at bottom)
          setLogs((prev) => {
            // Filter out duplicates by id
            const existingIds = new Set(prev.map(l => l.id));
            const uniqueNewLogs = projectLogs.filter((l: any) => !existingIds.has(l.id));
            
            if (uniqueNewLogs.length === 0) {
              console.log('⚠️ All new logs are duplicates, skipping');
              return prev;
            }
            
            console.log('➕ Adding new logs:', uniqueNewLogs.length, 'Current count:', prev.length);
            
            const combined = [...prev, ...uniqueNewLogs];
            // Sort by timestamp ascending (oldest first)
            const sorted = combined.sort((a, b) => {
              const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
              const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
              return timeA - timeB;
            });
            // Keep last 1000 logs
            const result = sorted.slice(-1000);
            console.log('📊 Total logs after update:', result.length);
            return result;
          });
        }
      } else {
        console.log('⚠️ No project selected, ignoring logs');
      }
    };

    socket.on('logs:stream', handleLogsStream);
    console.log('✅ Socket listener set up for logs:stream');

    return () => {
      socket.off('logs:stream', handleLogsStream);
      console.log('🧹 Socket listener removed');
    };
  }, [selectedProject]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (selectedProject) {
      fetchLogs();
    } else {
      setLogs([]);
    }
  }, [selectedProject]);

  const fetchProjects = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/projects`, {
        headers: { 'x-user-id': 'demo-user' },
      });
      
      if (res.ok) {
        const data = await res.json();
        setProjects(data || []);
        
        // Auto-select first project if available
        if (data.length > 0 && !selectedProject) {
          setSelectedProject(data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchLogs = async () => {
    if (!selectedProject || loadingLogs) return;
    
    setLoadingLogs(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const params = new URLSearchParams({
        type: 'runtime',
        limit: '200',
      });
      
      const since = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
      params.append('since', since.toString());
      
      const url = `${backendUrl}/api/projects/${selectedProject.id}/logs?${params.toString()}`;
      
      const res = await fetch(url, {
        headers: { 'x-user-id': 'demo-user' },
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch logs');
      }
      
      const data = await res.json();
      if (data.success) {
        const fetchedLogs = (data.data || []).map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp || log.created || Date.now()),
        }));
        
        // Sort by timestamp (ascending: oldest first, newest at bottom)
        const sortedLogs = fetchedLogs.sort((a: LogEntry, b: LogEntry) => {
          const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
          const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
          return timeA - timeB;
        });
        
        setLogs(sortedLogs);
        
        // Scroll to bottom after loading
        setTimeout(() => {
          if (logsContainerRef.current) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
          }
        }, 100);
      } else {
        toast.error(data.error || 'Failed to fetch logs');
      }
    } catch (error: any) {
      console.error('Failed to fetch logs:', error);
      toast.error('Failed to fetch logs', {
        description: error.message || 'Please try again.',
      });
    } finally {
      setLoadingLogs(false);
    }
  };

  return (
    <>
      {/* Sticky Breadcrumb with Project Selector */}
      <div className="sticky top-0 z-10 bg-background">
        <div className="h-[67.63px] bg-muted/50 rounded-lg border flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <BreadcrumbList className="flex items-center gap-2">
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbPage className="px-2 py-1 border bg-background rounded-sm">
                <BreadcrumbLink>{pageData.name}</BreadcrumbLink>
              </BreadcrumbPage>
            </BreadcrumbList>
          </div>
          <div className="flex items-center gap-3">
            {loadingProjects ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Select
                value={selectedProject?.id || ''}
                onValueChange={(value) => {
                  const project = projects.find((p) => p.id === value);
                  setSelectedProject(project || null);
                  setLogs([]); // Clear logs when project changes
                }}
              >
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 ? (
                    <SelectItem value="no-projects" disabled>
                      No projects found
                    </SelectItem>
                  ) : (
                    projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.vercelProjectName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
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
        </div>
      </div>
      <PageWrapper>
        <div className="flex flex-col h-full">
          {/* Logs Display */}
          <div className="flex flex-col flex-1 min-h-0 border rounded-lg bg-background overflow-hidden">
            <div className="border-b p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Live Logs</h2>
                {selectedProject && (
                  <Badge variant="outline" className="ml-2">
                    {selectedProject.vercelProjectName}
                  </Badge>
                )}
              </div>
              {logs.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {logs.length} entries
                </Badge>
              )}
            </div>

            <div 
              ref={logsContainerRef}
              className="flex-1 overflow-y-auto p-4"
            >
              {!selectedProject ? (
                <div className="flex items-center justify-center h-full text-muted-foreground py-12">
                  <div className="text-center">
                    <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Please select a project to view logs</p>
                  </div>
                </div>
              ) : loadingLogs ? (
                <div className="flex items-center justify-center h-full py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : logs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground py-12">
                  <div className="text-center">
                    <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No logs found for this project</p>
                    <p className="text-sm mt-2">Logs will appear here when your application generates them</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 font-mono text-xs">
                  {logs.map((log, index) => {
                    const logTimestamp = log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp);
                    const logMessage = log.message || log.metadata?.message || JSON.stringify(log.metadata || {});
                    const logLevel = log.level || 'info';
                    const isError = logLevel === 'error';
                    const isWarning = logLevel === 'warn';
                    const isFromSDK = log.source === 'client_sdk' || log.metadata?.source === 'client_sdk';
                    const stackTrace = log.metadata?.stack || log.stack;

                    return (
                      <div
                        key={log.id || `${logTimestamp.getTime()}-${index}`}
                        className={cn(
                          "flex items-start gap-2 p-2 rounded border transition-colors",
                          isError
                            ? levelColors.error
                            : isWarning
                            ? levelColors.warn
                            : logLevel === 'info'
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
                              {logLevel.toUpperCase()}
                            </Badge>
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
          </div>
        </div>
      </PageWrapper>
    </>
  );
}
