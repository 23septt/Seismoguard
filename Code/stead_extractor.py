"""
SeismoGuard — STEAD Data Extractor  (Kaggle Notebook)
======================================================
Output: seismoguard_data.json  ที่ใช้กับ adaptive_threshold.js / roc_analysis.js

Dataset:
  Stanford EArthquake Dataset (STEAD)
  https://www.kaggle.com/datasets/isevilla/stanford-earthquake-dataset-stead
  → Notebook → Add Data → ค้นหา "stanford earthquake dataset stead" (isevilla)

Sampling strategy — Stratified by Mw (aligned to 2-tier alert):
  500 P-wave แบ่งตาม alert tier + 250 Noise
    sub  Mw 3.0–4.5  × 100   (ต่ำกว่า threshold → ห้ามแจ้งเตือน)
    T1   Mw 4.5–5.0  × 100   (Tier-1: buzzer only)
    T2   Mw 5.0–6.5  × 200   (Tier-2: buzzer + LINE Notify)
    crit Mw 6.5+     × 100   (critical)
  ถ้า bin ไหนไม่พอ target → เก็บทั้งหมดที่มี แล้วแจ้งเตือน

Output JSON format:
  {
    "pwave":  [ {"trace_name": "...", "p_arrival_sample": N,
                 "magnitude": 4.2,   "data": [f, f, ...]}, ... ]
              data ยาว 300 samples = 50 (pre-onset) + 250 (detection window) @ 50 Hz
    "noises": [ [f, f, ...], ... ]
              แต่ละ array ยาว 2000 samples = 1750 (warmup) + 250 @ 50 Hz
  }
"""

import h5py
import pandas as pd
import numpy as np
import json
import os

# ── Auto-detect STEAD path ────────────────────────────────────────────────────
def _find_stead(base='/kaggle/input', max_depth=5):
    for root, dirs, files in os.walk(base):
        level = root.replace(base, '').count(os.sep)
        if level >= max_depth:
            dirs.clear()
        if 'merge.csv' in files and 'merge.hdf5' in files:
            return root
    return None

print("กำลังหา STEAD dataset ใน /kaggle/input/ ...")
_stead_dir = _find_stead()

if _stead_dir:
    print(f"  ✓ พบที่: {_stead_dir}")
    CSV_PATH  = os.path.join(_stead_dir, 'merge.csv')
    HDF5_PATH = os.path.join(_stead_dir, 'merge.hdf5')
else:
    print("  ✗ ไม่พบ merge.csv + merge.hdf5")
    print("  โครงสร้างไฟล์ที่มีอยู่:")
    for root, dirs, files in os.walk('/kaggle/input'):
        level = root.replace('/kaggle/input', '').count(os.sep)
        indent = '  ' * (level + 1)
        print(f"{indent}📁 {os.path.basename(root)}/")
        for f in files:
            size = os.path.getsize(os.path.join(root, f))
            print(f"{'  '*(level+2)}{f}  ({size/1e6:.0f} MB)")
    raise FileNotFoundError("ไม่พบ merge.csv + merge.hdf5 — ดู output ด้านบน")

OUTPUT_PATH = '/kaggle/working/seismoguard_data.json'

# ── SeismoGuard constants ─────────────────────────────────────────────────────
SAMPLE_RATE  = 50
STEAD_RATE   = 100
DS           = STEAD_RATE // SAMPLE_RATE   # 2  (downsample 100→50 Hz)

ONSET        = 50    # pre-onset quiet samples @ 50 Hz
WINDOW       = 250   # detection window @ 50 Hz
NOISE_WARMUP = 1750  # noise warmup @ 50 Hz

# ── Stratified sampling config — aligned to 2-tier alert thresholds ──────────
# MW_ALERT_LOCAL = 4.5  (Tier-1: buzzer)
# MW_ALERT_LINE  = 5.0  (Tier-2: LINE Notify)
MW_BINS = [
    # (label,          mw_min, mw_max, target)
    ('sub  Mw 3–4.5',  3.0,    4.5,   100),   # ต่ำกว่า threshold → ห้ามแจ้งเตือน
    ('T1   Mw 4.5–5',  4.5,    5.0,   100),   # Tier-1 only (buzzer)
    ('T2   Mw 5–6.5',  5.0,    6.5,   200),   # Tier-2 (buzzer + LINE)
    ('crit Mw 6.5+',   6.5,   99.,    100),   # critical
]
# P-wave รวม = 100+100+200+100 = 500
N_NOISE = 250
SEED    = 42

# ── อ่านสารบัญ ────────────────────────────────────────────────────────────────
print("\nกำลังโหลด catalogue...")
df = pd.read_csv(CSV_PATH, low_memory=False)

# ตรวจหาชื่อ column magnitude (STEAD ใช้ source_magnitude)
mag_col = next((c for c in df.columns if 'magnitude' in c.lower()
                and 'type' not in c.lower()), None)
if mag_col is None:
    raise ValueError(f"ไม่พบ column magnitude ใน CSV\nColumns ที่มี: {list(df.columns)}")
