'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Plus, History, Loader2 } from 'lucide-react';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessagePreview: string;
}

interface ChatSession extends ChatSessionSummary {
  messages: Message[];
}

interface Props {
  applicationId: string;
  onDocumentUpdated?: (filename: string) => void;
}

const SUGGESTIONS = [
  'Draft a LinkedIn note for the hiring manager',
  'What should I mention in an outreach email?',
  'What questions might they ask?',
  'Shorten the cover letter',
];

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ChatPanel({ applicationId, onDocumentUpdated }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    setMessages([]);
    setActiveSessionId(null);
    setInput('');
    void loadSessions();
  }, [applicationId]);

  async function loadSessions() {
    try {
      const res = await fetch(`/api/applications/${applicationId}/chats`);
      const data = await res.json().catch(() => ({})) as { sessions?: ChatSessionSummary[] };
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      setSessions([]);
    }
  }

  async function openSession(sessionId: string) {
    if (!sessionId) {
      startNewChat();
      return;
    }

    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/chats?sessionId=${encodeURIComponent(sessionId)}`);
      const data = await res.json().catch(() => ({})) as { session?: ChatSession; sessions?: ChatSessionSummary[]; error?: string };
      if (!res.ok || !data.session) throw new Error(data.error ?? 'Could not load chat.');
      setMessages(data.session.messages ?? []);
      setActiveSessionId(data.session.id);
      if (Array.isArray(data.sessions)) setSessions(data.sessions);
    } catch {
      setMessages([]);
      setActiveSessionId(null);
    } finally {
      setHistoryLoading(false);
      textareaRef.current?.focus();
    }
  }

  function startNewChat() {
    setMessages([]);
    setActiveSessionId(null);
    setInput('');
    textareaRef.current?.focus();
  }

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
        body: JSON.stringify({ applicationId, sessionId: activeSessionId, message: msg }),
      });
      const data = await res.json() as {
        reply?: string;
        appliedEdit?: string | null;
        error?: string;
        sessionId?: string;
        session?: ChatSession;
        sessions?: ChatSessionSummary[];
      };
      if (!res.ok) throw new Error(data.error ?? 'Chat request failed');
      if (!data.reply) throw new Error('The assistant returned an empty response.');

      if (data.session) {
        setMessages(data.session.messages ?? []);
        setActiveSessionId(data.session.id);
      } else {
        setMessages([...newHistory, { role: 'assistant', content: data.reply }]);
        if (data.sessionId) setActiveSessionId(data.sessionId);
      }
      if (Array.isArray(data.sessions)) setSessions(data.sessions);
      else void loadSessions();

      if (data.appliedEdit) {
        onDocumentUpdated?.(data.appliedEdit);
      }
    } catch (err) {
      setMessages([...newHistory, {
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Something went wrong.',
      }]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  const activeSession = activeSessionId ? sessions.find(session => session.id === activeSessionId) : null;

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">

      <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">AI Assistant</p>
              <p className="text-xs text-slate-400 truncate">
                {activeSession ? `Continuing: ${activeSession.title}` : 'New chat for this application'}
              </p>
            </div>
          </div>
          <button
            onClick={startNewChat}
            disabled={loading || historyLoading || (!activeSessionId && messages.length === 0)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <History className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <label className="sr-only" htmlFor={`chat-history-${applicationId}`}>Previous chats</label>
          <select
            id={`chat-history-${applicationId}`}
            value={activeSessionId ?? ''}
            onChange={e => void openSession(e.target.value)}
            disabled={historyLoading || loading}
            className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-600 outline-none disabled:opacity-50"
          >
            <option value="">New chat</option>
            {sessions.map(session => (
              <option key={session.id} value={session.id}>
                {session.title} ({formatSessionTime(session.updatedAt)})
              </option>
            ))}
          </select>
          {historyLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !historyLoading && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 text-center">
              What can I help with?
            </p>
            <div className="grid grid-cols-1 gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 transition-colors font-medium"
                >
                  {s}
                </button>
              ))}
            </div>
            {sessions.length > 0 && (
              <p className="mt-4 text-center text-[11px] text-slate-400">
                Previous chats are saved above for this application only.
              </p>
            )}
          </div>
        )}

        {historyLoading && (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading chat...
          </div>
        )}

        {messages.map((m, i) => (
          <div key={m.id ?? i} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                void send();
              }
            }}
          />
          <button
            onClick={() => void send()}
            disabled={!input.trim() || loading || historyLoading}
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
