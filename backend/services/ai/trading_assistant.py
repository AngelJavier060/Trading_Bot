"""
AI Trading Assistant Service
Provides intelligent feedback, analysis, and recommendations for trading operations.
Acts as an interactive assistant that learns from trades and provides insights.
Saves all analysis to database for ML learning.
"""

import random
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import json

logger = logging.getLogger(__name__)


@dataclass
class TradeAnalysis:
    """Analysis result for a single trade"""
    trade_id: str
    symbol: str
    direction: str
    result: str
    confidence_score: float
    strategy_used: str
    feedback: str
    lessons: List[str]
    improvement_suggestions: List[str]
    market_context: Dict[str, Any]


@dataclass
class StrategyPerformance:
    """Performance metrics for a strategy"""
    strategy_name: str
    total_trades: int
    wins: int
    losses: int
    win_rate: float
    avg_confidence: float
    best_conditions: List[str]
    worst_conditions: List[str]
    recommendation: str


@dataclass
class AssistantMessage:
    """A message from the AI assistant"""
    id: str
    type: str  # 'insight', 'warning', 'suggestion', 'analysis', 'greeting', 'trade_feedback'
    title: str
    content: str
    timestamp: str
    priority: str  # 'high', 'medium', 'low'
    data: Dict[str, Any] = field(default_factory=dict)
    actions: List[Dict[str, str]] = field(default_factory=list)


