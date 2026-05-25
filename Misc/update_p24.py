import sys, docx
sys.stdout.reconfigure(encoding='utf-8')

SRC  = r'C:\Users\Chanasorn\OneDrive\Desktop\Claude_Home\Earthquake\fixed_final_tmp.docx'
DEST = r'C:\Users\Chanasorn\OneDrive\Desktop\Claude_Home\Earthquake\fixed_final_updated.docx'
doc = docx.Document(SRC)

# ── New top-10 data (score = TP − FA×0.5 − delay×0.1) ────────────────────────
top10 = [
    ('0.5','6.0','3', '50', '99.8%','11.6','3/250 (1%)','0.995','435.34'),
    ('0.5','6.0','3', '200','99.8%','11.3','4/250 (2%)','0.994','434.87'),
    ('0.5','6.0','3', '100','99.8%','11.3','4/250 (2%)','0.994','434.87'),
    ('0.6','5.5','7', '200','99.8%','14.9','4/250 (2%)','0.994','434.51'),
    ('0.6','5.5','7', '100','99.8%','15.0','4/250 (2%)','0.994','434.50'),
    ('0.6','5.5','7', '50', '99.8%','15.4','4/250 (2%)','0.994','434.46'),
    ('0.6','5.5','8', '200','99.8%','15.8','4/250 (2%)','0.994','434.42'),
    ('0.6','5.5','8', '100','99.8%','15.9','4/250 (2%)','0.994','434.41'),
    ('0.3','6.0','5', '50', '100%', '11.2','7/250 (3%)','0.992','434.38'),
    ('0.6','5.5','8', '50', '99.8%','16.3','4/250 (2%)','0.994','434.37'),
]

# ── Update Table 1 (grid search top-10, index 1) ─────────────────────────────
tbl = doc.tables[1]
for ri, row_data in enumerate(top10):
    row = tbl.rows[ri + 1]  # skip header row
    for ci, val in enumerate(row_data):
        cell = row.cells[ci]
        for para in cell.paragraphs:
            for run in para.runs:
                run.text = ''
        if cell.paragraphs:
            cell.paragraphs[0].runs[0].text = val if cell.paragraphs[0].runs else None
            if not cell.paragraphs[0].runs:
                cell.paragraphs[0].add_run(val)
        print(f'  [T1 r{ri+1} c{ci}] → {val}')

# ── Helper: replace text in paragraph preserving formatting ──────────────────
def replace_in_para(para, old, new):
    full = ''.join(r.text for r in para.runs)
    if old not in full:
        return False
    para.runs[0].text = full.replace(old, new)
    for r in para.runs[1:]:
        r.text = ''
    return True

# ── Para 433: correct TPR count ───────────────────────────────────────────────
p433 = doc.paragraphs[433]
ok = replace_in_para(p433,
    'TPR = 100% (439/439 ตัวอย่าง)',
    'TPR = 99.8% (438/439 ตัวอย่าง)')
print(f'  [433 TPR] {"OK" if ok else "NOT FOUND"}')

# ── Para 452: correct detection count ────────────────────────────────────────
p452 = doc.paragraphs[452]
ok = replace_in_para(p452,
    'ตรวจจับสัญญาณ P-wave ได้ครบถ้วน 100% (439/439 ตัวอย่าง)',
    'ตรวจจับสัญญาณ P-wave ได้ 99.8% (438/439 ตัวอย่าง)')
print(f'  [452 TPR] {"OK" if ok else "NOT FOUND"}')

doc.save(DEST)
print(f'\nSaved → {DEST}')
