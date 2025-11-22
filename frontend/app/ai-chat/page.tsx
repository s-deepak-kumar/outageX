'use client';

import { useState, useEffect, useRef } from 'react';
import { PageWrapper } from "@/components/parts/page-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Loader2, Send, Bot, User, Code } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const pageData = {
  name: "AI Chat",
};

interface Project {
  id: string;
  vercelProjectName: string;
  githubOwner: string;
  githubRepo: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIChatPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const fetchProjects = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${backendUrl}/api/projects`, {
        headers: { 'x-user-id': 'demo-user' },
      });
      
      if (res.ok) {
        const data = await res.json();
        const projectsWithGitHub = data.filter((p: any) => p.githubOwner && p.githubRepo);
        setProjects(projectsWithGitHub);
        
        // Auto-select first project if available
        if (projectsWithGitHub.length > 0 && !selectedProject) {
          setSelectedProject(projectsWithGitHub[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedProject || loading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({
          projectId: selectedProject.id,
          githubOwner: selectedProject.githubOwner,
          githubRepo: selectedProject.githubRepo,
          question: userMessage.content,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: data.response || 'Sorry, I could not generate a response.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error('Failed to get AI response', {
        description: error.message || 'Please try again.',
      });
      
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
                  setMessages([]); // Clear messages when project changes
                }}
              >
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 ? (
                    <SelectItem value="no-projects" disabled>
                      No projects with GitHub repos found
                    </SelectItem>
                  ) : (
                    projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.vercelProjectName} ({project.githubOwner}/{project.githubRepo})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
            {/* {selectedProject && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Code className="h-3 w-3" />
                {selectedProject.githubOwner}/{selectedProject.githubRepo}
              </Badge>
            )} */}
          </div>
        </div>
      </div>
      <PageWrapper>
        <div className="flex flex-col h-full">
          {/* Chat Interface - ChatGPT Style */}
          <div className="flex flex-col flex-1 min-h-0 border rounded-lg bg-background overflow-hidden">
          {/* Messages Area */}
          <div 
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-4 py-6 space-y-6"
          >
            {!selectedProject ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Please select a project to start chatting</p>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">How can I help you today?</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Ask me anything about your project code, structure, or issues.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-md">
                  <button
                    onClick={() => setInput("What's the main entry point of this project?")}
                    className="text-left p-3 rounded-lg border hover:bg-accent text-sm transition-colors"
                  >
                    What's the main entry point?
                  </button>
                  <button
                    onClick={() => setInput("Show me the code structure")}
                    className="text-left p-3 rounded-lg border hover:bg-accent text-sm transition-colors"
                  >
                    Show me the code structure
                  </button>
                  <button
                    onClick={() => setInput("What issues are in the code?")}
                    className="text-left p-3 rounded-lg border hover:bg-accent text-sm transition-colors"
                  >
                    What issues are in the code?
                  </button>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-4 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div
                      className={`flex flex-col gap-2 max-w-[85%] ${
                        message.role === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-3 ${
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-muted rounded-bl-sm'
                        }`}
                      >
                        {message.role === 'assistant' ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown
                              components={{
                                code: ({ node, inline, className, children, ...props }: any) => {
                                  const match = /language-(\w+)/.exec(className || '');
                                  const codeString = String(children).replace(/\n$/, '');
                                  
                                  if (!inline && match) {
                                    return (
                                      <SyntaxHighlighter
                                        style={oneDark}
                                        language={match[1]}
                                        PreTag="div"
                                        className="rounded-lg !mt-2 !mb-2"
                                        {...props}
                                      >
                                        {codeString}
                                      </SyntaxHighlighter>
                                    );
                                  }
                                  return (
                                    <code className="bg-muted-foreground/20 px-1.5 py-0.5 rounded text-sm" {...props}>
                                      {children}
                                    </code>
                                  );
                                },
                                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                                li: ({ children }) => <li className="ml-4">{children}</li>,
                                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {message.content}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground px-1">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {message.role === 'user' && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-4 justify-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area - Fixed at Bottom */}
          <div className="border-t bg-background px-4 py-3">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-2 items-end">
                <div className="flex-1 relative">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={
                      selectedProject
                        ? "Message AI..."
                        : "Select a project first"
                    }
                    disabled={!selectedProject || loading}
                    className="min-h-[44px] pr-12 resize-none"
                  />
                </div>
                <Button
                  onClick={handleSend}
                  disabled={!selectedProject || !input.trim() || loading}
                  size="icon"
                  className="h-11 w-11 shrink-0"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </PageWrapper>
    </>
  );
}

