import logging

def configurar_logger():
    logging.basicConfig(filename='logs/operation_log.txt', level=logging.INFO)
    logging.info("Logger configurado.")
