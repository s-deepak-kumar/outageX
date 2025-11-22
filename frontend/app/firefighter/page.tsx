'use client';

import { useEffect } from 'react';
import { useFirefighterStore } from '@/store/firefighter';
import { initializeSocket, disconnectSocket, triggerIncident } from '@/lib/socket';
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Flame, MessageSquare, Activity, Search, Wrench, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { IncidentCard } from '@/components/firefighter/dashboard/IncidentCard';
import { SystemHealth } from '@/components/firefighter/dashboard/SystemHealth';
import { Timeline } from '@/components/firefighter/dashboard/Timeline';
import { LogsViewer } from '@/components/firefighter/dashboard/LogsViewer';
import { SolutionCard } from '@/components/firefighter/dashboard/SolutionCard';
import { ChatInterface } from '@/components/firefighter/chat/ChatInterface';

const pageData = {
  name: "Firefighter",
  title: "DevOps Firefighter",
  description: "AI-powered autonomous incident response system",
};

export default function FirefighterPage() {
  const isConnected = useFirefighterStore((state) => state.isConnected);
  const incident = useFirefighterStore((state) => state.incident);
  const solution = useFirefighterStore((state) => state.currentSolution);

  useEffect(() => {
    // Initialize socket connection
    initializeSocket();

    // Cleanup on unmount
    return () => {
      disconnectSocket();
    };
  }, []);

  const handleTriggerIncident = () => {
    triggerIncident();
  };

  const canTrigger = isConnected && (!incident || incident.status === 'resolved');

  return (
    <>
      <Breadcrumbs pageName={pageData.name} />
      <PageWrapper>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Header title={pageData.title}>
              {pageData.description}
            </Header>
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

          <Button
            onClick={handleTriggerIncident}
            disabled={!canTrigger}
            variant="destructive"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Trigger Incident
          </Button>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">
              <Activity className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="incident">
              <Flame className="w-4 h-4 mr-2" />
              Incident
            </TabsTrigger>
            <TabsTrigger value="analysis">
              <Search className="w-4 h-4 mr-2" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="solution">
              <Wrench className="w-4 h-4 mr-2" />
              Solution
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageSquare className="w-4 h-4 mr-2" />
              AI Chat
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SystemHealth />
              <Timeline />
            </div>

            {incident && <IncidentCard />}
            
            <LogsViewer />
          </TabsContent>

          <TabsContent value="incident" className="mt-4">
            {incident ? (
              <IncidentCard />
            ) : (
              <Card className="p-8">
                <div className="text-center text-muted-foreground">
                  <Flame className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No active incidents. System is healthy.</p>
                  <Button 
                    onClick={handleTriggerIncident}
                    disabled={!canTrigger}
                    variant="outline" 
                    className="mt-4"
                  >
                    Trigger Demo Incident
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analysis" className="mt-4">
            <LogsViewer />
          </TabsContent>

          <TabsContent value="solution" className="mt-4">
            {solution ? (
              <SolutionCard />
            ) : (
              <Card className="p-8">
                <div className="text-center text-muted-foreground">
                  <Wrench className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No solutions generated yet.</p>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="chat" className="mt-4">
            <Card className="p-0 overflow-hidden">
              <div className="h-[600px]">
                <ChatInterface />
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </PageWrapper>
    </>
  );
}
