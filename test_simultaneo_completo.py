"""
TEST DE CONCURRENCIA MULTI-MODALIDAD SIMULTÁNEO - PLATAFORMA KLEOS
Verifica que las peticiones concurrentes de distintas modalidades (Metcon, Fuerza,
Cardio, Gimnásticos, Levantamiento y Wellness) se procesen al 100% sin bloquearse.
"""
import urllib.request
import json
import time
import threading
import sys
from datetime import datetime

# Soporte para salida UTF-8 en consolas Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwyoY9ISXFgW_BD37tg_PduuK72er45V8Wkj5r9hHcC5LbippoMya3T1Ux5azOJbpSh/exec"

# Atletas y modalidades diversas
TEST_SCENARIOS = [
    {
        "athlete": "Asdrubal",
        "category": "Metcon / WOD",
        "exercise": "Fran",
        "duracion": "04:15",
        "scoreReps": 45,
        "pesoWod": 43,
        "rpe": "9.5",
        "type": "registro_diario"
    },
    {
        "athlete": "Andrea Flores",
        "category": "Fuerza",
        "exercise": "Back Squat",
        "series": 5,
        "reps": "5",
        "weight": 85,
        "oneRepMax": 105,
        "rpe": "8.5",
        "type": "registro_diario"
    },
    {
        "athlete": "Shantal Vivas",
        "category": "Cardio",
        "exercise": "Carrera",
        "series": 1,
        "distancia": 5.0,
        "duracion": "24:30",
        "rpe": "7.5",
        "type": "registro_diario"
    },
    {
        "athlete": "Elisbeth Menco",
        "category": "Gimnásticos",
        "exercise": "Pull Ups",
        "series": 4,
        "reps": "12",
        "rpe": "8",
        "type": "registro_diario"
    },
    {
        "athlete": "Ariannys Valero",
        "category": "Levantamiento Olímpico",
        "exercise": "Snatch (High Hang)",
        "series": 4,
        "reps": "3",
        "weight": 55,
        "oneRepMax": 60,
        "rpe": "9",
        "type": "registro_diario"
    },
    {
        "athlete": "Leonidas",
        "type": "wellness",
        "sleepHours": 8.0,
        "sleepQuality": 4,
        "fatigueLevel": 3,
        "muscleSoreness": 5,
        "stressLevel": 2,
        "moodLevel": 5,
        "sorenessAreas": "Sin molestias",
        "notes": "Test concurrente matutino automático"
    }
]

def get_audit():
    url = f"{SCRIPT_URL}?action=audit"
    req = urllib.request.Request(url, headers={'User-Agent': 'KleosConcurrencyTester/2.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))

results = []
barrier = threading.Barrier(len(TEST_SCENARIOS))

def execute_request(scenario, index):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    today_str = datetime.now().strftime("%Y-%m-%d")

    if scenario["type"] == "wellness":
        payload = {
            "type": "wellness",
            "athlete": scenario["athlete"],
            "timestamp": now_str,
            "date": today_str,
            "sleepHours": scenario["sleepHours"],
            "sleepQuality": scenario["sleepQuality"],
            "fatigueLevel": scenario["fatigueLevel"],
            "muscleSoreness": scenario["muscleSoreness"],
            "stressLevel": scenario["stressLevel"],
            "moodLevel": scenario["moodLevel"],
            "sorenessAreas": scenario["sorenessAreas"],
            "notes": scenario["notes"]
        }
    else:
        payload = {
            "type": "registro_diario",
            "athlete": scenario["athlete"],
            "timestamp": now_str,
            "fecha": today_str,
            "date": today_str,
            "categoria": scenario["category"],
            "category": scenario["category"],
            "ejercicio": scenario["exercise"],
            "exercise": scenario["exercise"],
            "series": scenario.get("series", 0),
            "reps": scenario.get("reps", scenario.get("scoreReps", "")),
            "carga": scenario.get("weight", 0),
            "weight": scenario.get("weight", 0),
            "unRM": scenario.get("oneRepMax", 0),
            "oneRepMax": scenario.get("oneRepMax", 0),
            "distancia": scenario.get("distancia", 0),
            "duracion": scenario.get("duracion", ""),
            "duration": scenario.get("duracion", ""),
            "scoreReps": scenario.get("scoreReps", 0),
            "pesoWod": scenario.get("pesoWod", 0),
            "rpe": scenario.get("rpe", "8")
        }

    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        SCRIPT_URL,
        data=data_bytes,
        headers={
            'Content-Type': 'text/plain;charset=utf-8',
            'User-Agent': 'KleosConcurrencyTester/2.0'
        },
        method='POST'
    )

    # Barrera de sincronización: Todos los hilos esperan aquí y disparan en el mismo instante
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
        "athlete": scenario["athlete"],
        "type": scenario["type"],
        "detail": scenario.get("category", "Wellness") + (" - " + scenario.get("exercise", "") if "exercise" in scenario else ""),
        "start_time": t_start,
        "end_time": t_end,
        "duration_sec": round(t_end - t_start, 3),
        "status_code": status_code,
        "response": response_text,
        "error": error_msg
    })

