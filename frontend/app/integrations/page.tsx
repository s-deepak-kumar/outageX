'use client';

import { useState, useEffect } from 'react';
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Github, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Plug,
  Trash2,
  ExternalLink 
} from "lucide-react";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// Vercel icon
const VercelIcon = () => (
  <svg width="24" height="24" viewBox="0 0 76 76" className="fill-background">
    <path d="M38 0L0 76h76L38 0z" />
  </svg>
);

const pageData = {
  name: "Integrations",
  title: "Integrations",
  description: "Connect your development tools for automated incident response",
};

interface Integration {
  id: string;
  provider: 'vercel' | 'github';
  enabled: boolean;
  config?: any;
  createdAt: string;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  
  // Dialog states
  const [showVercelDialog, setShowVercelDialog] = useState(false);
  const [showGithubDialog, setShowGithubDialog] = useState(false);
  
  // Form states
  const [vercelToken, setVercelToken] = useState('');
  const [vercelTeamId, setVercelTeamId] = useState('');
  
  const [githubToken, setGithubToken] = useState('');

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/user/integrations', {
        headers: {
          'x-user-id': 'demo-user',
        },
      });
      const data = await response.json();
      if (data.success) {
        setIntegrations(data.data);
      }
    } catch (error) {
      console.error('Error fetching integrations:', error);
      toast.error('Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (provider: string, token: string, config?: any) => {
    try {
      const response = await fetch('http://localhost:3001/api/user/integrations/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider, accessToken: token, config }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`✅ ${data.data.message}`);
        return true;
      } else {
        toast.error(`❌ ${data.error}`);
        return false;
      }
    } catch (error: any) {
      toast.error(`Connection failed: ${error.message}`);
      return false;
    }
  };

  const saveIntegration = async (provider: string, token: string, config: any) => {
    setConnectingProvider(provider);
    
    try {
      // First test connection
      const isValid = await testConnection(provider, token, config);
      
      if (!isValid) {
        setConnectingProvider(null);
        return;
      }
      
      // Save to database
      const response = await fetch('http://localhost:3001/api/user/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({
          provider,
          accessToken: token,
          config,
        }),
      });
      
      const data = await response.json();
      
      if (data.success || response.ok) {
        toast.success(`${provider} connected successfully!`);
        fetchIntegrations();
        
        // Close dialog and reset form
        if (provider === 'vercel') {
          setShowVercelDialog(false);
          setVercelToken('');
          setVercelTeamId('');
        } else if (provider === 'github') {
          setShowGithubDialog(false);
          setGithubToken('');
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to save integration');
      }
    } catch (error: any) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setConnectingProvider(null);
    }
  };

  const deleteIntegration = async (id: string, provider: string) => {
    if (!confirm(`Disconnect ${provider}?`)) return;
    
    try {
      const response = await fetch(`http://localhost:3001/api/user/integrations/${id}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': 'demo-user',
        },
      });
      
      const data = await response.json();
      
      if (data.success || response.ok) {
        toast.success(`${provider} disconnected`);
        fetchIntegrations();
      } else {
        toast.error(data.error || 'Failed to disconnect');
      }
    } catch (error: any) {
      toast.error(`Failed to disconnect: ${error.message}`);
    }
  };

  const isConnected = (provider: string) => {
    return integrations.some(i => i.provider === provider && i.enabled);
  };

  const getIntegration = (provider: string) => {
    return integrations.find(i => i.provider === provider);
  };

  return (
    <>
      <Breadcrumbs pageName={pageData.name} />
      <PageWrapper>
        <Header title={pageData.title}>{pageData.description}</Header>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Vercel Integration */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-foreground">
                      <VercelIcon />
                    </div>
                    <div>
                      <CardTitle>Vercel</CardTitle>
                      <CardDescription>Deployment monitoring</CardDescription>
                    </div>
                  </div>
                  {isConnected('vercel') ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <XCircle className="w-3 h-3 mr-1" />
                      Not Connected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Monitor deployments, track errors, and trigger rollbacks automatically.
                </p>
                {isConnected('vercel') ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setShowVercelDialog(true)}
                      >
                        Reconfigure
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => deleteIntegration(getIntegration('vercel')!.id, 'vercel')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button 
                    onClick={() => setShowVercelDialog(true)} 
                    className="w-full"
                  >
                    <Plug className="w-4 h-4 mr-2" />
                    Connect Vercel
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* GitHub Integration */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Github className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle>GitHub</CardTitle>
                      <CardDescription>Repository access</CardDescription>
                    </div>
                  </div>
                  {isConnected('github') ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <XCircle className="w-3 h-3 mr-1" />
                      Not Connected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Track commits, create PRs, and correlate code changes with incidents.
                </p>
                {isConnected('github') ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setShowGithubDialog(true)}
                      >
                        Reconfigure
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => deleteIntegration(getIntegration('github')!.id, 'github')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button 
                    onClick={() => setShowGithubDialog(true)} 
                    className="w-full"
                  >
                    <Plug className="w-4 h-4 mr-2" />
                    Connect GitHub
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Coming Soon Card */}
            <Card className="opacity-60">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Loader2 className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle>More Coming Soon</CardTitle>
                    <CardDescription>Stay tuned</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Datadog, Sentry, CloudWatch, and more integrations coming soon!
                </p>
                <Button disabled className="w-full">
                  Coming Soon
                </Button>
              </CardContent>
            </Card>

          </div>
        )}

        {/* Vercel Dialog */}
        <Dialog open={showVercelDialog} onOpenChange={setShowVercelDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Vercel</DialogTitle>
              <DialogDescription>
                Enter your Vercel API token. You'll select projects in the Projects page.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="vercel-token">API Token *</Label>
                <Input
                  id="vercel-token"
                  type="password"
                  placeholder="vercel_abc123..."
                  value={vercelToken}
                  onChange={(e) => setVercelToken(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Get from: <a href="https://vercel.com/account/tokens" target="_blank" className="underline">vercel.com/account/tokens</a>
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="vercel-team">Team ID (Optional)</Label>
                <Input
                  id="vercel-team"
                  placeholder="team_abc123..."
                  value={vercelTeamId}
                  onChange={(e) => setVercelTeamId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Only needed if using a team account
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowVercelDialog(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => saveIntegration('vercel', vercelToken, {
                  teamId: vercelTeamId || undefined,
                })}
                disabled={!vercelToken || connectingProvider === 'vercel'}
              >
                {connectingProvider === 'vercel' && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Connect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* GitHub Dialog */}
        <Dialog open={showGithubDialog} onOpenChange={setShowGithubDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect GitHub</DialogTitle>
              <DialogDescription>
                Enter your GitHub personal access token. Repository will be auto-detected from Vercel projects.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="github-token">Personal Access Token *</Label>
                <Input
                  id="github-token"
                  type="password"
                  placeholder="ghp_abc123..."
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Get from: <a href="https://github.com/settings/tokens" target="_blank" className="underline">github.com/settings/tokens</a>
                  <br />
                  Required scope: <code className="text-xs">repo</code>
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowGithubDialog(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => saveIntegration('github', githubToken, {})}
                disabled={!githubToken || connectingProvider === 'github'}
              >
                {connectingProvider === 'github' && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Connect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </PageWrapper>
    </>
  );
}

