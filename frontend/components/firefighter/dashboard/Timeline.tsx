'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirefighterStore } from '@/store/firefighter';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Clock, XCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const phaseIcons = {
  detection: '🔍',
  log_analysis: '📊',
  commit_correlation: '🔗',
  research: '🔬',
  diagnosis: '🎯',
  solution_generation: '✨',
  execution: '🚀',
};

const phaseColors = {
  detection: 'text-blue-600 dark:text-blue-400',
  log_analysis: 'text-purple-600 dark:text-purple-400',
  commit_correlation: 'text-indigo-600 dark:text-indigo-400',
  research: 'text-violet-600 dark:text-violet-400',
  diagnosis: 'text-pink-600 dark:text-pink-400',
  solution_generation: 'text-amber-600 dark:text-amber-400',
  execution: 'text-green-600 dark:text-green-400',
};

export function Timeline() {
  const timeline = useFirefighterStore((state) => state.timeline);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Investigation Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {timeline.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No timeline entries yet
          </div>
        ) : (
          <div className="space-y-4">
            {timeline.map((entry, index) => {
              const isLast = index === timeline.length - 1;
              const icon = phaseIcons[entry.phase];
              const color = phaseColors[entry.phase];

              return (
                <div key={entry.id} className="flex gap-3 relative">
                  {/* Timeline line */}
                  {!isLast && (
                    <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-border" />
                  )}

                  {/* Status icon */}
                  <div className="flex-shrink-0 mt-1">
                    {entry.status === 'completed' && (
                      <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                    )}
                    {entry.status === 'in_progress' && (
                      <Loader2 className="h-10 w-10 text-blue-600 dark:text-blue-400 animate-spin" />
                    )}
                    {entry.status === 'failed' && (
                      <XCircle className="h-10 w-10 text-destructive" />
                    )}
                    {entry.status === 'pending' && (
                      <Circle className="h-10 w-10 text-muted-foreground" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{icon}</span>
                        <h4 className={cn('font-medium', color)}>{entry.title}</h4>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                      </span>
                    </div>

                    {entry.description && (
                      <p className="text-sm text-muted-foreground mt-1">{entry.description}</p>
                    )}

                    {entry.metadata && (
                      <div className="mt-2">
                        <Badge variant="outline" className="text-xs">
                          {entry.status}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

