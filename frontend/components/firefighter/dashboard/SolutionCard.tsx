'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFirefighterStore } from '@/store/firefighter';
import { executeSolution } from '@/lib/socket';
import { CodeBlock } from '../shared/CodeBlock';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Target,
  Sparkles,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export function SolutionCard() {
  const solution = useFirefighterStore((state) => state.currentSolution);
  const rootCause = useFirefighterStore((state) => state.rootCause);
  const incident = useFirefighterStore((state) => state.incident);

  if (!solution) {
    return null;
  }

  const riskVariants = {
    low: 'outline',
    medium: 'secondary',
    high: 'destructive',
  } as const;

  const isExecuting = incident?.status === 'executing';
  const isResolved = incident?.status === 'resolved';

  const handleExecute = () => {
    if (solution && !isExecuting && !isResolved) {
      executeSolution(solution.id);
    }
  };

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="relative">
        <div className="flex items-start justify-between mb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            Proposed Solution
          </CardTitle>
          <Badge variant={riskVariants[solution.risk]}>
            {solution.risk.toUpperCase()} RISK
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="relative space-y-4">
        {/* Root Cause (if available) */}
        {rootCause && (
          <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-destructive" />
              <h4 className="font-semibold text-sm text-destructive">Root Cause</h4>
              <Badge variant="outline" className="ml-auto text-xs">
                {rootCause.confidence}% confidence
              </Badge>
            </div>
            <p className="text-sm">{rootCause.description}</p>
          </div>
        )}

        {/* Solution Details */}
        <div>
          <h3 className="font-semibold text-base mb-2">{solution.description}</h3>
          <p className="text-sm text-muted-foreground">{solution.reasoning}</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Type</div>
            <div className="text-sm font-medium capitalize">{solution.type}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Confidence</div>
            <div className="text-sm font-medium">{solution.confidence}%</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ETA
            </div>
            <div className="text-sm font-medium">{solution.estimatedTime}</div>
          </Card>
        </div>

        {/* Expandable Sections */}
        <Accordion type="single" collapsible className="w-full">
          {/* Steps */}
          <AccordionItem value="steps">
            <AccordionTrigger className="text-sm">
              Implementation Steps ({solution.steps.length})
            </AccordionTrigger>
            <AccordionContent>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                {solution.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>

          {/* Code */}
          {solution.code && (
            <AccordionItem value="code">
              <AccordionTrigger className="text-sm">View Solution Code</AccordionTrigger>
              <AccordionContent>
                <CodeBlock code={solution.code} language="typescript" />
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Test Results */}
          {solution.testResults && (
            <AccordionItem value="tests">
              <AccordionTrigger className="text-sm">
                Test Results
                {solution.testResults.success ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 ml-2" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive ml-2" />
                )}
              </AccordionTrigger>
              <AccordionContent>
                <div
                  className={cn(
                    'p-3 rounded-lg text-sm',
                    solution.testResults.success
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-destructive/10 text-destructive'
                  )}
                >
                  <pre className="whitespace-pre-wrap font-mono text-xs">
                    {solution.testResults.output}
                  </pre>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>

        {/* Action Button */}
        <Button
          onClick={handleExecute}
          disabled={isExecuting || isResolved}
          className={cn(
            'w-full',
            isExecuting && 'animate-pulse'
          )}
          variant={isResolved ? "outline" : "default"}
          size="lg"
        >
          {isResolved ? (
            <>
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Solution Executed
            </>
          ) : isExecuting ? (
            <>
              <Play className="h-5 w-5 mr-2 animate-spin" />
              Executing...
            </>
          ) : (
            <>
              <Play className="h-5 w-5 mr-2" />
              Execute Solution
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
