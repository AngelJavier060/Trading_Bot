FROM python:3.11-slim

# Directorio de trabajo dentro del contenedor
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instalar dependencias del backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del backend
COPY backend/ /app/

# Puerto expuesto por Flask
EXPOSE 5000

# Comando por defecto
CMD ["python", "run.py"]
