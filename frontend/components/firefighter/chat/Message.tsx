'use client';

import ReactMarkdown from 'react-markdown';
import { CodeBlock } from '../shared/CodeBlock';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, User, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType } from '@/store/firefighter';
import { format } from 'date-fns';

interface MessageProps {
  message: ChatMessageType;
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      className={cn(
        'flex gap-3 items-start',
        isUser && 'flex-row-reverse',
        isSystem && 'justify-center'
      )}
    >
      {/* Avatar */}
      {!isSystem && (
        <Avatar className="h-8 w-8 mt-1">
          <AvatarFallback className={isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}>
            {isUser ? (
              <User className="h-4 w-4" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message Content */}
      <div
        className={cn(
          'flex-1 max-w-[85%]',
          isUser && 'flex flex-col items-end',
          isSystem && 'max-w-full'
        )}
      >
        <div
          className={cn(
            'rounded-lg px-4 py-3',
            isUser && 'bg-primary text-primary-foreground',
            !isUser && !isSystem && 'bg-muted',
            isSystem && 'bg-muted/50 border'
          )}
        >
          {isSystem && (
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-muted-foreground">SYSTEM</span>
            </div>
          )}

          <div
            className={cn(
              'prose prose-sm max-w-none',
              isUser && 'prose-invert',
              'prose-p:my-1 prose-p:leading-relaxed',
              'prose-headings:font-semibold prose-headings:my-2',
              'prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded',
              'prose-pre:bg-transparent prose-pre:p-0',
              'prose-ul:my-1 prose-ol:my-1',
              'prose-li:my-0.5'
            )}
          >
            <ReactMarkdown
              components={{
                code: ({ node, className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children).replace(/\n$/, '');
                  const inline = !className || !className.includes('language-');

                  if (!inline && match) {
                    return (
                      <CodeBlock
                        code={codeString}
                        language={match[1]}
                        showLineNumbers={false}
                      />
                    );
                  }

                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Timestamp */}
        <div
          className={cn(
            'text-xs text-muted-foreground mt-1 px-1',
            isUser && 'text-right'
          )}
        >
          {format(new Date(message.timestamp), 'HH:mm:ss')}
        </div>
      </div>
    </div>
  );
}

