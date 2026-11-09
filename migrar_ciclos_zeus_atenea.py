#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Migración Oficial de Macrociclos en Google Sheets (Corrección Metodológica 1RM):
1. 'RM_Atletas' (86 filas) se preserva intacta como Marcas Basales Pre-Zeus.
   Se crea respaldo fiel 'RM_Basal'.
2. Las 33 marcas del cierre de Zeus (antiguo 'RM_Ciclo_02' / actual 'RM_Atenea') 
   se asignan oficialmente a 'RM_Zeus'.
3. 'RM_Atenea' se clona de 'RM_Zeus' como Base de Trabajo (100% de referencia) para la Semana 1.
4. En 'Historial_RMs', las filas históricas de cierre de ciclo se normalizan a 'Zeus'.
5. En 'Control_Ciclo': Ciclo_Activo = 'Atenea' y Semana_Actual = 1.
6. En 'Registro_Diario' y 'Wellness', los registros pasados se asignan al ciclo 'Zeus'.
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
    print("=" * 75)
    print("INICIANDO MIGRACIÓN OFICIAL: MACROCICLOS ZEUS Y ATENEA (CORRECCIÓN 1RM)")
    print("=" * 75)

    creds = Credentials.from_service_account_file("credentials.json", scopes=["https://www.googleapis.com/auth/spreadsheets"])
    gc = gspread.authorize(creds)
    sh = gc.open_by_key("1gUMRdWqGwnhJ4cEkt-lOKyYMiGNq2UawthVSdNf1b7o")
    existing_sheets = {ws.title: ws for ws in sh.worksheets()}

    # 1. ACTUALIZAR 'Control_Ciclo'
    print("\n[1/5] Actualizando pestaña 'Control_Ciclo'...")
    try:
        if "Control_Ciclo" in existing_sheets:
            ws_ctrl = existing_sheets["Control_Ciclo"]
            ws_ctrl.update_acell("B2", "Atenea")
            ws_ctrl.update_acell("B3", "1")
            ws_ctrl.update_acell("C2", "Configurado oficialmente: Ciclo Atenea")
            ws_ctrl.update_acell("C3", "Semana 1 - Fase de Acumulación (70-75% 1RM)")
            print("  ✅ 'Control_Ciclo': Ciclo_Activo = 'Atenea' | Semana_Actual = 1.")
        else:
            print("  ⚠️ No se encontró la pestaña 'Control_Ciclo'.")
    except Exception as e:
        print(f"  ❌ Error en 'Control_Ciclo': {e}")

    # 2. GESTIONAR PESTAÑAS DE 1RM
    print("\n[2/5] Gestionando pestañas de 1RM con corrección metodológica...")
    
    # A) Respaldar RM_Atletas en RM_Basal
    ws_atletas = existing_sheets.get("RM_Atletas")
    if ws_atletas:
        atletas_vals = ws_atletas.get_all_values()
        print(f"  ℹ️ 'RM_Atletas' conservada intacta con {len(atletas_vals)} marcas basales.")
        if "RM_Basal" not in existing_sheets:
            ws_basal = sh.add_worksheet(title="RM_Basal", rows=len(atletas_vals) + 10, cols=5)
            ws_basal.update(range_name="A1", values=atletas_vals)
            print(f"  ✅ Copia de respaldo 'RM_Basal' creada ({len(atletas_vals)} filas).")
        else:
            print("  ℹ️ 'RM_Basal' ya existe.")
    else:
        print("  ⚠️ Advertencia: No se encontró 'RM_Atletas'.")

    # B) Obtener las 33 filas oficiales logradas en el cierre de Zeus
    # Pueden estar en 'RM_Ciclo_02' o transitoriamente en 'RM_Atenea' (33 filas)
    zeus_closing_vals = None
    if "RM_Ciclo_02" in existing_sheets:
        zeus_closing_vals = existing_sheets["RM_Ciclo_02"].get_all_values()
        print(f"  ℹ️ Encontradas {len(zeus_closing_vals)} filas de cierre Zeus en 'RM_Ciclo_02'.")
    elif "RM_Atenea" in existing_sheets:
        candidate_vals = existing_sheets["RM_Atenea"].get_all_values()
        if len(candidate_vals) == 33 or (len(candidate_vals) > 0 and len(candidate_vals) != len(atletas_vals)):
            zeus_closing_vals = candidate_vals
            print(f"  ℹ️ Tomando las {len(zeus_closing_vals)} filas de cierre Zeus desde 'RM_Atenea'.")

    if not zeus_closing_vals:
        # Si por alguna razón RM_Zeus ya tiene filas distintas a RM_Atletas
        if "RM_Zeus" in existing_sheets:
            zeus_closing_vals = existing_sheets["RM_Zeus"].get_all_values()
            print(f"  ℹ️ Usando valores existentes en 'RM_Zeus' ({len(zeus_closing_vals)} filas).")

    if not zeus_closing_vals:
        print("  ❌ Error crítico: No se encontraron los datos de cierre de Zeus.")
        return

    # C) Actualizar 'RM_Zeus' con las marcas oficiales de cierre de Zeus
    if "RM_Zeus" in existing_sheets:
        ws_zeus = existing_sheets["RM_Zeus"]
        ws_zeus.clear()
        ws_zeus.update(range_name="A1", values=zeus_closing_vals)
        print(f"  ✅ 'RM_Zeus' actualizada con las {len(zeus_closing_vals)} marcas oficiales del cierre de Zeus.")
    else:
        ws_zeus = sh.add_worksheet(title="RM_Zeus", rows=len(zeus_closing_vals) + 10, cols=5)
        ws_zeus.update(range_name="A1", values=zeus_closing_vals)
        print(f"  ✅ 'RM_Zeus' creada con las {len(zeus_closing_vals)} marcas oficiales del cierre de Zeus.")

    # D) Crear / Actualizar 'RM_Atenea' clonando inicialmente 'RM_Zeus'
    # Así arranca con la base vigente (100% de referencia) para la Semana 1
    if "RM_Atenea" in existing_sheets:
        ws_atenea = existing_sheets["RM_Atenea"]
        ws_atenea.clear()
        ws_atenea.update(range_name="A1", values=zeus_closing_vals)
        print(f"  ✅ 'RM_Atenea' configurada como clon inicial de 'RM_Zeus' ({len(zeus_closing_vals)} filas).")
    else:
        ws_atenea = sh.add_worksheet(title="RM_Atenea", rows=len(zeus_closing_vals) + 10, cols=5)
        ws_atenea.update(range_name="A1", values=zeus_closing_vals)
        print(f"  ✅ 'RM_Atenea' creada clonando 'RM_Zeus' ({len(zeus_closing_vals)} filas).")

    # Si aún quedaba RM_Ciclo_02, podemos eliminarla o dejarla de respaldo
    if "RM_Ciclo_02" in existing_sheets and "RM_Zeus" in [ws.title for ws in sh.worksheets()]:
        try:
            sh.del_worksheet(existing_sheets["RM_Ciclo_02"])
            print("  ✅ Pestaña obsoleta 'RM_Ciclo_02' eliminada (consolidada en 'RM_Zeus').")
        except Exception:
            pass

    # 3. NORMALIZAR 'Historial_RMs' -> Todas las filas históricas de cierre van a 'Zeus'
    print("\n[3/5] Normalizando etiquetas de ciclo en 'Historial_RMs'...")
    try:
        ws_hist = sh.worksheet("Historial_RMs")
        hist_vals = ws_hist.get_all_values()
        if len(hist_vals) > 1:
            updated_count = 0
            for r_idx in range(1, len(hist_vals)):
                # Columna E es índice 4 (Ciclo)
                curr_cycle = hist_vals[r_idx][4].strip() if len(hist_vals[r_idx]) > 4 else ""
                # Todas las marcas logradas en el cierre de ciclo 2 / pre-Atenea pertenecen a Zeus
                if curr_cycle in ["Ciclo_02", "Ciclo_01", "2", "1", "02", "01", "Atenea", ""]:
                    hist_vals[r_idx][4] = "Zeus"
                    updated_count += 1
            ws_hist.update(range_name=f"A1:E{len(hist_vals)}", values=hist_vals)
            print(f"  ✅ 'Historial_RMs': {updated_count} filas normalizadas a ciclo 'Zeus'.")
    except Exception as e:
        print(f"  ❌ Error en 'Historial_RMs': {e}")

    # 4. NORMALIZAR 'Registro_Diario' -> macociclo 'Zeus'
    print("\n[4/5] Normalizando macrociclos en 'Registro_Diario'...")
    try:
        ws_reg = sh.worksheet("Registro_Diario")
        reg_vals = ws_reg.get_all_values()
        if len(reg_vals) > 1:
            reg_updated = 0
            for r_idx in range(1, len(reg_vals)):
                row = reg_vals[r_idx]
                while len(row) < 26:
                    row.append("")
                curr_c = row[25].strip()
                if curr_c in ["Ciclo_01", "1", "01", "", "Ciclo_02", "2", "02"]:
                    row[25] = "Zeus"
                    reg_updated += 1
                reg_vals[r_idx] = row
            col_z_vals = [[r[25]] for r in reg_vals[1:]]
            ws_reg.update(range_name=f"Z2:Z{len(reg_vals)}", values=col_z_vals)
            print(f"  ✅ 'Registro_Diario': {reg_updated} filas asignadas a macrociclo 'Zeus'.")
    except Exception as e:
        print(f"  ❌ Error en 'Registro_Diario': {e}")

    # 5. NORMALIZAR 'Wellness' -> macrociclo 'Zeus'
    print("\n[5/5] Normalizando macrociclos en 'Wellness'...")
    try:
        ws_well = sh.worksheet("Wellness")
        well_vals = ws_well.get_all_values()
        if len(well_vals) > 1:
            well_updated = 0
            for r_idx in range(1, len(well_vals)):
                row = well_vals[r_idx]
                while len(row) < 13:
                    row.append("")
                curr_c = row[12].strip()
                if curr_c in ["Ciclo_01", "1", "01", "", "Ciclo_02", "2", "02"]:
                    row[12] = "Zeus"
                    well_updated += 1
                well_vals[r_idx] = row
            col_m_vals = [[r[12]] for r in well_vals[1:]]
            ws_well.update(range_name=f"M2:M{len(well_vals)}", values=col_m_vals)
            print(f"  ✅ 'Wellness': {well_updated} filas asignadas a macrociclo 'Zeus'.")
    except Exception as e:
        print(f"  ❌ Error en 'Wellness': {e}")

    print("\n" + "=" * 75)
    print("¡MIGRACIÓN Y CORRECCIÓN METODOLÓGICA COMPLETADA CON ÉXITO TOTAL!")
    print("=" * 75)

if __name__ == "__main__":
    main()
