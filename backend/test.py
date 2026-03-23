import json
import os
import sys

# Add working directory to path if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from pdf_processor import process_pdf_file

def main():
    import json
    from pdf_processor import process_pdf_file
    results = process_pdf_file("uploads/Engenharia.pdf")
    for i, r in enumerate(results[:3]):
        print(f"--- PAGE {i+1} ---")
        print(json.dumps(r, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