def main():
    print("=" * 70)
    print("   🏛️   PLATAFORMA KLEOS: TEST DE CONCURRENCIA MULTI-MODALIDAD")
    print("=" * 70)
    print(f"Destino: {SCRIPT_URL}")
    print(f"Peticiones simultáneas: {len(TEST_SCENARIOS)}")
    print("Modalidades probadas: Metcon/WOD, Fuerza, Cardio, Gimnásticos, Halterofilia, Wellness")
    print("Mecanismo: Thread Barrier sincronizada")
    print("-" * 70)

    print("\n[Paso 1/3] Auditoría previa de integridad en Google Sheets...")
    pre_audit = get_audit()
    reg_pre = pre_audit.get("sheetsStatus", {}).get("Registro_Diario", {})
    well_pre = pre_audit.get("sheetsStatus", {}).get("Wellness", {})
    print(f"  > 'Registro_Diario' filas activas iniciales: {reg_pre.get('activeRecords', 'N/A')}")
    print(f"  > 'Wellness' filas activas iniciales:        {well_pre.get('activeRecords', 'N/A')}")

    print(f"\n[Paso 2/3] Disparando {len(TEST_SCENARIOS)} peticiones en el mismo milisegundo...")
    threads = []
    for i, scen in enumerate(TEST_SCENARIOS):
        t = threading.Thread(target=execute_request, args=(scen, i + 1))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    print("\n[Paso 3/3] Evaluando respuestas recibidas:")
    all_success = True
    for r in sorted(results, key=lambda x: x["start_time"]):
        is_ok = (r["status_code"] == 200 and "success" in (r["response"] or ""))
        status_sym = "✅ [OK]" if is_ok else "❌ [FALLO]"
        if not is_ok:
            all_success = False
        print(f"  {status_sym} [{r['athlete']}] {r['detail']} -> HTTP {r['status_code']}, Tiempo: {r['duration_sec']}s")
        print(f"         Respuesta: {r['response'][:100]}")
        if r["error"]:
            print(f"         Error: {r['error']}")

    print("\nEsperando 4 segundos para asentamiento en Google Sheets...")
    time.sleep(4)

    print("\n[Auditoría Post-Test] Verificando consistencia y cero saltos de fila...")
    post_audit = get_audit()
    reg_post = post_audit.get("sheetsStatus", {}).get("Registro_Diario", {})
    well_post = post_audit.get("sheetsStatus", {}).get("Wellness", {})
    log_post = post_audit.get("sheetsStatus", {}).get("Log_Script", {})
    discrepancies = post_audit.get("discrepancies", [])

    delta_reg = (reg_post.get('activeRecords', 0) or 0) - (reg_pre.get('activeRecords', 0) or 0)
    delta_well = (well_post.get('activeRecords', 0) or 0) - (well_pre.get('activeRecords', 0) or 0)

    print(f"  > 'Registro_Diario' filas nuevas insertadas: +{delta_reg}")
    print(f"  > 'Wellness' filas nuevas insertadas:        +{delta_well}")
    print(f"  > 'Log_Script' telemetría total:            {log_post.get('activeRecords', 'N/A')}")
    print(f"  > Discrepancias detectadas:                 {len(discrepancies)}")
    print(f"  > Estado General Ecosistema:                {post_audit.get('status')}")
    print(f"  > Resumen Looker Studio:                    {post_audit.get('summary')}")

    report = {
        "timestamp": datetime.now().isoformat(),
        "total_requests": len(TEST_SCENARIOS),
        "all_success": all_success,
        "delta_registro_diario": delta_reg,
        "delta_wellness": delta_well,
        "discrepancies": discrepancies,
        "results": results,
        "post_audit": post_audit
    }

    with open("reporte_estres_simultaneo.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print("\n[OK] Reporte completo guardado en 'reporte_estres_simultaneo.json'.")

    return 0 if all_success else 1

if __name__ == "__main__":
    sys.exit(main())