print(f"  Magnitude column: '{mag_col}'")

df_eq = df[
    (df['trace_category'] == 'earthquake_local') &
    df['p_arrival_sample'].notna() &
    df[mag_col].notna() &
    (df['p_arrival_sample'] > ONSET * DS + 10)
].copy()
df_eq[mag_col] = pd.to_numeric(df_eq[mag_col], errors='coerce')
df_eq = df_eq.dropna(subset=[mag_col])

df_ns = df[df['trace_category'] == 'noise'].copy()

print(f"  Earthquake ที่ใช้ได้: {len(df_eq):,} records")
print(f"  Noise ที่ใช้ได้:      {len(df_ns):,} records")

# แสดง distribution ของ Mw
print("\n  Mw distribution ใน dataset:")
for label, lo, hi, tgt in MW_BINS:
    n = len(df_eq[(df_eq[mag_col] >= lo) & (df_eq[mag_col] < hi)])
    print(f"    {label}: {n:,} records  (target={tgt})")

# ── Helper: extract waveform ──────────────────────────────────────────────────
def extract_pwave(hf, row):
    """คืน dict waveform หรือ None ถ้าข้อมูลไม่พอ"""
    dset = hf.get(f"data/{row['trace_name']}")
    if dset is None:
        return None
    arr   = np.array(dset)
    z_raw = arr[:, 2]           # Z-axis only (ตรงกับ MPU6050 firmware)
    z     = z_raw[::DS]         # downsample 100→50 Hz

    p50   = int(row['p_arrival_sample']) // DS
    start = p50 - ONSET
    end   = p50 + WINDOW
    if start < 0 or end > len(z):
        return None

    seg  = z[start:end].copy()
    seg -= np.mean(seg[:ONSET])  # baseline correction

    return {
        'trace_name':       row['trace_name'],
        'p_arrival_sample': p50,
        'magnitude':        round(float(row[mag_col]), 2),
        'data': [round(float(v), 6) for v in seg]
    }

# ── Extract P-wave (stratified by Mw) ────────────────────────────────────────
pwave_out = []
print("\nกำลัง extract P-wave (stratified by Mw)...")

with h5py.File(HDF5_PATH, 'r') as hf:

    for label, lo, hi, target in MW_BINS:
        bin_df = df_eq[(df_eq[mag_col] >= lo) & (df_eq[mag_col] < hi)]
        pool   = bin_df.sample(min(target * 6, len(bin_df)), random_state=SEED)
        collected = []

        for _, row in pool.iterrows():
            if len(collected) >= target:
                break
            w = extract_pwave(hf, row)
            if w is not None:
                collected.append(w)

        pwave_out.extend(collected)
        status = '✓' if len(collected) >= target else f'⚠ ได้แค่ {len(collected)}'
        print(f"  {label}: {len(collected)}/{target}  {status}")

    # ── Extract Noise ─────────────────────────────────────────────────────────
    total_noise_len = NOISE_WARMUP + WINDOW   # 2000 samples
    noise_out = []
    print(f"\nกำลัง extract Noise (target={N_NOISE})...")
    pool_n = df_ns.sample(min(N_NOISE * 4, len(df_ns)), random_state=SEED)

    for _, row in pool_n.iterrows():
        if len(noise_out) >= N_NOISE:
            break
        dset = hf.get(f"data/{row['trace_name']}")
        if dset is None:
            continue
        arr   = np.array(dset)
        z_raw = arr[:, 2]
        z     = z_raw[::DS]
        if len(z) < total_noise_len + 200:
            continue
        seg  = z[100 : 100 + total_noise_len].copy()
        seg -= np.mean(seg[:100])
        noise_out.append([round(float(v), 6) for v in seg])

    print(f"  Noise: {len(noise_out)}/{N_NOISE}  {'✓' if len(noise_out)>=N_NOISE else '⚠'}")

# ── บันทึก JSON ───────────────────────────────────────────────────────────────
out = {'pwave': pwave_out, 'noises': noise_out}
with open(OUTPUT_PATH, 'w') as fp:
    json.dump(out, fp, separators=(',', ':'))

# ── สรุปผล ────────────────────────────────────────────────────────────────────
p_len = len(pwave_out[0]['data']) if pwave_out else 0
n_len = len(noise_out[0])         if noise_out else 0

print(f"\n{'='*58}")
print(f"✓  บันทึกแล้ว: {OUTPUT_PATH}")
print(f"{'='*58}")
print(f"  P-wave รวม: {len(pwave_out)} waveforms × {p_len} samples")
for label, lo, hi, tgt in MW_BINS:
    n = sum(1 for w in pwave_out if lo <= w['magnitude'] < hi)
    print(f"    {label}: {n} samples")
print(f"  Noise:      {len(noise_out)} waveforms × {n_len} samples")
print(f"\nDownload: /kaggle/working/seismoguard_data.json")
print(f"วาง file นี้ที่: .../Earthquake/seismoguard_data.json")