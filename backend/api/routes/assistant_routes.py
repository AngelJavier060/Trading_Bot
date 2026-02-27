"""
API Routes for AI Trading Assistant
"""

from flask import Blueprint, request, jsonify
from services.ai.trading_assistant import get_assistant

assistant_bp = Blueprint('assistant', __name__)


@assistant_bp.route('/greeting', methods=['GET'])
def get_greeting():
    """Get initial greeting from assistant"""
    try:
        assistant = get_assistant()
        message = assistant.get_greeting()
        return jsonify({
            'success': True,
            'message': {
                'id': message.id,
                'type': message.type,
                'title': message.title,
                'content': message.content,
                'timestamp': message.timestamp,
                'priority': message.priority,
                'actions': message.actions
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@assistant_bp.route('/analyze-trade', methods=['POST'])
def analyze_trade():
    """Analyze a completed trade and get feedback"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No trade data provided'}), 400
        
        assistant = get_assistant()
        message = assistant.analyze_trade(data)
        
        return jsonify({
            'success': True,
            'message': {
                'id': message.id,
                'type': message.type,
                'title': message.title,
                'content': message.content,
                'timestamp': message.timestamp,
                'priority': message.priority,
                'data': message.data
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@assistant_bp.route('/strategy-analysis', methods=['GET'])
def get_strategy_analysis():
    """Get comprehensive strategy analysis"""
    try:
        assistant = get_assistant()
        message = assistant.get_strategy_analysis()
        
        return jsonify({
            'success': True,
            'message': {
                'id': message.id,
                'type': message.type,
                'title': message.title,
                'content': message.content,
                'timestamp': message.timestamp,
                'priority': message.priority,
                'data': message.data
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@assistant_bp.route('/market-insight', methods=['GET'])
def get_market_insight():
    """Get current market insight"""
    try:
        assistant = get_assistant()
        message = assistant.get_market_insight()
        
        return jsonify({
            'success': True,
            'message': {
                'id': message.id,
                'type': message.type,
                'title': message.title,
                'content': message.content,
                'timestamp': message.timestamp,
                'priority': message.priority
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@assistant_bp.route('/session-summary', methods=['GET'])
def get_session_summary():
    """Get current session summary"""
    try:
        assistant = get_assistant()
        message = assistant.get_session_summary()
        
        return jsonify({
            'success': True,
            'message': {
                'id': message.id,
                'type': message.type,
                'title': message.title,
                'content': message.content,
                'timestamp': message.timestamp,
                'priority': message.priority,
                'data': message.data
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@assistant_bp.route('/ask', methods=['POST'])
def ask_assistant():
    """Ask a question to the assistant"""
    try:
        data = request.get_json()
        question = data.get('question', '') if data else ''
        
        if not question:
            return jsonify({'success': False, 'error': 'No question provided'}), 400
        
        assistant = get_assistant()
        message = assistant.process_user_question(question)
        
        return jsonify({
            'success': True,
            'message': {
                'id': message.id,
                'type': message.type,
                'title': message.title,
                'content': message.content,
                'timestamp': message.timestamp,
                'priority': message.priority
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@assistant_bp.route('/status', methods=['GET'])
def get_assistant_status():
    """Get assistant status and stats"""
    try:
        assistant = get_assistant()
        return jsonify({
            'success': True,
            'status': assistant.to_dict()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
