import sys, docx, re, copy
sys.stdout.reconfigure(encoding='utf-8')

PATH = r'C:\Users\Chanasorn\OneDrive\Desktop\Claude_Home\Earthquake\fixed_final.docx'
doc = docx.Document(PATH)

def replace_in_para(para, old, new):
    """Replace text across runs while preserving run formatting."""
    full = ''.join(r.text for r in para.runs)
    if old not in full:
        return False
    new_full = full.replace(old, new)
    # Distribute new text back to runs proportionally (first run gets all,
    # subsequent runs get empty) — safe for body paragraphs where one run carries text.
    # Better: rebuild first run with full text, clear the rest.
    if para.runs:
        para.runs[0].text = new_full
        for r in para.runs[1:]:
            r.text = ''
    return True

changes = [
    # (paragraph index, old text, new text)
    (438,
     'วิธี Pd สามารถประมาณขนาดได้ถูกต้องได้ถึง 97% ซึ่งหมายความว่าเหตุการณ์ที่ควรส่งการแจ้งเตือนระดับสูงสุดนั้น ระบบสามารถตรวจจับและแจ้งเตือน ได้อย่างถูกต้องเกือบทั้งหมด',
     'วิธี Pd สามารถประมาณขนาดได้ถูกต้องสำหรับกลุ่ม T1 (Mw 4.5–5.0) และ T2 (Mw 5.0–6.5) ที่ 96% และกลุ่ม crit (Mw 6.5+) ที่ 100% ซึ่งหมายความว่าเหตุการณ์ที่ควรส่งการแจ้งเตือนระดับสูงสุดนั้น ระบบสามารถตรวจจับและแจ้งเตือนได้อย่างถูกต้องสมบูรณ์แบบสำหรับเหตุการณ์วิกฤต'),
    (439,
     '79% ของตัวอย่างในกลุ่มนี้ ถูกประมาณค่าเป็น Mw ≥ 5.0',
     '67% ของตัวอย่างในกลุ่มนี้ ถูกประมาณค่าเป็น Mw ≥ 4.5'),
    (453,
     'ระบบสามารถประมาณขนาดในระดับที่ถูกต้องได้ 97% อย่างไรก็ตาม พบข้อจำกัดสำคัญในกลุ่ม Mw 3.0–4.5 ซึ่ง 79% ถูกประมาณค่าสูงเกินจริงเป็น Mw ≥ 5.0',
     'ระบบสามารถประมาณขนาดในระดับที่ถูกต้องได้ 96% สำหรับกลุ่ม T1 และ T2 และ 100% สำหรับกลุ่ม crit อย่างไรก็ตาม พบข้อจำกัดสำคัญในกลุ่ม Mw 3.0–4.5 ซึ่ง 67% ถูกประมาณค่าสูงเกินจริงเป็น Mw ≥ 4.5'),
    (461,
     'แผ่นดินไหวขนาดเล็ก (Mw 3.0–4.5) ถูกประมาณค่าสูงเกินจริงถึง 79%',
     'แผ่นดินไหวขนาดเล็ก (Mw 3.0–4.5) ถูกประมาณค่าสูงเกินจริงถึง 67%'),
]

for idx, old, new in changes:
    para = doc.paragraphs[idx]
    ok = replace_in_para(para, old, new)
    status = 'OK' if ok else 'NOT FOUND'
    snippet = old[:60].replace('\n', ' ')
    print(f'  [{idx}] {status}: {snippet}...')

doc.save(PATH)
print('\nSaved.')
