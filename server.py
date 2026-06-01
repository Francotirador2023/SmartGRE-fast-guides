# -*- coding: utf-8 -*-
"""
SmartGRE - Backend Server (FastAPI + SQLite)
Fase 1: Motor del Servidor Local y Persistencia de Base de Datos

Este servidor maneja la ingesta de imágenes, la comunicación segura con Gemini API,
y la persistencia en una base de datos local SQLite.
"""

import os
import sys
import json
import sqlite3
from datetime import datetime
from typing import Optional, List

# Intentar importar dependencias del Servidor Web
try:
    from fastapi import FastAPI, UploadFile, File, Form, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse
    from pydantic import BaseModel
    import uvicorn
except ImportError:
    print("❌ Error: Faltan dependencias web para ejecutar el servidor.")
    print("👉 Por favor, ejecuta en tu terminal:")
    print("   pip install fastapi uvicorn python-multipart Pillow google-generativeai")
    sys.exit(1)

from PIL import Image
import google.generativeai as genai

# Cargar variables de entorno desde un archivo .env local si existe
if os.path.exists(".env"):
    try:
        with open(".env", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip()
    except Exception as e:
        print(f"⚠️ No se pudo leer el archivo .env local: {str(e)}")
# ==============================================================================
# CONFIGURACIÓN DE TU API KEY DE GEMINI (Cargada de .env de forma segura para GitHub)
# ==============================================================================
API_KEY = os.environ.get("GEMINI_API_KEY", "")
# ==============================================================================

# Inicializar FastAPI
app = FastAPI(title="SmartGRE API Server", version="1.0")

# Habilitar CORS para que tu index.html local (file:///) pueda hacer peticiones a http://localhost:8000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Permitir peticiones desde cualquier origen (incluyendo archivos locales)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = 'database.db'

# ==============================================================================
# INICIALIZACIÓN DE LA BASE DE DATOS SQLITE
# ==============================================================================
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Crear la tabla de guías si no existe
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS guides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_created TEXT,
            doc_type TEXT,
            sender_ruc TEXT,
            sender_name TEXT,
            doc_number TEXT,
            doc_date TEXT,
            start_point TEXT,
            end_point TEXT,
            recipient_ruc TEXT,
            recipient_name TEXT,
            carrier_name TEXT,
            carrier_ruc TEXT,
            driver_name TEXT,
            driver_license TEXT,
            vehicle_plate TEXT,
            weight_kg TEXT,
            items_json TEXT,
            status TEXT,
            gre_number TEXT
        )
    ''')
    
    # Insertar un par de registros semilla de ejemplo en el historial si la tabla está vacía
    cursor.execute('SELECT COUNT(*) FROM guides')
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
            INSERT INTO guides (
                date_created, doc_type, sender_ruc, sender_name, doc_number, doc_date,
                start_point, end_point, recipient_ruc, recipient_name,
                carrier_name, carrier_ruc, driver_name, driver_license, vehicle_plate,
                weight_kg, items_json, status, gre_number
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        ''', (
            datetime.now().strftime("%d/%m/%Y %H:%M"),
            "carrier", "20549281042", "LABORATORIO HOFARM S.A.C.", "GRR-0049281", "30/05/2026",
            "Jr. Los Cedros 452 - Lince", "Av. Industrial 1050 - Ate", "20104829103", "DIFARMA S.A.",
            "TRANSAGUI CORP S.A.C.", "20948271031", "Carlos Mendoza Vasquez", "Q-4829103", "F4B-920",
            "2450", '[{"descripcion":"Amoxicilina 500mg (x100 tab)", "cantidad":150, "unidad_medida":"CAJAS"}]',
            "EMITIDO", "GRT-2026-004822"
        ))
        conn.commit()
    conn.close()

# Inicializar DB al arrancar el script
init_db()

# Modelos de validación Pydantic
class EmitRequest(BaseModel):
    doc_type: str  # "carrier" o "sender"
    sender_ruc: str
    sender_name: str
    doc_number: str
    doc_date: str
    start_point: str
    end_point: str
    recipient_ruc: str
    recipient_name: str
    carrier_name: str
    carrier_ruc: str
    driver_name: str
    driver_license: str
    vehicle_plate: str
    weight_kg: str
    items: List[dict]

# ==============================================================================
# ENDPOINTS API REST
# ==============================================================================