class TradingAssistant:
    """
    AI Trading Assistant 'Javiercito' that provides real-time feedback, 
    analysis and recommendations based on trading activity.
    Maintains conversation context and learns from trading patterns.
    """
    
    ASSISTANT_NAME = "Javiercito"
    
    def __init__(self):
        self.trade_history: List[Dict] = []
        self.strategy_stats: Dict[str, Dict] = {}
        self.session_start = datetime.now()
        self.messages: List[AssistantMessage] = []
        self.conversation_history: List[Dict] = []  # Store conversation context
        self.learning_data: Dict[str, Any] = {
            'patterns_detected': [],
            'best_hours': {},
            'worst_hours': {},
            'symbol_performance': {},
            'strategy_correlations': {},
            'consecutive_losses': 0,
            'consecutive_wins': 0,
            'improvement_areas': [],
            'successful_patterns': []
        }
        self._load_historical_data()
    
    def _load_historical_data(self):
        """Load historical trade data to provide context-aware analysis"""
        try:
            from database.repositories import TradeRepository, MLAnalysisRepository
            
            # Load recent trades from DB
            recent_trades = TradeRepository.get_history(limit=100)
            for trade in recent_trades:
                self._update_stats_from_trade(trade)
            
            # Load previous analyses for context
            analyses = MLAnalysisRepository.get_recent(limit=50)
            for analysis in analyses:
                if analysis.get('improvement_suggestions'):
                    self.learning_data['improvement_areas'].extend(
                        analysis.get('improvement_suggestions', [])
                    )
            
            logger.info(f"{self.ASSISTANT_NAME} cargó {len(recent_trades)} trades históricos")
        except Exception as e:
            logger.warning(f"No se pudo cargar historial: {e}")
    
    def _update_stats_from_trade(self, trade: Dict):
        """Update strategy stats from a trade record"""
        strategy = trade.get('strategy_name') or trade.get('strategy_used', 'unknown')
        result = trade.get('result', '')
        pnl = trade.get('profit_loss') or trade.get('pnl', 0) or 0
        confidence = trade.get('confidence_level') or trade.get('confidence', 0) or 0
        
        if strategy not in self.strategy_stats:
            self.strategy_stats[strategy] = {
                'total': 0, 'wins': 0, 'losses': 0,
                'total_pnl': 0, 'avg_confidence': 0,
                'by_hour': {}, 'by_symbol': {}
            }
        
        stats = self.strategy_stats[strategy]
        stats['total'] += 1
        if result == 'win':
            stats['wins'] += 1
        elif result == 'loss':
            stats['losses'] += 1
        stats['total_pnl'] += pnl
        
    def generate_id(self) -> str:
        """Generate unique message ID"""
        import uuid
        return str(uuid.uuid4())[:8]
    
    def get_greeting(self) -> AssistantMessage:
        """Generate a greeting message based on time and context"""
        hour = datetime.now().hour
        
        if hour < 12:
            time_greeting = "Buenos días"
        elif hour < 18:
            time_greeting = "Buenas tardes"
        else:
            time_greeting = "Buenas noches"
        
        # Check market sessions
        sessions = self._get_active_sessions()
        session_info = f"Sesiones activas: {', '.join(sessions)}" if sessions else "Mercados en pausa"
        
        # Get historical context
        total_trades = sum(s['total'] for s in self.strategy_stats.values())
        total_wins = sum(s['wins'] for s in self.strategy_stats.values())
        overall_wr = (total_wins / total_trades * 100) if total_trades > 0 else 0
        
        context_info = ""
        if total_trades > 0:
            context_info = f"\n\n📈 **Tu historial:**\n- {total_trades} operaciones analizadas\n- Win rate general: {overall_wr:.1f}%"
            
            # Add personalized insights
            if self.learning_data.get('improvement_areas'):
                context_info += f"\n- Áreas de mejora identificadas: {len(set(self.learning_data['improvement_areas']))}"
        
        content = f"""{time_greeting}! Soy **{self.ASSISTANT_NAME}**, tu asistente de trading con IA. 🤖

📊 **Estado actual:**
- {session_info}
- Hora del servidor: {datetime.now().strftime('%H:%M')}{context_info}

**¿Qué puedo hacer por ti?**
• Analizar tus operaciones y explicarte qué funcionó y qué no
• Identificar patrones en tus trades ganadores y perdedores
• Sugerir ajustes específicos para mejorar tu rendimiento
• Aprender continuamente de tus resultados

💡 Escribe **"mejoras"** para ver mis recomendaciones personalizadas."""

        return AssistantMessage(
            id=self.generate_id(),
            type='greeting',
            title=f'¡Hola! Soy {self.ASSISTANT_NAME}',
            content=content,
            timestamp=datetime.now().isoformat(),
            priority='medium',
            actions=[
                {'label': 'Ver mejoras', 'action': 'show_improvements'},
                {'label': 'Análisis de estrategias', 'action': 'show_stats'}
            ]
        )
    
    def _get_active_sessions(self) -> List[str]:
        """Determine which trading sessions are active"""
        hour = datetime.now().hour
        sessions = []
        
        # Sydney: 22:00 - 07:00 UTC
        if hour >= 22 or hour < 7:
            sessions.append("Sydney 🇦🇺")
        # Tokyo: 00:00 - 09:00 UTC
        if hour >= 0 and hour < 9:
            sessions.append("Tokio 🇯🇵")
        # London: 08:00 - 17:00 UTC
        if hour >= 8 and hour < 17:
            sessions.append("Londres 🇬🇧")
        # New York: 13:00 - 22:00 UTC
        if hour >= 13 and hour < 22:
            sessions.append("Nueva York 🇺🇸")
            
        return sessions
    
    def analyze_trade(self, trade: Dict) -> AssistantMessage:
        """Analyze a completed trade and provide feedback"""
        self.trade_history.append(trade)
        
        symbol = trade.get('symbol', 'Unknown')
        direction = trade.get('direction', 'unknown')
        result = trade.get('result', 'pending')
        strategy = trade.get('strategy_used', 'unknown')
        confidence = trade.get('confidence', 0)
        pnl = trade.get('pnl', 0)
        
        # Update strategy stats
        if strategy not in self.strategy_stats:
            self.strategy_stats[strategy] = {
                'total': 0, 'wins': 0, 'losses': 0,
                'total_pnl': 0, 'avg_confidence': 0,
                'by_hour': {}, 'by_symbol': {}
            }
        
        stats = self.strategy_stats[strategy]
        stats['total'] += 1
        if result == 'win':
            stats['wins'] += 1
        elif result == 'loss':
            stats['losses'] += 1
        stats['total_pnl'] += pnl or 0
        stats['avg_confidence'] = (stats['avg_confidence'] * (stats['total'] - 1) + confidence) / stats['total']
        
        # Generate feedback
        win_rate = (stats['wins'] / stats['total'] * 100) if stats['total'] > 0 else 0
        
        if result == 'win':
            emoji = "✅"
            feedback_type = "success"
            title = f"¡Operación Ganadora en {symbol}!"
            
            reasons = self._analyze_win_reasons(trade, stats)
            content = f"""**{direction.upper()}** en {symbol} fue exitosa! +${abs(pnl or 0):.2f}

📈 **¿Por qué funcionó?**
{reasons}

📊 **Rendimiento de {strategy}:**
- Win Rate: {win_rate:.1f}%
- Operaciones: {stats['total']}
- P&L Total: ${stats['total_pnl']:.2f}

💡 **Aprendizaje:**
{self._generate_learning_insight(trade, 'win')}"""

        elif result == 'loss':
            emoji = "❌"
            feedback_type = "warning"
            title = f"Operación Perdida en {symbol}"
            
            reasons = self._analyze_loss_reasons(trade, stats)
            content = f"""**{direction.upper()}** en {symbol} resultó en pérdida. -${abs(pnl or 0):.2f}

📉 **¿Qué pudo fallar?**
{reasons}

📊 **Rendimiento de {strategy}:**
- Win Rate: {win_rate:.1f}%
- Operaciones: {stats['total']}
- P&L Total: ${stats['total_pnl']:.2f}

🔧 **Sugerencias de mejora:**
{self._generate_improvement_suggestions(trade, stats)}"""

        else:
            emoji = "⏳"
            feedback_type = "info"
            title = f"Operación en Progreso: {symbol}"
            content = f"Monitoreando {direction.upper()} en {symbol}..."
        
        message = AssistantMessage(
            id=self.generate_id(),
            type='trade_feedback',
            title=title,
            content=content,
            timestamp=datetime.now().isoformat(),
            priority='high' if result == 'loss' else 'medium',
            data={
                'trade': trade,
                'strategy_stats': stats,
                'win_rate': win_rate
            }
        )
        
        # Save analysis to database for ML learning
        self._save_analysis_to_db(trade, result, stats, win_rate, content, feedback_type if result != 'pending' else 'info')
        
        return message
    
    def _analyze_win_reasons(self, trade: Dict, stats: Dict) -> str:
        """Analyze reasons for a winning trade"""
        reasons = []
        confidence = trade.get('confidence', 0)
        strategy = trade.get('strategy_used', '')
        
        if confidence >= 75:
            reasons.append("• Alta confianza en la señal (>75%) - Las señales con alta confianza tienen mejor rendimiento")
        
        sessions = self._get_active_sessions()
        if len(sessions) >= 2:
            reasons.append("• Múltiples sesiones activas - Mayor liquidez y movimientos más predecibles")
        
        if 'ema' in strategy.lower() or 'rsi' in strategy.lower():
            reasons.append("• EMA + RSI detectó correctamente la tendencia y momento de entrada")
        
        if 'macd' in strategy.lower():
            reasons.append("• MACD confirmó el momentum del precio")
            
        if 'bollinger' in strategy.lower():
            reasons.append("• Bollinger Bands identificó correctamente la volatilidad")
        
        if not reasons:
            reasons.append("• La estrategia se alineó correctamente con las condiciones del mercado")
            
        return "\n".join(reasons)
    
    def _analyze_loss_reasons(self, trade: Dict, stats: Dict) -> str:
        """Analyze possible reasons for a losing trade"""
        reasons = []
        confidence = trade.get('confidence', 0)
        
        if confidence < 70:
            reasons.append("• Confianza baja en la señal (<70%) - Considerar aumentar el umbral mínimo")
        
        sessions = self._get_active_sessions()
        if len(sessions) <= 1:
            reasons.append("• Pocas sesiones activas - Menor liquidez puede causar movimientos erráticos")
        
        hour = datetime.now().hour
        if hour in [12, 13, 17, 18]:  # Typical volatility hours
            reasons.append("• Hora de alta volatilidad - Las transiciones de sesión pueden ser impredecibles")
        
        win_rate = (stats['wins'] / stats['total'] * 100) if stats['total'] > 0 else 0
        if win_rate < 50 and stats['total'] >= 5:
            reasons.append(f"• La estrategia tiene un win rate bajo ({win_rate:.1f}%) - Revisar parámetros")
        
        if not reasons:
            reasons.append("• El mercado se movió de forma inesperada")
            reasons.append("• Posible evento de noticias o alta volatilidad momentánea")
            
        return "\n".join(reasons)
    
    def _generate_learning_insight(self, trade: Dict, result: str) -> str:
        """Generate a learning insight based on the trade"""
        insights = []
        symbol = trade.get('symbol', '')
        strategy = trade.get('strategy_used', '')
        hour = datetime.now().hour
        
        # Update learning data
        if symbol not in self.learning_data['symbol_performance']:
            self.learning_data['symbol_performance'][symbol] = {'wins': 0, 'losses': 0}
        
        if result == 'win':
            self.learning_data['symbol_performance'][symbol]['wins'] += 1
            insights.append(f"Registrado: {symbol} responde bien a {strategy} en este horario")
        else:
            self.learning_data['symbol_performance'][symbol]['losses'] += 1
        
        # Check patterns
        symbol_stats = self.learning_data['symbol_performance'][symbol]
        total = symbol_stats['wins'] + symbol_stats['losses']
        if total >= 3:
            wr = symbol_stats['wins'] / total * 100
            if wr >= 70:
                insights.append(f"📊 {symbol} tiene {wr:.0f}% win rate - Considerar aumentar exposición")
            elif wr <= 30:
                insights.append(f"⚠️ {symbol} tiene solo {wr:.0f}% win rate - Considerar reducir operaciones")
        
        return "\n".join(insights) if insights else "Recopilando datos para detectar patrones..."
    
    def _generate_improvement_suggestions(self, trade: Dict, stats: Dict) -> str:
        """Generate improvement suggestions after a loss"""
        suggestions = []
        confidence = trade.get('confidence', 0)
        win_rate = (stats['wins'] / stats['total'] * 100) if stats['total'] > 0 else 0
        
        if confidence < 75:
            suggestions.append("• **Aumentar umbral de confianza** a 75% para reducir señales falsas")
        
        if win_rate < 55 and stats['total'] >= 5:
            suggestions.append("• **Revisar parámetros** de la estrategia o probar otra combinación")
        
        sessions = self._get_active_sessions()
        if len(sessions) <= 1:
            suggestions.append("• **Esperar más sesiones activas** para mayor liquidez")
        
        suggestions.append("• **Analizar el gráfico** manualmente antes de la próxima señal similar")
        
        return "\n".join(suggestions)
    
    def get_strategy_analysis(self) -> AssistantMessage:
        """Get comprehensive strategy analysis"""
        if not self.strategy_stats:
            return AssistantMessage(
                id=self.generate_id(),
                type='analysis',
                title='Análisis de Estrategias',
                content="Aún no hay suficientes datos. Ejecuta algunas operaciones para comenzar el análisis.",
                timestamp=datetime.now().isoformat(),
                priority='low'
            )
        
        content_parts = ["📊 **Análisis de Rendimiento por Estrategia**\n"]
        
        best_strategy = None
        best_win_rate = 0
        
        for strategy, stats in self.strategy_stats.items():
            if stats['total'] == 0:
                continue
                
            win_rate = (stats['wins'] / stats['total'] * 100)
            if win_rate > best_win_rate and stats['total'] >= 3:
                best_win_rate = win_rate
                best_strategy = strategy
            
            emoji = "🟢" if win_rate >= 60 else "🟡" if win_rate >= 50 else "🔴"
            
            content_parts.append(f"""
**{strategy}** {emoji}
- Operaciones: {stats['total']} ({stats['wins']}W / {stats['losses']}L)
- Win Rate: {win_rate:.1f}%
- P&L Total: ${stats['total_pnl']:.2f}
- Confianza Promedio: {stats['avg_confidence']:.1f}%
""")
        
        if best_strategy:
            content_parts.append(f"""
---
🏆 **Mejor estrategia actual:** {best_strategy} ({best_win_rate:.1f}% win rate)

💡 **Recomendación:** Prioriza señales de {best_strategy} para mejores resultados.
""")
        
        return AssistantMessage(
            id=self.generate_id(),
            type='analysis',
            title='Análisis de Estrategias',
            content="\n".join(content_parts),
            timestamp=datetime.now().isoformat(),
            priority='medium',
            data={'strategy_stats': self.strategy_stats}
        )
    
    def get_market_insight(self) -> AssistantMessage:
        """Generate market insight based on current conditions"""
        sessions = self._get_active_sessions()
        hour = datetime.now().hour
        
        # Determine market condition
        if len(sessions) >= 2:
            condition = "Alta actividad"
            recommendation = "Buen momento para operar - múltiples sesiones activas"
            emoji = "🟢"
        elif len(sessions) == 1:
            condition = "Actividad moderada"
            recommendation = "Operar con precaución - liquidez limitada"
            emoji = "🟡"
        else:
            condition = "Baja actividad"
            recommendation = "Considerar esperar - mercados en transición"
            emoji = "🔴"
        
        content = f"""**Condiciones del Mercado** {emoji}

📍 **Estado:** {condition}
🕐 **Hora:** {datetime.now().strftime('%H:%M')}
🌍 **Sesiones:** {', '.join(sessions) if sessions else 'Ninguna activa'}

📋 **Recomendación:**
{recommendation}

📈 **Pares recomendados ahora:**
{self._get_recommended_pairs(sessions)}

⚠️ **Precauciones:**
{self._get_current_warnings()}
"""
        
        return AssistantMessage(
            id=self.generate_id(),
            type='insight',
            title='Análisis del Mercado',
            content=content,
            timestamp=datetime.now().isoformat(),
            priority='medium'
        )
    
    def _get_recommended_pairs(self, sessions: List[str]) -> str:
        """Get recommended pairs based on active sessions"""
        pairs = []
        
        if any('Tokio' in s for s in sessions):
            pairs.extend(['• USD/JPY - Alta liquidez en sesión asiática', '• AUD/JPY - Volatilidad favorable'])
        if any('Londres' in s for s in sessions):
            pairs.extend(['• EUR/USD - Par más líquido', '• GBP/USD - Buenos movimientos'])
        if any('Nueva York' in s for s in sessions):
            pairs.extend(['• EUR/USD - Máxima liquidez', '• USD/CAD - Movimientos predecibles'])
        
        if not pairs:
            pairs = ['• Esperar apertura de sesiones principales']
            
        return "\n".join(pairs[:3])
    
    def _get_current_warnings(self) -> str:
        """Get current market warnings"""
        warnings = []
        hour = datetime.now().hour
        
        if hour in [12, 13]:  # London close / NY open overlap
            warnings.append("• Transición Londres-NY: posible volatilidad")
        if hour in [17, 18]:  # NY afternoon
            warnings.append("• Final de sesión NY: movimientos erráticos posibles")
        if datetime.now().weekday() == 4:  # Friday
            warnings.append("• Viernes: considerar cerrar posiciones antes del fin de semana")
        
        if not warnings:
            warnings.append("• Sin alertas especiales en este momento")
            
        return "\n".join(warnings)
    
    def get_session_summary(self) -> AssistantMessage:
        """Get summary of the current trading session"""
        total_trades = len(self.trade_history)
        wins = sum(1 for t in self.trade_history if t.get('result') == 'win')
        losses = sum(1 for t in self.trade_history if t.get('result') == 'loss')
        total_pnl = sum(t.get('pnl', 0) or 0 for t in self.trade_history)
        
        if total_trades == 0:
            return AssistantMessage(
                id=self.generate_id(),
                type='analysis',
                title='Resumen de Sesión',
                content="No hay operaciones registradas en esta sesión. ¡Comienza a operar para ver el análisis!",
                timestamp=datetime.now().isoformat(),
                priority='low'
            )
        
        win_rate = (wins / total_trades * 100) if total_trades > 0 else 0
        session_duration = datetime.now() - self.session_start
        hours = session_duration.total_seconds() / 3600
        
        status_emoji = "🟢" if total_pnl > 0 else "🔴" if total_pnl < 0 else "🟡"
        
        content = f"""**Resumen de Sesión** {status_emoji}

⏱️ **Duración:** {hours:.1f} horas
📊 **Operaciones:** {total_trades} ({wins}W / {losses}L)
📈 **Win Rate:** {win_rate:.1f}%
💰 **P&L Total:** ${total_pnl:.2f}

**Rendimiento por hora:** {total_pnl / hours:.2f}$/hora

{self._get_session_recommendation(win_rate, total_pnl, total_trades)}
"""
        
        return AssistantMessage(
            id=self.generate_id(),
            type='analysis',
            title='Resumen de Sesión',
            content=content,
            timestamp=datetime.now().isoformat(),
            priority='high',
            data={
                'total_trades': total_trades,
                'wins': wins,
                'losses': losses,
                'win_rate': win_rate,
                'total_pnl': total_pnl
            }
        )
    
    def _get_session_recommendation(self, win_rate: float, pnl: float, trades: int) -> str:
        """Get recommendation based on session performance"""
        if trades < 5:
            return "💡 **Recomendación:** Aún muy pocas operaciones para evaluar. Continúa operando."
        
        if win_rate >= 65 and pnl > 0:
            return "💡 **Recomendación:** ¡Excelente sesión! Considera asegurar ganancias y reducir riesgo."
        elif win_rate >= 55:
            return "💡 **Recomendación:** Buen rendimiento. Mantén la disciplina actual."
        elif win_rate >= 45:
            return "💡 **Recomendación:** Rendimiento neutral. Revisa las últimas señales perdedoras."
        else:
            return "⚠️ **Recomendación:** Win rate bajo. Considera pausar y revisar la estrategia."
    
    def process_user_question(self, question: str) -> AssistantMessage:
        """Process a user question and generate a response with context"""
        question_lower = question.lower()
        
        # Store conversation for context
        self.conversation_history.append({
            'role': 'user',
            'content': question,
            'timestamp': datetime.now().isoformat()
        })
        
        # Keep only last 20 messages for context
        if len(self.conversation_history) > 20:
            self.conversation_history = self.conversation_history[-20:]
        
        if any(word in question_lower for word in ['resumen', 'summary', 'cómo voy', 'como voy']):
            return self.get_session_summary()
        
        if any(word in question_lower for word in ['estrategia', 'strategy', 'mejor', 'rendimiento']):
            return self.get_strategy_analysis()
        
        if any(word in question_lower for word in ['mercado', 'market', 'sesión', 'session', 'ahora']):
            return self.get_market_insight()
        
        if any(word in question_lower for word in ['ayuda', 'help', 'qué puedes', 'que puedes']):
            return self._get_help_message()
        
        if any(word in question_lower for word in ['mejora', 'mejorar', 'optimizar', 'ajustar', 'corregir', 'pulir']):
            return self._get_improvement_analysis()
        
        if any(word in question_lower for word in ['problema', 'error', 'falla', 'mal', 'perdiendo']):
            return self._get_problem_diagnosis()
        
        if any(word in question_lower for word in ['consejo', 'recomienda', 'sugieres', 'debería']):
            return self._get_personalized_advice()
        
        # Context-aware default response
        return self._generate_contextual_response(question)
    
    def _get_improvement_analysis(self) -> AssistantMessage:
        """Provide detailed improvement analysis based on trading history"""
        improvements = []
        
        # Analyze strategy performance
        for strategy, stats in self.strategy_stats.items():
            if stats['total'] < 3:
                continue
            
            win_rate = (stats['wins'] / stats['total'] * 100) if stats['total'] > 0 else 0
            
            if win_rate < 50:
                improvements.append({
                    'area': f'Estrategia {strategy}',
                    'issue': f'Win rate bajo ({win_rate:.1f}%)',
                    'suggestion': 'Aumentar umbral de confianza a 75% o revisar parámetros',
                    'priority': 'alta'
                })
            elif win_rate < 60:
                improvements.append({
                    'area': f'Estrategia {strategy}',
                    'issue': f'Win rate mejorable ({win_rate:.1f}%)',
                    'suggestion': 'Filtrar por sesiones de mayor liquidez',
                    'priority': 'media'
                })
        
        # Check symbol performance
        for symbol, perf in self.learning_data.get('symbol_performance', {}).items():
            total = perf['wins'] + perf['losses']
            if total >= 3:
                wr = perf['wins'] / total * 100
                if wr < 40:
                    improvements.append({
                        'area': f'Par {symbol}',
                        'issue': f'Rendimiento pobre ({wr:.0f}% win rate)',
                        'suggestion': 'Considerar excluir este par o usar solo en horarios específicos',
                        'priority': 'alta'
                    })
        
        if not improvements:
            content = f"""**{self.ASSISTANT_NAME} - Análisis de Mejoras** 🔍

✅ **¡Buen trabajo!** No he detectado problemas críticos en tu operativa actual.

**Recomendaciones generales:**
• Mantener la disciplina con las estrategias actuales
• Seguir filtrando señales con confianza > 70%
• Operar en horarios de mayor liquidez

📊 Continúa operando para que pueda darte análisis más específicos."""
        else:
            # Sort by priority
            improvements.sort(key=lambda x: 0 if x['priority'] == 'alta' else 1)
            
            improvement_text = ""
            for i, imp in enumerate(improvements[:5], 1):
                priority_emoji = "🔴" if imp['priority'] == 'alta' else "🟡"
                improvement_text += f"\n{i}. {priority_emoji} **{imp['area']}**\n   - Problema: {imp['issue']}\n   - Solución: {imp['suggestion']}\n"
            
            content = f"""**{self.ASSISTANT_NAME} - Análisis de Mejoras** 🔍

He identificado **{len(improvements)} áreas de mejora** basándome en tu historial:
{improvement_text}

💡 **Acción inmediata recomendada:**
{improvements[0]['suggestion']}

¿Quieres que profundice en alguna de estas áreas?"""
        
        return AssistantMessage(
            id=self.generate_id(),
            type='analysis',
            title=f'{self.ASSISTANT_NAME} - Mejoras Detectadas',
            content=content,
            timestamp=datetime.now().isoformat(),
            priority='high'
        )
    
    def _get_problem_diagnosis(self) -> AssistantMessage:
        """Diagnose trading problems based on recent performance"""
        problems = []
        
        # Check consecutive losses
        recent_results = [t.get('result') for t in self.trade_history[-10:]]
        consecutive_losses = 0
        for r in reversed(recent_results):
            if r == 'loss':
                consecutive_losses += 1
            else:
                break
        
        if consecutive_losses >= 3:
            problems.append(f"🔴 {consecutive_losses} pérdidas consecutivas - Considera pausar y revisar")
        
        # Check overall session
        total_pnl = sum(t.get('pnl', 0) or 0 for t in self.trade_history)
        if total_pnl < 0:
            problems.append(f"🔴 Sesión en negativo (${total_pnl:.2f}) - Evaluar reducir tamaño de posición")
        
        # Check strategy issues
        for strategy, stats in self.strategy_stats.items():
            if stats['total'] >= 5:
                wr = (stats['wins'] / stats['total'] * 100)
                if wr < 45:
                    problems.append(f"🟡 {strategy} tiene {wr:.0f}% win rate - Necesita ajustes")
        
        if not problems:
            content = f"""**{self.ASSISTANT_NAME} - Diagnóstico** 🔍

✅ No detecto problemas graves en tu operativa.

Tu rendimiento está dentro de parámetros normales. Si sientes que algo no va bien, cuéntame más detalles sobre lo que observas."""
        else:
            problems_text = "\n".join(problems)
            content = f"""**{self.ASSISTANT_NAME} - Diagnóstico** 🔍

He identificado los siguientes problemas:

{problems_text}

**Mi recomendación:**
1. Pausar el trading automático temporalmente
2. Revisar las últimas 5 operaciones perdedoras
3. Verificar que los parámetros de las estrategias sean correctos
4. Considerar operar solo en horarios de mayor liquidez

¿Quieres que analice algún aspecto específico?"""
        
        return AssistantMessage(
            id=self.generate_id(),
            type='warning',
            title=f'{self.ASSISTANT_NAME} - Diagnóstico',
            content=content,
            timestamp=datetime.now().isoformat(),
            priority='high' if problems else 'medium'
        )
    
    def _get_personalized_advice(self) -> AssistantMessage:
        """Generate personalized trading advice"""
        sessions = self._get_active_sessions()
        
        # Find best performing strategy
        best_strategy = None
        best_wr = 0
        for strategy, stats in self.strategy_stats.items():
            if stats['total'] >= 3:
                wr = (stats['wins'] / stats['total'] * 100)
                if wr > best_wr:
                    best_wr = wr
                    best_strategy = strategy
        
        advice = []
        
        if best_strategy:
            advice.append(f"📈 Tu mejor estrategia es **{best_strategy}** ({best_wr:.0f}% win rate). Priorízala.")
        
        if len(sessions) >= 2:
            advice.append("🌍 Hay buena liquidez ahora con múltiples sesiones activas.")
        elif len(sessions) == 1:
            advice.append("⚠️ Solo una sesión activa. Opera con precaución.")
        else:
            advice.append("🛑 Sin sesiones principales activas. Mejor esperar.")
        
        # Check time-based patterns
        hour = datetime.now().hour
        if 8 <= hour <= 11 or 13 <= hour <= 16:
            advice.append("⏰ Horario óptimo para EUR/USD y GBP/USD.")
        
        content = f"""**{self.ASSISTANT_NAME} - Consejos Personalizados** 💡

{chr(10).join(advice)}

**Resumen de acciones:**
1. {'Usar ' + best_strategy if best_strategy else 'Probar diferentes estrategias'}
2. Mantener confianza mínima en 70%
3. {'Operar ahora' if len(sessions) >= 2 else 'Esperar mejor momento'}

¿Necesitas más detalles sobre algo específico?"""
        
        return AssistantMessage(
            id=self.generate_id(),
            type='suggestion',
            title=f'{self.ASSISTANT_NAME} - Consejos',
            content=content,
            timestamp=datetime.now().isoformat(),
            priority='medium'
        )
    
    def _generate_contextual_response(self, question: str) -> AssistantMessage:
        """Generate a contextual response based on conversation history"""
        # Check if there's relevant context from previous messages
        context_hint = ""
        if self.conversation_history:
            recent_topics = [m.get('content', '') for m in self.conversation_history[-3:]]
            if any('estrategia' in t.lower() for t in recent_topics):
                context_hint = "\n\n(Basándome en nuestra conversación sobre estrategias...)"
        
        return AssistantMessage(
            id=self.generate_id(),
            type='insight',
            title=f'Respuesta de {self.ASSISTANT_NAME}',
            content=f"""Entiendo tu pregunta: "{question}"{context_hint}

**Puedo ayudarte con:**
• **"mejoras"** - Análisis detallado de qué debes mejorar
• **"problemas"** - Diagnóstico de qué está fallando
• **"consejo"** - Recomendaciones personalizadas
• **"estrategias"** - Rendimiento de cada estrategia
• **"resumen"** - Estado de la sesión actual
• **"mercado"** - Condiciones actuales

💡 También analizo cada operación automáticamente y te doy feedback específico.

¿En qué te puedo ayudar?""",
            timestamp=datetime.now().isoformat(),
            priority='low'
        )
    
    def _get_help_message(self) -> AssistantMessage:
        """Return help message with available commands"""
        return AssistantMessage(
            id=self.generate_id(),
            type='insight',
            title=f'Comandos de {self.ASSISTANT_NAME}',
            content=f"""**¡Hola! Soy {self.ASSISTANT_NAME}** 🤖

📊 **Análisis:**
• **"resumen"** - Estado de tu sesión actual
• **"estrategias"** - Rendimiento detallado por estrategia
• **"mercado"** - Condiciones actuales y pares recomendados

🔧 **Optimización:**
• **"mejoras"** - Qué debes ajustar para mejorar
• **"problemas"** - Diagnóstico de qué está fallando
• **"consejo"** - Recomendaciones personalizadas

🤖 **Automático:**
• Analizo cada operación completada
• Explico por qué ganaste o perdiste
• Detecto patrones en tu operativa
• Aprendo de tus resultados

💡 **Tip:** Pregúntame en lenguaje natural, entiendo el contexto de nuestra conversación.

¿En qué te ayudo?""",
            timestamp=datetime.now().isoformat(),
            priority='low'
        )
    
    def _save_analysis_to_db(self, trade: Dict, result: str, stats: Dict, win_rate: float, content: str, feedback_type: str) -> None:
        """Save analysis data to database for ML learning."""
        try:
            from database.repositories import MLAnalysisRepository
            
            # Extract win/loss reasons based on result
            win_reasons = None
            loss_reasons = None
            improvement_suggestions = None
            
            if result == 'win':
                win_reasons = [
                    f"Confianza: {trade.get('confidence', 0):.1f}%",
                    f"Estrategia: {trade.get('strategy_used', 'unknown')}",
                ]
            elif result == 'loss':
                loss_reasons = [
                    f"Confianza: {trade.get('confidence', 0):.1f}%",
                ]
                improvement_suggestions = [
                    "Revisar condiciones del mercado",
                    "Considerar aumentar umbral de confianza",
                ]
            
            analysis_data = {
                'analysis_type': 'trade_feedback',
                'trade_id': trade.get('id'),
                'symbol': trade.get('symbol'),
                'strategy_name': trade.get('strategy_used'),
                'direction': trade.get('direction'),
                'trade_result': result,
                'trade_pnl': trade.get('pnl'),
                'confidence_at_entry': trade.get('confidence'),
                'analysis_title': f"Análisis de {trade.get('symbol', 'trade')}",
                'analysis_content': content,
                'feedback_type': feedback_type,
                'priority': 'high' if result == 'loss' else 'medium',
                'win_reasons': win_reasons,
                'loss_reasons': loss_reasons,
                'improvement_suggestions': improvement_suggestions,
                'indicators_snapshot': trade.get('indicators'),
                'strategy_win_rate': win_rate,
                'strategy_total_trades': stats.get('total', 0),
                'strategy_pnl': stats.get('total_pnl', 0),
            }
            
            MLAnalysisRepository.create(analysis_data)
            logger.info(f"Analysis saved to DB for trade {trade.get('id')}")
        except Exception as e:
            logger.warning(f"Could not save analysis to DB: {e}")
    
    def to_dict(self) -> Dict:
        """Convert assistant state to dictionary"""
        return {
            'session_start': self.session_start.isoformat(),
            'trade_count': len(self.trade_history),
            'strategy_stats': self.strategy_stats,
            'learning_data': self.learning_data
        }


# Global instance
_assistant_instance: Optional[TradingAssistant] = None


def get_assistant() -> TradingAssistant:
    """Get or create the global trading assistant instance"""
    global _assistant_instance
    if _assistant_instance is None:
        _assistant_instance = TradingAssistant()
    return _assistant_instance
