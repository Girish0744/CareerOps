'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  applicationId: string;
  onDocumentUpdated?: (filename: string) => void;
}

const SUGGESTIONS = [
  'Shorten the cover letter',
  'Make the summary more technical',
  'What questions might they ask?',
  'Add TypeScript to skills section',
];

export default function ChatPanel({ applicationId, onDocumentUpdated }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    const newHistory: Message[] = [...messages, { role: 'user', content: msg }];
    setMessages(newHistory);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, message: msg, history: messages }),
      });
      const data = await res.json() as { reply: string; appliedEdit: string | null };
      setMessages([...newHistory, { role: 'assistant', content: data.reply }]);
      if (data.appliedEdit) {
        onDocumentUpdated?.(data.appliedEdit);
      }
    } catch {
      setMessages([...newHistory, {
        role: 'assistant',
        content: 'Something went wrong. Check that your GEMINI_API_KEY is set in frontend/.env.local.',
      }]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">

      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2.5">
        <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">AI Assistant</p>
          <p className="text-xs text-slate-400">Scoped to this application only</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 text-center">
              What can I help with?
            </p>
            <div className="grid grid-cols-1 gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 transition-colors font-medium"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
                ${m.role === 'user'
                  ? 'bg-slate-900 text-white rounded-br-sm'
                  : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`}
            >
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shrink-0 mt-1">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3.5 border-t border-slate-100 bg-slate-50">
        <div className="flex gap-2 bg-white border border-slate-200 rounded-xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-slate-900 focus-within:border-transparent transition-all">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none text-sm bg-transparent text-slate-800 placeholder:text-slate-400 focus:outline-none py-1 px-1 leading-relaxed"
            rows={2}
            placeholder="Ask something or request an edit... (Enter to send)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="self-end mb-0.5 w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">Shift+Enter for new line</p>
      </div>
    </div>
  );
}