# 1. SCAN ENDPOINT: Recibe archivo de rampa, ejecuta Gemini AI, retorna JSON
@app.post("/api/scan")
async def scan_document(file: UploadFile = File(...)):
    # Validar API Key
    api_key_resolved = API_KEY or os.environ.get("GEMINI_API_KEY")
    if not api_key_resolved or api_key_resolved == "" or "TU_API_KEY" in api_key_resolved:
        # Si la API Key no es válida, devolvemos un error amigable
        raise HTTPException(
            status_code=400,
            detail="🔑 API Key requerida en el servidor. Por favor configura la variable API_KEY en server.py"
        )

    # Validar que sea una imagen
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo subido debe ser una imagen (JPG/PNG).")

    try:
        # Cargar imagen en memoria usando Pillow
        img = Image.open(file.file)
        
        # Configurar Google Generative AI
        genai.configure(api_key=api_key_resolved)
        
        # Obtener dinámicamente el mejor modelo disponible en la cuenta del usuario
        # Priorizamos gemini-2.5-flash y gemini-1.5-flash porque tienen la cuota de uso gratuita más amplia (15 solicitudes por minuto).
        # Evitamos usar modelos experimentales (como 3.5 o 3.0) que tienen límites extremadamente bajos en la capa gratis.
        model_name = 'gemini-2.5-flash'
        try:
            modelos = [m.name.replace('models/', '') for m in genai.list_models()]
            for m in ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-3.0-flash', 'gemini-3.5-flash']:
                if m in modelos:
                    model_name = m
                    break
        except Exception:
            pass

        print(f"🤖 Procesando con modelo: {model_name}")
        model = genai.GenerativeModel(model_name)
        
        prompt = """
        Analiza detalladamente esta imagen de documento comercial o logístico (puede ser una Guía de Remisión Remitente, Guía de Transportista, Factura o una Orden de Compra).
        Extrae toda la información tributaria y de carga estructurándola exactamente en el siguiente formato JSON. Si no encuentras algún campo en el documento, colócalo como null o vacío.
        
        Devuelve ÚNICAMENTE el código JSON limpio, sin comentarios adicionales fuera del bloque de código.
        
        Estructura JSON requerida:
        {
          "tipo_documento_detectado": "GUIA_REMITENTE o GUIA_TRANSPORTISTA o FACTURA o ORDEN_COMPRA o DESCONOCIDO",
          "emisor": {
            "ruc": "Número de RUC del emisor (11 dígitos)",
            "razon_social": "Nombre de la empresa emisora",
            "direccion": "Dirección fiscal del emisor"
          },
          "referencia_documento": {
            "numero": "Número de la Guía, Factura u Orden de Compra",
            "fecha_emision": "Fecha de emisión del documento"
          },
          "ruta": {
            "punto_partida": "Dirección completa de inicio del traslado",
            "punto_llegada": "Dirección completa de destino"
          },
          "destinatario": {
            "ruc": "RUC de la empresa que recibe la mercadería",
            "razon_social": "Nombre de la empresa destinataria"
          },
          "datos_carga": {
            "peso_bruto_total_kg": "Peso bruto total en kilogramos (solo el número, ej. 2450)",
            "transportista_nombre": "Nombre de la empresa de transporte asignada (si figura)",
            "transportista_ruc": "RUC de la empresa de transportes (si figura)"
          },
          "items": [
            {
              "cantidad": "Número de cantidad",
              "descripcion": "Descripción detallada del producto",
              "unidad_medida": "Unidad de medida (ej. UND, KG, CAJAS, PALLETS)"
            }
          ]
        }
        """

        response = model.generate_content([prompt, img])
        raw_text = response.text.strip()
        
        # Limpiar tags de markdown ```json si estuvieran
        if raw_text.startswith("```"):
            lines = raw_text.split('\n')
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            raw_text = '\n'.join(lines).strip()
            
        extracted_json = json.loads(raw_text)
        return extracted_json

    except Exception as e:
        err_msg = str(e)
        if "429" in err_msg or "quota" in err_msg.lower() or "resourceexhausted" in err_msg.lower():
            raise HTTPException(
                status_code=429,
                detail="⏱️ Límite de solicitudes de la API gratuita superado. Por favor, espera 60 segundos a que la cuota de Google se reinicie e intenta de nuevo."
            )
        raise HTTPException(status_code=500, detail=f"Error al procesar la imagen con Gemini: {err_msg}")

