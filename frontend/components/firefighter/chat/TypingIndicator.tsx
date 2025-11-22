'use client';

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-[#1a1f35]/50 rounded-lg w-fit">
      <div className="flex gap-1">
        <div
          className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <div
          className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <div
          className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
      <span className="text-sm text-gray-400">Agent is thinking...</span>
    </div>
  );
}

