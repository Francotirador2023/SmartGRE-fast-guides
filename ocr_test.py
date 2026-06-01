# -*- coding: utf-8 -*-
"""
SmartGRE - Proof of Concept (POC)
Extractor Inteligente de Guías y Órdenes de Compra con Inteligencia Artificial (Gemini 1.5 Flash)

Este script permite procesar una foto o imagen real de una guía, orden de compra o factura,
y extraer toda la información relevante en formato JSON estructurado utilizando IA de Google.
"""

import os
import sys
import json

# Mensaje de ayuda antes de importar dependencias pesadas
def print_welcome():
    print("=" * 70)
    print("      SMARTGRE - COMPROBADOR DE EXTRACCIÓN CON INTELIGENCIA ARTIFICIAL")
    print("=" * 70)

try:
    from PIL import Image
except ImportError:
    print_welcome()
    print("\n❌ Error: No se encontró la librería 'Pillow'.")
    print("👉 Por favor, ejecuta en tu terminal:")
    print("   pip install Pillow")
    sys.exit(1)

try:
    import google.generativeai as genai
except ImportError:
    print_welcome()
    print("\n❌ Error: No se encontró la librería 'google-generativeai'.")
    print("👉 Por favor, ejecuta en tu terminal:")
    print("   pip install google-generativeai")
    sys.exit(1)

# ==============================================================================
# CONFIGURACIÓN DE TU API KEY DE GEMINI (Cargada desde .env para proteger GitHub)
# ==============================================================================
API_KEY = os.environ.get("GEMINI_API_KEY", "")
# ==============================================================================

def main():
    print_welcome()
    
    # 1. Resolver la API Key
    api_key_resolved = API_KEY or os.environ.get("GEMINI_API_KEY")
    
    if not api_key_resolved:
        print("\n🔑 CONFIGURACIÓN REQUERIDA:")
        print("Para que este comprobador funcione, necesitas una API Key gratuita de Google.")
        print("\nPasos para obtenerla:")
        print("1. Entra a: https://aistudio.google.com/ e inicia sesión con tu cuenta de Gmail.")
        print("2. Haz clic en 'Get API key' y luego en 'Create API key'.")
        print("3. Copia la clave generada.")
        print("4. Abre este archivo ('ocr_test.py') en VS Code y pégala en la línea 40:")
        print("   API_KEY = 'TU_CLAVE_AQUI'")
        print("\nUna vez hecho esto, vuelve a ejecutar el script.")
        print("=" * 70)
        sys.exit(0)
        
    # Configurar SDK de Google
    genai.configure(api_key=api_key_resolved)
    
    # 2. Identificar el archivo de imagen a procesar
    image_path = None
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
    else:
        # Si no se provee argumento, buscar imágenes comunes en la carpeta
        formatos_validos = ['.jpg', '.jpeg', '.png']
        archivos_en_carpeta = os.listdir('.')
        imagenes_encontradas = [
            f for f in archivos_en_carpeta 
            if os.path.splitext(f)[1].lower() in formatos_validos and f != 'logo SmartGRE.jpg'
        ]
        
        if imagenes_encontradas:
            image_path = imagenes_encontradas[0]
            print(f"\n📂 No especificaste una imagen por comando. Usando la encontrada en la carpeta: '{image_path}'")
        else:
            print("\n📸 ¿CÓMO PROBAR CON TU PROPIA IMAGEN?")
            print("1. Toma una foto con tu celular a una guía real, factura u orden de compra.")
            print("2. Guarda la imagen en esta misma carpeta (ej: 'mi_guia.jpg' o 'foto.png').")
            print("3. Ejecuta el script pasándole el nombre del archivo de la siguiente manera:")
            print("   python ocr_test.py mi_guia.jpg")
            print("\nNota: He omitido 'logo SmartGRE.jpg' porque es tu logo de marca y no un documento a escanear.")
            print("=" * 70)
            sys.exit(0)
            
    if not os.path.exists(image_path):
        print(f"\n❌ Error: El archivo de imagen '{image_path}' no existe en esta carpeta.")
        sys.exit(1)
        
    # 3. Procesar el documento con IA
    print(f"\n🔄 Abriendo imagen '{image_path}'...")
    try:
        img = Image.open(image_path)
    except Exception as e:
        print(f"❌ Error al abrir la imagen: {e}")
        sys.exit(1)
        
    print("⚡ Procesando documento y aplicando OCR cognitivo de alta precisión con Gemini... (Esto tomará 2-4 segundos)")
    
    # Prompt optimizado para logística y tributos (SUNAT / LATAM)
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
        "numero": "Número de la Guía, Factura u Orden de Compra (ej. EG01-0012345 o OC-9821)",
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
          "cantidad": "Número entero o decimal de cantidad",
          "descripcion": "Descripción detallada del producto",
          "unidad_medida": "Unidad de medida (ej. UND, KG, CAJAS, PALLETS)"
        }
      ]
    }
    """
    
    try:
        # Obtener los modelos disponibles de forma dinámica para evitar 404 por modelos obsoletos o deprecados
        model_name = 'gemini-2.5-flash' # Valor por defecto
        try:
            modelos = [m.name.replace('models/', '') for m in genai.list_models()]
            for m in ['gemini-3.5-flash', 'gemini-3.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']:
                if m in modelos:
                    model_name = m
                    break
        except Exception:
            pass
            
        print(f"🤖 Conectando con Google {model_name}...")
        model = genai.GenerativeModel(model_name)
        response = model.generate_content([prompt, img])
        
        # Limpiar la respuesta en caso de que Gemini devuelva markdown de tipo ```json ... ```
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            # Quitar líneas de triple comilla
            lines = raw_text.split('\n')
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            raw_text = '\n'.join(lines).strip()
            
        # Validar y cargar el JSON
        extracted_data = json.loads(raw_text)
        
        print("\n" + "🎉 RESULTADO DE EXTRACCIÓN REAL EXITOSO!".center(70, "="))
        print(json.dumps(extracted_data, indent=2, ensure_ascii=False))
        print("=" * 70)
        print("\n💡 ¡LISTO PARA EL FRONTEND!")
        print("Estos datos en formato JSON son exactamente el tipo de información estructurada")
        print("que tu aplicación web (app.js) utiliza para completar los formularios automáticamente.")
        print("Esto demuestra que el motor es 100% viable y fácil de implementar.")
        print("=" * 70)
        
    except Exception as e:
        print("\n❌ Ocurrió un error durante el procesamiento con Gemini:")
        print(str(e))
        print("\nPosibles causas:")
        print("1. Tu API Key no es válida o está activa.")
        print("2. No tienes conexión a Internet.")
        print("3. La API superó la cuota gratuita temporalmente.")
        print("=" * 70)

if __name__ == '__main__':
    main()