# 2. EMIT ENDPOINT: Guarda el documento final emitido en la base de datos SQLite
@app.post("/api/emit")
def emit_document(req: EmitRequest):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Generar número de guía oficial ficticio
        import random
        random_suffix = random.randint(10000, 99999)
        gre_number = f"GRT-2026-0{random_suffix}" if req.doc_type == 'carrier' else f"GRR-00{random_suffix}"
        
        date_now = datetime.now().strftime("%d/%m/%Y %H:%M")
        
        # Insertar registro
        cursor.execute('''
            INSERT INTO guides (
                date_created, doc_type, sender_ruc, sender_name, doc_number, doc_date,
                start_point, end_point, recipient_ruc, recipient_name,
                carrier_name, carrier_ruc, driver_name, driver_license, vehicle_plate,
                weight_kg, items_json, status, gre_number
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        ''', (
            date_now, req.doc_type, req.sender_ruc, req.sender_name, req.doc_number, req.doc_date,
            req.start_point, req.end_point, req.recipient_ruc, req.recipient_name,
            req.carrier_name, req.carrier_ruc, req.driver_name, req.driver_license, req.vehicle_plate,
            req.weight_kg, json.dumps(req.items), "EMITIDO", gre_number
        ))
        
        conn.commit()
        conn.close()
        
        return {
            "status": "success",
            "gre_number": gre_number,
            "date": date_now
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar la guía en la Base de Datos: {str(e)}")

# 3. GET HISTORY: Retorna el historial persistente ordenado por fecha
@app.get("/api/history")
def get_history(role: str = "carrier"):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row  # Retornar dicts
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM guides 
            WHERE doc_type = ? 
            ORDER BY id DESC
        ''', (role,))
        
        rows = cursor.fetchall()
        conn.close()
        
        history_list = []
        for r in rows:
            history_list.append({
                "id": r["id"],
                "date_created": r["date_created"],
                "doc_type": r["doc_type"],
                "sender_ruc": r["sender_ruc"],
                "sender_name": r["sender_name"],
                "doc_number": r["doc_number"],
                "doc_date": r["doc_date"],
                "start_point": r["start_point"],
                "end_point": r["end_point"],
                "recipient_ruc": r["recipient_ruc"],
                "recipient_name": r["recipient_name"],
                "carrier_name": r["carrier_name"],
                "carrier_ruc": r["carrier_ruc"],
                "driver_name": r["driver_name"],
                "driver_license": r["driver_license"],
                "vehicle_plate": r["vehicle_plate"],
                "weight_kg": r["weight_kg"],
                "items": json.loads(r["items_json"]) if r["items_json"] else [],
                "status": r["status"],
                "gre_number": r["gre_number"]
            })
            
        return history_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al leer el historial de la base de datos: {str(e)}")

# ==============================================================================
# SERVIR FRONTEND DIRECTAMENTE DESDE EL SERVIDOR (EVITA BLOQUEOS DE CORS Y ARCHIVO LOCAL)
# ==============================================================================
@app.get("/")
def read_index():
    return FileResponse("index.html")

@app.get("/styles.css")
def read_css():
    return FileResponse("styles.css")

@app.get("/app.js")
def read_js():
    return FileResponse("app.js")

@app.get("/SmarGRE-LOGO.jpeg")
def read_logo_jpeg():
    if os.path.exists("SmarGRE-LOGO.jpeg"):
        return FileResponse("SmarGRE-LOGO.jpeg")
    return None

@app.get("/logo SmartGRE.jpg")
def read_logo_jpg():
    if os.path.exists("logo SmartGRE.jpg"):
        return FileResponse("logo SmartGRE.jpg")
    return None

# Arrancar el servidor
if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("      SMARTGRE BACKEND - INICIANDO SERVIDOR LOCAL TRIBUTARIO")
    print("=" * 70)
    print("👉 Inicializando base de datos SQLite 'database.db'...")
    print("👉 Servidor Web y API corriendo en: http://127.0.0.1:8000")
    print("👉 Abre esta URL en cualquier navegador para usar la app real sin bloqueos!")
    print("=" * 70 + "\n")
    
    uvicorn.run(app, host="127.0.0.1", port=8000)
