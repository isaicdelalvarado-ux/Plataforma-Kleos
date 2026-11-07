import gspread
from google.oauth2.service_account import Credentials

creds = Credentials.from_service_account_file("credentials.json", scopes=["https://www.googleapis.com/auth/spreadsheets"])
gc = gspread.authorize(creds)
sh = gc.open_by_key("1gUMRdWqGwnhJ4cEkt-lOKyYMiGNq2UawthVSdNf1b7o")

print("=== VERIFICACIÓN RM_ATLETAS (BASALES CICLO 1) ===")
ws_base = sh.worksheet("RM_Atletas")
base_vals = ws_base.get_all_values()
base_lookup = {(r[0].strip(), r[1].strip()): r[2].strip() for r in base_vals[1:] if len(r) >= 3}

checks_base = [
    ("Andrea Flores", "Back Squat", "105"),
    ("Elisbeth Menco", "Back Squat", "90"),
    ("Asdrubal", "Back Squat", "110"),
    ("Shantal Vivas", "Back Squat", "85"),
    ("Ariangel Rondon", "Back Squat", "80"),
    ("Ariannys Valero", "Back Squat", "90"),
    ("Asdrubal", "Clean Squat", "80"),
    ("Elisbeth Menco", "Clean Squat", "75"),
    ("Ariannys Valero", "Clean Squat", "70"),
    ("Andrea Flores", "Clean Squat", "65"),
    ("Shantal Vivas", "Clean Squat", "60"),
    ("Ariangel Rondon", "Clean Squat", "60"),
    ("Asdrubal", "Jerk", "70"),
    ("Andrea Flores", "Jerk", "60"),
    ("Elisbeth Menco", "Jerk", "60"),
    ("Ariangel Rondon", "Jerk", "60"),
    ("Ariannys Valero", "Jerk", "60"),
    ("Shantal Vivas", "Jerk", "56"),
]

all_base_ok = True
for ath, ej, expected in checks_base:
    actual = base_lookup.get((ath, ej), "FALTA")
    ok = (actual == expected)
    if not ok:
        all_base_ok = False
    print(f"[{'OK' if ok else 'FAIL'}] {ath} | {ej}: actual={actual} (esperado={expected})")

print("\n=== VERIFICACIÓN HISTORIAL_RMS (DEPURADO) ===")
ws_hist = sh.worksheet("Historial_RMs")
hist_vals = ws_hist.get_all_values()
print(f"Total filas en Historial_RMs: {len(hist_vals)}")
ciclos_en_hist = set(r[4] for r in hist_vals[1:] if len(r) >= 5)
print(f"Etiquetas de Ciclo en Historial_RMs: {ciclos_en_hist}")

print("\n=== VERIFICACIÓN RM_CICLO_02 ===")
ws_c2 = sh.worksheet("RM_Ciclo_02")
c2_vals = ws_c2.get_all_values()
c2_lookup = {(r[0].strip(), r[1].strip()): r[2].strip() for r in c2_vals[1:] if len(r) >= 3}

checks_c2 = [
    # Back Squat
    ("Elisbeth Menco", "Back Squat", "120,5"),
    ("Andrea Flores", "Back Squat", "120,0"),
    ("Shantal Vivas", "Back Squat", "101,0"),
    ("Ariangel Rondon", "Back Squat", "101,0"),
    ("Asdrubal", "Back Squat", "108,0"),
    # Clean Squat
    ("Asdrubal", "Clean Squat", "87,0"),
    ("Shantal Vivas", "Clean Squat", "65,0"),
    ("Ariangel Rondon", "Clean Squat", "65,0"),
    # Clean Complex
    ("Asdrubal", "Clean Complex", "87,0"),
    ("Shantal Vivas", "Clean Complex", "65,0"),
    ("Ariangel Rondon", "Clean Complex", "65,0"),
    # Clean & Jerk / Jerk
    ("Asdrubal", "Clean & Jerk", "83,0"),
    ("Andrea Flores", "Clean & Jerk", "65,0"),
    ("Andrea Flores", "Split Jerk", "65,0"),
    ("Ariangel Rondon", "Clean & Jerk", "65,0"),
    ("Shantal Vivas", "Clean & Jerk", "60,0"),
]

all_c2_ok = True
for ath, ej, expected in checks_c2:
    actual = c2_lookup.get((ath, ej), "FALTA")
    ok = (actual == expected)
    if not ok:
        all_c2_ok = False
    print(f"[{'OK' if ok else 'FAIL'}] {ath} | {ej}: actual={actual} (esperado={expected})")

print("\n=== RESULTADO GENERAL ===")
print("Base RM_Atletas:", "CORRECTO" if all_base_ok else "HAY DISCREPANCIAS")
print("Historial_RMs:", "CORRECTO (Solo Ciclo_02)" if ciclos_en_hist == {'Ciclo_02'} else "HAY DISCREPANCIAS")
print("RM_Ciclo_02:", "CORRECTO" if all_c2_ok else "HAY DISCREPANCIAS")
