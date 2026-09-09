"""
PLATAFORMA KLEOS - SERVIDOR LOCAL INTELIGENTE MULTI-PUERTO
- Libera sockets automáticamente con SO_REUSEADDR.
- Si el puerto 5500 está ocupado, busca automáticamente 5501, 8080, 8000 o el siguiente disponible.
- Habilita CORS completo y desactiva caché agresivo para desarrollo fluido.
- Abre automáticamente el navegador en la URL activa.
"""
import sys
import os
import socket
import webbrowser
from http.server import SimpleHTTPRequestHandler, HTTPServer

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

class KleosHttpHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Cabeceras CORS y control de caché
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        # Registro limpio en consola
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

def start_server():
    # Asegurar que el directorio de trabajo es la carpeta del proyecto
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)

    ports_to_try = [5500, 5501, 5502, 8080, 8000, 3000]
    httpd = None
    selected_port = None

    for port in ports_to_try:
        try:
            # Crear servidor en 127.0.0.1 con reuso de dirección habilitado
            server_address = ('127.0.0.1', port)
            httpd = HTTPServer(server_address, KleosHttpHandler)
            selected_port = port
            break
        except OSError:
            print(f"[!] Puerto {port} ocupado o no disponible, buscando alternativa...")
            continue

    if not httpd:
        # Fallback a cualquier puerto libre asignado por el sistema operativo
        server_address = ('127.0.0.1', 0)
        httpd = HTTPServer(server_address, KleosHttpHandler)
        selected_port = httpd.server_port

    url = f"http://127.0.0.1:{selected_port}/index.html"
    
    print("\n" + "=" * 65)
    print("   🏛️   PLATAFORMA KLEOS - SERVIDOR LOCAL SEGURO ACTIVO")
    print("=" * 65)
    print(f"   URL Principal:  {url}")
    print(f"   Puerto Activo:  {selected_port}")
    print(f"   Directorio:     {project_dir}")
    print("   Estado:         Listo para registrar atletas y entrenamientos")
    print("   (Presiona Ctrl + C en esta ventana para detener el servidor)")
    print("=" * 65 + "\n")

    # Abrir navegador automáticamente
    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[OK] Cerrando servidor Plataforma Kleos limpiamente...")
        try:
            httpd.server_close()
        except Exception:
            pass
        sys.exit(0)

if __name__ == '__main__':
    start_server()
