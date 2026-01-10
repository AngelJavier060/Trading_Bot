from functools import wraps
from flask import request, jsonify
from pydantic import ValidationError

def validate_schema(schema_class):
    """
    Decorador para validar el cuerpo de una petición JSON con Pydantic.
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            try:
                # Si es GET, validamos los query params
                if request.method == 'GET':
                    data = request.args.to_dict()
                else:
                    data = request.get_json() or {}
                
                # Validar con Pydantic
                validated_data = schema_class(**data)
                
                # Inyectar los datos validados en los argumentos de la función
                return f(*args, validated_data=validated_data, **kwargs)
            except ValidationError as e:
                return jsonify({
                    'status': 'error',
                    'message': 'Error de validación',
                    'errors': e.errors()
                }), 400
            except Exception as e:
                return jsonify({
                    'status': 'error',
                    'message': f'Error inesperado en validación: {str(e)}'
                }), 500
        return wrapper
    return decorator
