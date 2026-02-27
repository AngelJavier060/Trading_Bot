"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, Send, X, Minimize2, Maximize2, 
  TrendingUp, TrendingDown, AlertCircle, 
  BarChart3, Brain, MessageCircle, Sparkles,
  RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';

interface AssistantMessage {
  id: string;
  type: 'greeting' | 'insight' | 'warning' | 'suggestion' | 'analysis' | 'trade_feedback' | 'user';
  title: string;
  content: string;
  timestamp: string;
  priority: 'high' | 'medium' | 'low';
  data?: any;
  actions?: { label: string; action: string }[];
}

interface TradingAssistantProps {
  onTradeAnalyzed?: (message: AssistantMessage) => void;
  recentTrades?: any[];
  isTrading?: boolean;
}

const API_BASE = 'http://127.0.0.1:5000/api/assistant';

const TradingAssistant: React.FC<TradingAssistantProps> = ({
  onTradeAnalyzed,
  recentTrades = [],
  isTrading = false
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [lastAnalyzedTradeId, setLastAnalyzedTradeId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Mount check for hydration
  useEffect(() => {
    setMounted(true);
    // Initialize position to bottom-right
    const savedPos = localStorage.getItem('javiercito_position');
    if (savedPos) {
      setPosition(JSON.parse(savedPos));
    }
  }, []);

  // Handle drag events
  const handleMouseDown = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDragging(true);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        // Keep within viewport bounds
        const maxX = window.innerWidth - (containerRef.current?.offsetWidth || 400);
        const maxY = window.innerHeight - (containerRef.current?.offsetHeight || 600);
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        localStorage.setItem('javiercito_position', JSON.stringify(position));
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, position]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch greeting on mount
  useEffect(() => {
    if (mounted) {
      fetchGreeting();
    }
  }, [mounted]);

  // Auto-analyze new completed trades
  useEffect(() => {
    if (!mounted || !recentTrades.length) return;
    
    const latestTrade = recentTrades[0];
    if (latestTrade && 
        latestTrade.id !== lastAnalyzedTradeId && 
        (latestTrade.result === 'win' || latestTrade.result === 'loss')) {
      analyzeTrade(latestTrade);
      setLastAnalyzedTradeId(latestTrade.id);
    }
  }, [recentTrades, mounted, lastAnalyzedTradeId]);

  const fetchGreeting = async () => {
    try {
      const response = await fetch(`${API_BASE}/greeting`);
      const data = await response.json();
      if (data.success && data.message) {
        setMessages([data.message]);
      }
    } catch (error) {
      console.error('Error fetching greeting:', error);
      // Add fallback greeting
      setMessages([{
        id: 'fallback-greeting',
        type: 'greeting',
        title: 'Javiercito',
        content: '¡Hola! Soy Javiercito, tu asistente de trading con IA. 🤖\n\nEstoy aquí para:\n• Analizar tus operaciones en tiempo real\n• Identificar patrones de mejora\n• Optimizar tus estrategias\n• Aprender de cada trade para darte mejores recomendaciones\n\nEscríbeme "ayuda" para ver todos los comandos disponibles.',
        timestamp: new Date().toISOString(),
        priority: 'medium'
      }]);
    }
  };

  const analyzeTrade = async (trade: any) => {
    try {
      const response = await fetch(`${API_BASE}/analyze-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trade)
      });
      const data = await response.json();
      if (data.success && data.message) {
        setMessages(prev => [...prev, data.message]);
        onTradeAnalyzed?.(data.message);
      }
    } catch (error) {
      console.error('Error analyzing trade:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      title: 'Tú',
      content: inputValue,
      timestamp: new Date().toISOString(),
      priority: 'low'
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: inputValue })
      });
      const data = await response.json();
      if (data.success && data.message) {
        setMessages(prev => [...prev, data.message]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        type: 'warning',
        title: 'Error',
        content: 'No pude procesar tu mensaje. Verifica que el servidor esté corriendo.',
        timestamp: new Date().toISOString(),
        priority: 'high'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMarketInsight = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/market-insight`);
      const data = await response.json();
      if (data.success && data.message) {
        setMessages(prev => [...prev, data.message]);
      }
    } catch (error) {
      console.error('Error fetching market insight:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStrategyAnalysis = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/strategy-analysis`);
      const data = await response.json();
      if (data.success && data.message) {
        setMessages(prev => [...prev, data.message]);
      }
    } catch (error) {
      console.error('Error fetching strategy analysis:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSessionSummary = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/session-summary`);
      const data = await response.json();
      if (data.success && data.message) {
        setMessages(prev => [...prev, data.message]);
      }
    } catch (error) {
      console.error('Error fetching session summary:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'greeting':
        return <Bot className="w-5 h-5 text-blue-400" />;
      case 'trade_feedback':
        return <TrendingUp className="w-5 h-5 text-green-400" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case 'analysis':
        return <BarChart3 className="w-5 h-5 text-purple-400" />;
      case 'insight':
        return <Brain className="w-5 h-5 text-cyan-400" />;
      case 'user':
        return <MessageCircle className="w-5 h-5 text-slate-400" />;
      default:
        return <Sparkles className="w-5 h-5 text-blue-400" />;
    }
  };

  const getMessageBorderColor = (type: string, priority: string) => {
    if (priority === 'high') return 'border-l-red-500';
    switch (type) {
      case 'trade_feedback':
        return 'border-l-green-500';
      case 'warning':
        return 'border-l-yellow-500';
      case 'analysis':
        return 'border-l-purple-500';
      case 'insight':
        return 'border-l-cyan-500';
      case 'user':
        return 'border-l-slate-500';
      default:
        return 'border-l-blue-500';
    }
  };

  const formatContent = (content: string) => {
    // Convert markdown-style formatting to proper rendering
    return content.split('\n').map((line, i) => {
      // Clean up any raw HTML tags that shouldn't be there
      let cleanLine = line
        .replace(/<strong>/g, '**')
        .replace(/<\/strong>/g, '**')
        .replace(/<br>/g, '');
      
      // Convert **text** to bold
      const parts = cleanLine.split(/\*\*(.*?)\*\*/g);
      const formatted = parts.map((part, j) => 
        j % 2 === 1 ? <strong key={j} className="text-white font-semibold">{part}</strong> : part
      );
      
      // Bullet points
      if (cleanLine.startsWith('•') || cleanLine.startsWith('-')) {
        return <div key={i} className="ml-3 text-sm flex"><span className="mr-2">•</span><span>{formatted}</span></div>;
      }
      // Empty line
      if (!cleanLine.trim()) {
        return <div key={i} className="h-2" />;
      }
      // Regular line
      return <div key={i} className="text-sm">{formatted}</div>;
    });
  };

  if (!mounted) return null;

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform z-50"
        title="Abrir Javiercito - Asistente IA"
      >
        <Bot className="w-7 h-7 text-white" />
        {messages.some(m => m.priority === 'high' && m.type !== 'user') && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>
    );
  }

  const positionStyle = position.x !== 0 || position.y !== 0 
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
    : { right: 24, bottom: 24 };

  return (
    <div 
      ref={containerRef}
      style={positionStyle}
      className={`fixed bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 transition-all duration-300 ${
        isMinimized ? 'w-80 h-14' : 'w-96 h-[600px]'
      } ${isDragging ? 'cursor-grabbing' : ''}`}>
      {/* Header - Draggable */}
      <div 
        onMouseDown={handleMouseDown}
        className={`flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-t-xl ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">🤖 Javiercito</h3>
            <p className="text-xs text-slate-400">
              {isTrading ? '🟢 Analizando' : '⏸ En espera'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
            title={isMinimized ? 'Expandir' : 'Minimizar'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Quick Actions */}
          <div className="flex gap-2 p-3 border-b border-slate-700">
            <button
              onClick={fetchMarketInsight}
              disabled={isLoading}
              className="flex-1 px-2 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
            >
              <TrendingUp className="w-3 h-3" />
              Mercado
            </button>
            <button
              onClick={fetchStrategyAnalysis}
              disabled={isLoading}
              className="flex-1 px-2 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
            >
              <BarChart3 className="w-3 h-3" />
              Estrategias
            </button>
            <button
              onClick={fetchSessionSummary}
              disabled={isLoading}
              className="flex-1 px-2 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
            >
              <Brain className="w-3 h-3" />
              Resumen
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ height: 'calc(100% - 180px)' }}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`bg-slate-800/50 rounded-lg p-3 border-l-4 ${getMessageBorderColor(message.type, message.priority)}`}
              >
                <div className="flex items-start gap-2">
                  {getMessageIcon(message.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-white">{message.title}</span>
                      <span className="text-xs text-slate-500">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-slate-300 space-y-1">
                      {formatContent(message.content)}
                    </div>
                    {message.actions && message.actions.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {message.actions.map((action, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              if (action.action === 'show_stats') fetchStrategyAnalysis();
                            }}
                            className="px-2 py-1 text-xs bg-blue-600/30 hover:bg-blue-600/50 rounded transition-colors"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analizando...
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Pregúntame algo..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputValue.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">
              Escribe "ayuda" para ver los comandos disponibles
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default TradingAssistant;
