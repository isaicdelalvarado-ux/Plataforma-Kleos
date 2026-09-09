"""
MONITOR PROACTIVO DE INTEGRIDAD Y DISPONIBILIDAD - PLATAFORMA KLEOS
Ejecuta diagnósticos continuos del endpoint oficial, verifica la latencia,
audita la integridad de Google Sheets y alerta si ocurre algún desfase o bloqueo.
"""
import urllib.request
import json
import time
import sys
from datetime import datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwyoY9ISXFgW_BD37tg_PduuK72er45V8Wkj5r9hHcC5LbippoMya3T1Ux5azOJbpSh/exec"

def check_health():
    url = f"{SCRIPT_URL}?action=audit"
    t0 = time.time()
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'KleosHealthMonitor/1.0'})
        with urllib.request.urlopen(req, timeout=20) as resp:
            elapsed = round(time.time() - t0, 3)
            data = json.loads(resp.read().decode('utf-8'))
            return {
                "ok": True,
                "latency_sec": elapsed,
                "status": data.get("status"),
                "sheets": data.get("sheetsStatus", {}),
                "discrepancies": data.get("discrepancies", []),
                "summary": data.get("summary", "")
            }
    except Exception as e:
        return {
            "ok": False,
            "latency_sec": round(time.time() - t0, 3),
            "error": str(e)
        }

def run_report():
    print("=" * 65)
    print("   🛡️   MONITOR PROACTIVO DE SALUD - PLATAFORMA KLEOS")
    print(f"   Hora: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 65)

    health = check_health()
    if not health["ok"]:
        print(f"❌ ALERTA: Endpoint no disponible o tiempo de espera agotado.")
        print(f"   Error: {health.get('error')}")
        print(f"   Latencia: {health.get('latency_sec')}s")
        return False

    print(f"✅ CONECTIVIDAD: Operativa (Latencia: {health['latency_sec']}s)")
    print(f"   Estado Ecosistema: {health['status']}")
    print(f"   Resumen: {health['summary']}")

    sheets = health.get("sheets", {})
    reg = sheets.get("Registro_Diario", {})
    well = sheets.get("Wellness", {})
    log = sheets.get("Log_Script", {})

    print("\n   📊 ESTADO DE HOJAS GOOGLE SHEETS:")
    print(f"      • Registro_Diario: {reg.get('activeRecords', 'N/A')} registros activos (Próxima fila libre: {reg.get('firstEmptyRowColA', 'N/A')})")
    print(f"      • Wellness:        {well.get('activeRecords', 'N/A')} registros activos (Próxima fila libre: {well.get('firstEmptyRowColA', 'N/A')})")
    print(f"      • Log_Script:      {log.get('activeRecords', 'N/A')} eventos de telemetría auditados")

    discrepancies = health.get("discrepancies", [])
    if len(discrepancies) > 0:
        print(f"\n⚠️ DISCREPANCIAS DETECTADAS ({len(discrepancies)}):")
        for d in discrepancies:
            print(f"      - {d}")
        return False
    else:
        print("\n✅ Cero discrepancias. Fórmulas, cabeceras y Looker Studio sincronizados al 100%.")
        return True

if __name__ == "__main__":
    success = run_report()
    sys.exit(0 if success else 1)
