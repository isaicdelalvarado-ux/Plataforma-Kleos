import urllib.request
import json
import time
import threading
import sys
from datetime import datetime

# Evitar problemas de codificación en consolas Windows cp1252
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwyoY9ISXFgW_BD37tg_PduuK72er45V8Wkj5r9hHcC5LbippoMya3T1Ux5azOJbpSh/exec"

ATHLETES = [
    {"name": "Asdrubal", "exercise": "Snatch (High Hang)", "weight": 60, "rm": 60, "rpe": "9"},
    {"name": "Andrea Flores", "exercise": "Back Squat (Pausa)", "weight": 85, "rm": 105, "rpe": "8.5"},
    {"name": "Shantal Vivas", "exercise": "Power Clean", "weight": 50, "rm": 60, "rpe": "8"},
    {"name": "Elisbeth Menco", "exercise": "Clean & Jerk", "weight": 70, "rm": 60, "rpe": "9"},
    {"name": "Ariannys Valero", "exercise": "Deadlift (Sumo)", "weight": 90, "rm": 105, "rpe": "8.5"}
]

def get_audit():
    url = f"{SCRIPT_URL}?action=audit"
    req = urllib.request.Request(url, headers={'User-Agent': 'KleosLoadTester/1.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))

results = []
barrier = threading.Barrier(len(ATHLETES))

def send_payload(athlete_data, index):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    payload = {
        "type": "registro_diario",
        "athlete": athlete_data["name"],
        "timestamp": now_str,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "category": "Levantamiento Olímpico" if ("Snatch" in athlete_data["exercise"] or "Clean" in athlete_data["exercise"]) else "Fuerza",
        "exercise": athlete_data["exercise"],
        "series": 4,
        "repsOrDistance": "3",
        "weight": athlete_data["weight"],
        "oneRepMax": athlete_data["rm"],
        "rpe": athlete_data["rpe"]
    }
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        SCRIPT_URL,
        data=data_bytes,
        headers={
            'Content-Type': 'text/plain;charset=utf-8',
            'User-Agent': 'KleosLoadTester/1.0'
        },
        method='POST'
    )
    
    # Sincronización estricta de barrera: todos los hilos esperan aquí y se liberan juntos
    barrier.wait()
    t_start = time.time()
    status_code = None
    response_text = ""
    error_msg = None
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            status_code = resp.getcode()
            response_text = resp.read().decode('utf-8')
    except Exception as e:
        error_msg = str(e)
    t_end = time.time()
    
    results.append({
        "index": index,
        "athlete": athlete_data["name"],
        "exercise": athlete_data["exercise"],
        "start_time": t_start,
        "end_time": t_end,
        "duration_sec": round(t_end - t_start, 3),
        "status_code": status_code,
        "response": response_text,
        "error": error_msg
    })

def main():
    print("=" * 65)
    print("   [PLATAFORMA KLEOS]: TEST DE ALTA CONCURRENCIA REAL")
    print("=" * 65)
    print(f"Destino: {SCRIPT_URL}")
    print(f"Atletas concurrentes: {len(ATHLETES)}")
    print("Modo de disparo: Thread Barrier (disparo en el mismo milisegundo)")
    print("-" * 65)
    
    print("\n[Paso 1/3] Realizando auditoria pre-test en Google Sheets...")
    pre_audit = get_audit()
    reg_pre = pre_audit.get("sheetsStatus", {}).get("Registro_Diario", {})
    print(f"  > Registro_Diario filas actuales: {reg_pre.get('activeRecords', 'N/A')}")
    print(f"  > Proxima fila libre en Columna A: {reg_pre.get('firstEmptyRowColA', 'N/A')}")
    
    print("\n[Paso 2/3] Disparando 5 envios POST estrictamente simultaneos...")
    threads = []
    for i, ath in enumerate(ATHLETES):
        t = threading.Thread(target=send_payload, args=(ath, i+1))
        threads.append(t)
        t.start()
        
    for t in threads:
        t.join()
        
    print("\n[Paso 3/3] Evaluando respuestas recibidas:")
    all_success = True
    for r in sorted(results, key=lambda x: x["start_time"]):
        is_ok = (r["status_code"] == 200 and "success" in (r["response"] or ""))
        status_sym = "[EXITO]" if is_ok else "[FALLO]"
        if not is_ok:
            all_success = False
        print(f"  {status_sym} [{r['athlete']}] {r['exercise']} -> Status: {r['status_code']}, Latencia: {r['duration_sec']}s")
        print(f"      Respuesta: {r['response'][:90]}")
        if r["error"]:
            print(f"      Error: {r['error']}")
        
    print("\nEsperando 4 segundos para asentar escrituras y telemetria...")
    time.sleep(4)
    
    print("\n[Auditoria Post-Test] Verificando consistencia en Google Sheets...")
    post_audit = get_audit()
    reg_post = post_audit.get("sheetsStatus", {}).get("Registro_Diario", {})
    log_post = post_audit.get("sheetsStatus", {}).get("Log_Script", {})
    discrepancies = post_audit.get("discrepancies", [])
    
    delta_reg = (reg_post.get('activeRecords', 0) or 0) - (reg_pre.get('activeRecords', 0) or 0)
    print(f"  > Registro_Diario filas tras test: {reg_post.get('activeRecords', 'N/A')} (+{delta_reg} filas insertadas)")
    print(f"  > Proxima fila libre en Columna A: {reg_post.get('firstEmptyRowColA', 'N/A')}")
    print(f"  > Telemetria Log_Script filas: {log_post.get('activeRecords', 'N/A')}")
    print(f"  > Discrepancias detectadas: {len(discrepancies)} -> {discrepancies}")
    print(f"  > Estado general: {post_audit.get('status')}")
    print(f"  > Resumen: {post_audit.get('summary')}")
    
    output_report = {
        "timestamp": datetime.now().isoformat(),
        "delta_rows": delta_reg,
        "pre_audit": pre_audit,
        "results": results,
        "post_audit": post_audit,
        "all_success": all_success
    }
    
    with open("test_concurrencia_resultado.json", "w", encoding="utf-8") as f:
        json.dump(output_report, f, indent=2, ensure_ascii=False)
    print("\nReporte completo guardado en 'test_concurrencia_resultado.json'.")

if __name__ == "__main__":
    main()
