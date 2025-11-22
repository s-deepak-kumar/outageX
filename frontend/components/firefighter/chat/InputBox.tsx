'use client';

import { useState, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';
import { sendChatMessage } from '@/lib/socket';
import { useFirefighterStore } from '@/store/firefighter';

export function InputBox() {
  const [message, setMessage] = useState('');
  const isConnected = useFirefighterStore((state) => state.isConnected);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim() && isConnected) {
      sendChatMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isConnected ? "Ask the agent anything..." : "Connecting..."}
        disabled={!isConnected}
        className="min-h-[60px] max-h-[120px] resize-none bg-[#1a1f35]/50 border-gray-800 focus:border-purple-500/50"
        rows={2}
      />
      <Button
        type="submit"
        size="lg"
        disabled={!message.trim() || !isConnected}
        className="px-4"
      >
        <Send className="h-5 w-5" />
      </Button>
    </form>
  );
}

