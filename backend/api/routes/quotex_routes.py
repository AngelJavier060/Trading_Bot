from flask import Blueprint
from api.controllers.quotex_controller import QuotexController

quotex_bp = Blueprint('quotex', __name__)
controller = QuotexController()

@quotex_bp.route('/connect', methods=['POST'])
def connect():
    return controller.connect()

@quotex_bp.route('/disconnect', methods=['POST'])
def disconnect():
    return controller.disconnect()

@quotex_bp.route('/check-connection', methods=['GET'])
def check_connection():
    return controller.check_connection() 