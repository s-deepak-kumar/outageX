'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirefighterStore } from '@/store/firefighter';
import { Badge } from '@/components/ui/badge';
import { Terminal } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const levelColors = {
  error: 'text-red-600 dark:text-red-400 bg-red-500/10',
  warn: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10',
  info: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  debug: 'text-muted-foreground bg-muted/50',
};

export function LogsViewer() {
  const logs = useFirefighterStore((state) => state.logs);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [logs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          Live Logs
          {logs.length > 0 && (
            <Badge variant="outline" className="ml-auto text-xs">
              {logs.length} entries
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] w-full rounded-md border bg-muted/20 p-3">
          {logs.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Waiting for logs...
            </div>
          ) : (
            <div className="space-y-2 font-mono text-xs">
              {logs.map((log, index) => (
                <div
                  key={`${log.timestamp}-${index}`}
                  className="flex items-start gap-2 hover:bg-muted/50 p-1 rounded transition-colors"
                >
                  <span className="text-muted-foreground flex-shrink-0">
                    {format(new Date(log.timestamp), 'HH:mm:ss')}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'flex-shrink-0 text-[10px] px-1.5 py-0 h-5',
                      levelColors[log.level]
                    )}
                  >
                    {log.level.toUpperCase()}
                  </Badge>
                  <span className="text-muted-foreground flex-shrink-0 text-[10px]">
                    [{log.service}]
                  </span>
                  <span className="flex-1">{log.message}</span>
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

