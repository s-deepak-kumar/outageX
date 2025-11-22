'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckCircle2, XCircle, AlertCircle, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { toast } from "sonner";

const pageData = {
  name: "Projects",
  title: "Projects",
  description: "Connect your Vercel projects for automated incident detection and resolution",
};

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

interface VercelProject {
  id: string;
  name: string;
  framework: string;
  link?: {
    type: string;
    repo: string;
    org?: string;
    repoId?: number;
  };
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [availableProjects, setAvailableProjects] = useState<VercelProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [addingProject, setAddingProject] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  // Fetch available projects when dialog opens
  useEffect(() => {
    if (dialogOpen) {
      fetchAvailableProjects();
      setSearchQuery('');
    }
  }, [dialogOpen]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/projects', {
        headers: { 'x-user-id': 'demo-user' },
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to fetch projects:', error);
        toast.error('Failed to load projects', {
          description: error.error || `HTTP ${res.status}`,
        });
        return;
      }
      
      const data = await res.json();
      setProjects(data || []);
    } catch (error: any) {
      console.error('Failed to fetch projects:', error);
      toast.error('Failed to load projects', {
        description: error.message || 'Network error',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch('http://localhost:3001/api/projects/available', {
        headers: { 'x-user-id': 'demo-user' },
      });
      const data = await res.json();
      console.log('Fetched available projects:', data);
      // Ensure projects have required fields
      const validProjects = data.filter((p: any) => p.id && p.name);
      setAvailableProjects(validProjects);
    } catch (error) {
      console.error('Failed to fetch available projects:', error);
      toast.error('Failed to load Vercel projects');
    } finally {
      setLoadingProjects(false);
    }
  };

  const addProject = async (project: VercelProject) => {
    console.log('addProject called with:', project);
    
    // Validate project has required fields
    if (!project || !project.id || !project.name) {
      console.error('Invalid project object:', project);
      toast.error('Invalid project data', {
        description: 'Project information is missing.',
      });
      return;
    }

    // Check if GitHub repo is linked
    const hasGitHubLink = project.link?.type === 'github' && project.link.repo;
    
    if (!hasGitHubLink) {
      toast.error('GitHub repository not linked', {
        description: 'This Vercel project doesn\'t have a GitHub repository linked. Please link it in Vercel first.',
      });
      return;
    }

    // Parse GitHub repo
    // Vercel API can return repo as either "owner/repo" or just "repo" with org in link.org
    if (!project.link || !project.link.repo) {
      toast.error('GitHub repository not linked', {
        description: 'This Vercel project doesn\'t have a GitHub repository linked.',
      });
      return;
    }

    let githubOwner: string;
    let githubRepo: string;
    
    if (project.link.repo.includes('/')) {
      // Format: "owner/repo"
      const repoParts = project.link.repo.split('/').filter(Boolean);
      if (repoParts.length !== 2) {
        console.error('Invalid repo format:', project.link.repo);
        toast.error('Invalid GitHub repository format', {
          description: `GitHub repository must be in format: owner/repo. Got: ${project.link.repo}`,
        });
        return;
      }
      [githubOwner, githubRepo] = repoParts;
    } else {
      // Format: just "repo" - use link.org as owner
      if (!project.link.org) {
        console.error('Missing org for repo:', project.link.repo);
        toast.error('Missing GitHub organization', {
          description: 'Could not determine GitHub repository owner.',
        });
        return;
      }
      githubOwner = project.link.org;
      githubRepo = project.link.repo;
    }

    // Final validation
    if (!githubOwner || !githubRepo) {
      console.error('Failed to parse GitHub repo:', { 
        repo: project.link.repo,
        githubOwner, 
        githubRepo 
      });
      toast.error('Invalid GitHub repository', {
        description: 'Could not parse GitHub repository information.',
      });
      return;
    }

    const requestBody = {
      vercelProjectId: String(project.id),
      vercelProjectName: String(project.name),
      githubOwner: String(githubOwner),
      githubRepo: String(githubRepo),
      autoFix: false,
      autoFixThreshold: 90,
    };

    console.log('Sending request body:', requestBody);

    setAddingProject(project.id);
    try {
      const res = await fetch('http://localhost:3001/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        await fetchProjects();
        await fetchAvailableProjects();
        toast.success('Project added successfully', {
          description: 'Webhooks have been automatically configured',
        });
      } else {
        const error = await res.json();
        toast.error('Failed to add project', {
          description: error.error,
        });
      }
    } catch (error) {
      console.error('Failed to add project:', error);
      toast.error('Failed to add project', {
        description: 'Please try again',
      });
    } finally {
      setAddingProject(null);
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Are you sure? This will remove webhooks from Vercel and GitHub.')) return;

    try {
      const res = await fetch(`http://localhost:3001/api/projects/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': 'demo-user' },
      });

      if (res.ok) {
        await fetchProjects();
        await fetchAvailableProjects();
        toast.success('Project removed', {
          description: 'Webhooks have been removed from Vercel and GitHub',
        });
      } else {
        const error = await res.json();
        toast.error('Failed to delete project', {
          description: error.error,
        });
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
      toast.error('Failed to delete project');
    }
  };

  const toggleProject = async (id: string, enabled: boolean) => {
    try {
      await fetch(`http://localhost:3001/api/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({ enabled }),
      });
      await fetchProjects();
    } catch (error) {
      console.error('Failed to toggle project:', error);
    }
  };

  const toggleAutoFix = async (id: string, autoFix: boolean) => {
    try {
      await fetch(`http://localhost:3001/api/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({ autoFix }),
      });
      await fetchProjects();
    } catch (error) {
      console.error('Failed to toggle auto-fix:', error);
    }
  };


  if (loading) {
    return (
      <>
        <Breadcrumbs pageName={pageData.name} />
        <PageWrapper>
          <Header title={pageData.title}>{pageData.description}</Header>
          <div className="animate-pulse">Loading projects...</div>
        </PageWrapper>
      </>
    );
  }

  return (
    <>
      <Breadcrumbs pageName={pageData.name} />
      <PageWrapper>
        <Header title={pageData.title}>{pageData.description}</Header>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-4">
                Connect a Vercel project to enable automatic incident detection and resolution
              </p>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Project
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Add Project</DialogTitle>
                    <DialogDescription>
                      Select a Vercel project to monitor. Projects with GitHub links will be auto-detected.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex-1 overflow-hidden mt-4">
                    {loadingProjects ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : availableProjects.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No available projects found.</p>
                        <p className="text-sm mt-2">Make sure you've connected your Vercel account in Integrations.</p>
                      </div>
                    ) : (
                      <Command className="rounded-lg border">
                        <CommandInput 
                          placeholder="Search projects..." 
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                        />
                        <CommandList className="max-h-[400px]">
                          <CommandEmpty>No projects found.</CommandEmpty>
                          <CommandGroup>
                            {availableProjects
                              .filter((project) => 
                                project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                project.framework?.toLowerCase().includes(searchQuery.toLowerCase())
                              )
                              .map((project) => {
                                const hasGitHub = project.link?.type === 'github' && project.link?.repo;
                                // Format repo display: "owner/repo" or just "repo"
                                const repoDisplay = hasGitHub && project.link
                                  ? (project.link.repo.includes('/') 
                                      ? project.link.repo 
                                      : `${project.link.org || 'unknown'}/${project.link.repo}`)
                                  : null;
                                return (
                                  <CommandItem
                                    key={project.id}
                                    className="flex items-center justify-between px-3 py-2 cursor-default"
                                    onSelect={() => {}}
                                  >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{project.name}</div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                          <Badge variant="outline" className="text-xs py-0">{project.framework}</Badge>
                                          {hasGitHub && repoDisplay && (
                                            <span className="truncate">→ {repoDisplay}</span>
                                          )}
                                          {!hasGitHub && (
                                            <span className="text-yellow-600 dark:text-yellow-400">⚠ No GitHub link</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="ml-2 h-7 px-3"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        addProject(project);
                                      }}
                                      disabled={addingProject === project.id || !hasGitHub}
                                    >
                                      {addingProject === project.id ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Adding...
                                        </>
                                      ) : (
                                        'Add'
                                      )}
                                    </Button>
                                  </CommandItem>
                                );
                              })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex justify-end mb-4">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Project
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Add Project</DialogTitle>
                    <DialogDescription>
                      Select a Vercel project to monitor. Projects with GitHub links will be auto-detected.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex-1 overflow-hidden mt-4">
                    {loadingProjects ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : availableProjects.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No available projects found.</p>
                        <p className="text-sm mt-2">Make sure you've connected your Vercel account in Integrations.</p>
                      </div>
                    ) : (
                      <Command className="rounded-lg border">
                        <CommandInput 
                          placeholder="Search projects..." 
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                        />
                        <CommandList className="max-h-[400px]">
                          <CommandEmpty>No projects found.</CommandEmpty>
                          <CommandGroup>
                            {availableProjects
                              .filter((project) => 
                                project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                project.framework?.toLowerCase().includes(searchQuery.toLowerCase())
                              )
                              .map((project) => {
                                const hasGitHub = project.link?.type === 'github' && project.link?.repo;
                                // Format repo display: "owner/repo" or just "repo"
                                const repoDisplay = hasGitHub && project.link
                                  ? (project.link.repo.includes('/') 
                                      ? project.link.repo 
                                      : `${project.link.org || 'unknown'}/${project.link.repo}`)
                                  : null;
                                return (
                                  <CommandItem
                                    key={project.id}
                                    className="flex items-center justify-between px-3 py-2 cursor-default"
                                    onSelect={() => {}}
                                  >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{project.name}</div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                          <Badge variant="outline" className="text-xs py-0">{project.framework}</Badge>
                                          {hasGitHub && repoDisplay && (
                                            <span className="truncate">→ {repoDisplay}</span>
                                          )}
                                          {!hasGitHub && (
                                            <span className="text-yellow-600 dark:text-yellow-400">⚠ No GitHub link</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="ml-2 h-7 px-3"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        addProject(project);
                                      }}
                                      disabled={addingProject === project.id || !hasGitHub}
                                    >
                                      {addingProject === project.id ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Adding...
                                        </>
                                      ) : (
                                        'Add'
                                      )}
                                    </Button>
                                  </CommandItem>
                                );
                              })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <Card 
                  key={project.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <CardTitle className="flex items-center gap-2">
                          {project.vercelProjectName}
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
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <span className="text-xs">
                            {project.githubOwner}/{project.githubRepo}
                          </span>
                          {project.framework && <Badge variant="outline" className="text-xs">{project.framework}</Badge>}
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProject(project.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Auto-Fix:</span>
                        <Badge variant={project.autoFix ? "default" : "secondary"}>
                          {project.autoFix ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Webhooks:</span>
                        <div className="flex gap-1">
                          {project.vercelWebhookId && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          {project.githubWebhookId && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </PageWrapper>
    </>
  );
}

