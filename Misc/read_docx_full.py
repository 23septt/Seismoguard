import sys, docx
sys.stdout.reconfigure(encoding='utf-8')
doc = docx.Document(r'C:\Users\Chanasorn\OneDrive\Desktop\Claude_Home\Earthquake\fixed_final.docx')
# Print full text for paragraphs 435-470
for i in range(435, min(470, len(doc.paragraphs))):
    p = doc.paragraphs[i]
    print(f'=== {i} ===')
    print(p.text)
    print()
