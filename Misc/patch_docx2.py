import sys, docx
sys.stdout.reconfigure(encoding='utf-8')

PATH = r'C:\Users\Chanasorn\OneDrive\Desktop\Claude_Home\Earthquake\fixed_final.docx'
doc = docx.Document(PATH)

para = doc.paragraphs[438]
old = ('จากตาราง 4.6 พบว่าสำหรับแผ่นดินไหวกลุ่ม T1 (Mw 4.5–5.0), T2 (Mw 5.0–6.5) และ crit (Mw 6.5+) '
       'วิธี Pd สามารถประมาณขนาดได้ถูกต้องสำหรับกลุ่ม T1 (Mw 4.5–5.0) และ T2 (Mw 5.0–6.5) ที่ 96% '
       'และกลุ่ม crit (Mw 6.5+) ที่ 100% ซึ่งหมายความว่าเหตุการณ์ที่ควรส่งการแจ้งเตือนระดับสูงสุดนั้น '
       'ระบบสามารถตรวจจับและแจ้งเตือนได้อย่างถูกต้องสมบูรณ์แบบสำหรับเหตุการณ์วิกฤต')
new = ('จากตาราง 4.6 พบว่าสำหรับแผ่นดินไหวกลุ่ม T1 (Mw 4.5–5.0) และ T2 (Mw 5.0–6.5) '
       'วิธี Pd สามารถประมาณขนาดได้ถูกต้องที่ 96% และสำหรับกลุ่ม crit (Mw 6.5+) ได้ถึง 100% '
       'ซึ่งหมายความว่าเหตุการณ์ที่ควรส่งการแจ้งเตือนระดับสูงสุดนั้น '
       'ระบบสามารถตรวจจับและแจ้งเตือนได้อย่างถูกต้องครบถ้วนสมบูรณ์')

full = ''.join(r.text for r in para.runs)
print('CURRENT:', full[:120])
if old in full:
    para.runs[0].text = full.replace(old, new)
    for r in para.runs[1:]:
        r.text = ''
    print('PATCHED OK')
else:
    print('NOT FOUND — check encoding')

doc.save(PATH)
