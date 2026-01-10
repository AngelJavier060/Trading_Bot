try:
    from iqoptionapi.stable_api import IQ_Option
    print("IQOption API importada correctamente")
except ImportError as e:
    print(f"Error al importar: {str(e)}") 