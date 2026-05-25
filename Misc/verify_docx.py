import sys, docx
sys.stdout.reconfigure(encoding='utf-8')
doc = docx.Document(r'C:\Users\Chanasorn\OneDrive\Desktop\Claude_Home\Earthquake\fixed_final.docx')
for i in [438, 439, 453, 461]:
    print(f'=== {i} ===')
    print(doc.paragraphs[i].text)
    print()
