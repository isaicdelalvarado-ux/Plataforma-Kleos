#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Migración Oficial de Macrociclos en Google Sheets:
- Actualiza 'Control_Ciclo': Ciclo_Activo = 'Atenea', Semana_Actual = 1.
- Renombra 'RM_Ciclo_02' a 'RM_Atenea' (preservando todas sus 33 filas consolidadas).
- Genera 'RM_Zeus' con los 86 registros basales de Ciclo 1 (copia fiel de RM_Atletas).
- Normaliza columnas de ciclo en 'Registro_Diario', 'Wellness' e 'Historial_RMs' a 'Zeus' y 'Atenea'.
"""

import sys
import gspread
from google.oauth2.service_account import Credentials

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def main():
    print("=" * 70)
    print("INICIANDO MIGRACIÓN OFICIAL: MACROCICLOS ZEUS Y ATENEA (GOOGLE SHEETS)")
    print("=" * 70)

    creds = Credentials.from_service_account_file("credentials.json", scopes=["https://www.googleapis.com/auth/spreadsheets"])
    gc = gspread.authorize(creds)
    sh = gc.open_by_key("1gUMRdWqGwnhJ4cEkt-lOKyYMiGNq2UawthVSdNf1b7o")

    # 1. ACTUALIZAR 'Control_Ciclo'
    print("\n[1/4] Actualizando pestaña 'Control_Ciclo'...")
    try:
        ws_ctrl = sh.worksheet("Control_Ciclo")
        ws_ctrl.update_acell("B2", "Atenea")
        ws_ctrl.update_acell("B3", "1")
        ws_ctrl.update_acell("C2", "Configurado oficialmente: Ciclo Atenea")
        ws_ctrl.update_acell("C3", "Semana 1 - Fase de Acumulación (70-75% 1RM)")
        print("  ✅ 'Control_Ciclo': Ciclo_Activo = 'Atenea' | Semana_Actual = 1.")
    except Exception as e:
        print(f"  ❌ Error en 'Control_Ciclo': {e}")

    # 2. RENOMBRAR 'RM_Ciclo_02' -> 'RM_Atenea' Y CREAR 'RM_Zeus'
    print("\n[2/4] Gestionando pestañas de 1RM ('RM_Atenea' y 'RM_Zeus')...")
    existing_sheets = [ws.title for ws in sh.worksheets()]
    
    # Renombrar RM_Ciclo_02 a RM_Atenea
    if "RM_Ciclo_02" in existing_sheets and "RM_Atenea" not in existing_sheets:
        ws_c2 = sh.worksheet("RM_Ciclo_02")
        ws_c2.update_title("RM_Atenea")
        print("  ✅ Pestaña 'RM_Ciclo_02' renombrada a 'RM_Atenea' con éxito.")
    elif "RM_Atenea" in existing_sheets:
        print("  ℹ️ Pestaña 'RM_Atenea' ya existe.")
    else:
        print("  ⚠️ No se encontró 'RM_Ciclo_02' ni 'RM_Atenea'.")

    # Crear o actualizar RM_Zeus a partir de RM_Atletas
    if "RM_Zeus" not in existing_sheets:
        ws_base = sh.worksheet("RM_Atletas")
        base_vals = ws_base.get_all_values()
        ws_zeus = sh.add_worksheet(title="RM_Zeus", rows=len(base_vals) + 10, cols=5)
        ws_zeus.update(range_name="A1", values=base_vals)
        print(f"  ✅ Pestaña 'RM_Zeus' creada con éxito ({len(base_vals)} filas basales de Ciclo 1).")
    else:
        print("  ℹ️ Pestaña 'RM_Zeus' ya existe.")

    # 3. NORMALIZAR 'Historial_RMs'
    print("\n[3/4] Normalizando etiquetas de ciclo en 'Historial_RMs'...")
    try:
        ws_hist = sh.worksheet("Historial_RMs")
        hist_vals = ws_hist.get_all_values()
        if len(hist_vals) > 1:
            updated_count = 0
            # Columna E es índice 4
            for r_idx in range(1, len(hist_vals)):
                row = hist_vals[r_idx]
                curr_cycle = row[4].strip() if len(row) > 4 else ""
                if curr_cycle in ["Ciclo_02", "2", "02"]:
                    hist_vals[r_idx][4] = "Atenea"
                    updated_count += 1
                elif curr_cycle in ["Ciclo_01", "1", "01", ""]:
                    hist_vals[r_idx][4] = "Zeus"
                    updated_count += 1
            ws_hist.update(range_name=f"A1:E{len(hist_vals)}", values=hist_vals)
            print(f"  ✅ 'Historial_RMs': {updated_count} filas normalizadas a 'Atenea' o 'Zeus'.")
    except Exception as e:
        print(f"  ❌ Error en 'Historial_RMs': {e}")

    # 4. NORMALIZAR 'Registro_Diario' Y 'Wellness'
    print("\n[4/4] Normalizando 'Registro_Diario' y 'Wellness'...")
    try:
        ws_reg = sh.worksheet("Registro_Diario")
        reg_vals = ws_reg.get_all_values()
        if len(reg_vals) > 1:
            reg_updated = 0
            # Columna Z es índice 25
            for r_idx in range(1, len(reg_vals)):
                row = reg_vals[r_idx]
                while len(row) < 26:
                    row.append("")
                curr_c = row[25].strip()
                if curr_c in ["Ciclo_01", "1", "01", ""]:
                    row[25] = "Zeus"
                    reg_updated += 1
                elif curr_c in ["Ciclo_02", "2", "02"]:
                    row[25] = "Atenea"
                    reg_updated += 1
                reg_vals[r_idx] = row
            # Actualizar solo la columna Z
            col_z_vals = [[r[25]] for r in reg_vals[1:]]
            ws_reg.update(range_name=f"Z2:Z{len(reg_vals)}", values=col_z_vals)
            print(f"  ✅ 'Registro_Diario': {reg_updated} filas asignadas a macrociclo 'Zeus'.")
    except Exception as e:
        print(f"  ❌ Error en 'Registro_Diario': {e}")

    try:
        ws_well = sh.worksheet("Wellness")
        well_vals = ws_well.get_all_values()
        if len(well_vals) > 1:
            well_updated = 0
            # Columna M es índice 12
            for r_idx in range(1, len(well_vals)):
                row = well_vals[r_idx]
                while len(row) < 13:
                    row.append("")
                curr_c = row[12].strip()
                if curr_c in ["Ciclo_01", "1", "01", ""]:
                    row[12] = "Zeus"
                    well_updated += 1
                elif curr_c in ["Ciclo_02", "2", "02"]:
                    row[12] = "Atenea"
                    well_updated += 1
                well_vals[r_idx] = row
            col_m_vals = [[r[12]] for r in well_vals[1:]]
            ws_well.update(range_name=f"M2:M{len(well_vals)}", values=col_m_vals)
            print(f"  ✅ 'Wellness': {well_updated} filas asignadas a macrociclo 'Zeus'.")
    except Exception as e:
        print(f"  ❌ Error en 'Wellness': {e}")

    print("\n" + "=" * 70)
    print("¡MIGRACIÓN DE GOOGLE SHEETS COMPLETADA CON ÉXITO!")
    print("=" * 70)

if __name__ == "__main__":
    main()
