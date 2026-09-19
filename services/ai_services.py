import pymupdf
from typing import cast
from config.settings import settings
from openai import (AsyncOpenAI)
from config.prompts import (notes_prompt)
from fpdf import (FPDF)
import io
from fastapi.responses import (StreamingResponse, Response)
from fastapi import HTTPException
from fpdf.enums import WrapMode
import asyncio
import os
from openai import OpenAIError

"""
extracting text from pdf using bytes from fastapi UploadFile class .read()
"""
def extract_text(data:bytes):
    text = ""

    doc = pymupdf.open(stream=data, filetype="pdf")
    for page in doc:
        page_text:str = cast(str, page.get_text("text"))
        text += page_text

    print("text extracted from pdf")
    return text

"""
chunking large text files to preserve context and save money

text[start:end] -> slicing using index
"""
def chunking_text(text, chunk_size=6000, overlap=400):
    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap

    print(f"{len(chunks)} number of chunks created.")
    return chunks

"""
interact with gemini to create notes

using generate_content and gemini flash 3.8 model

using prompt and text we extracted from extract_text() function
"""
async def interact_wtih_gemini(text:str, client:AsyncOpenAI):
    attempts = 0
    sleep = 2

    """
    attempts to create notes and has a backoff retry mechanism that tries again and again 2->4->6
    using a aysnc client so users dont block each other's requests
    """
    while attempts<4:
        try:
            response = await client.chat.completions.create(
                model="gemini-3.8-flash",
                messages= [
                    {"role":"system", "content":notes_prompt},
                    {"role":"user", "content":text}
                ]
            )
            print("created chunk note")
        except OpenAIError as e:
            print(f"Gemini server error: {e}")
            await asyncio.sleep(sleep)
            sleep+=2
            attempts+=1
            continue

        
        return response.choices[0].message.content

    return {"message":f"failed after max attempts"}



"""
using chuncks to create notes, from chunking_text()
"""
async def generate_notes_using_chuncks(data:list):

    client = AsyncOpenAI(api_key=settings.GEMINI_API_KEY,
                    base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
    
    all_notes = []
    number_of_chunks = 1
    for chunk in data:
        notes = await interact_wtih_gemini(chunk, client)

        if isinstance(notes, dict) or notes is None:
            raise HTTPException(status_code=502, detail="failed to create notes.")
        else:
            print(f"{number_of_chunks} proccessed.")

        all_notes.append(notes)

    return "\n".join(all_notes)


"""
take the notes to pdf
pdf.output -> retuns byte arrays
multi_cell -> writes multiple lines
new_x and new_y where to start horizontally and vertically
"""
def create_notes_pdf(data:str):
    #builds an absolute file path
    FONT_Path = os.path.join(os.path.dirname(__file__), "DejaVuSans.ttf")
    pdf = FPDF()
    pdf.add_page()
    pdf.add_font("DejaVuSans", "", FONT_Path)
    pdf.set_font("DejaVuSans", size=12)

    try:
        for line in data.split("\n"):
            pdf.multi_cell(0, 10, line, new_x="LMARGIN", new_y="NEXT")
            print("printed one line")

        result = pdf.output()
        print(type(result))
        return result
    except Exception as e:
        print(f"{e}")
        raise HTTPException(status_code=400, detail=f"failed:{e}")

"""
creating a response for user

using io.BytesIO to create a file like obj for streaming response to use
"""
def create_output_response(data:bytearray, filename:str="study-notes.pdf"):
    response = Response(content=bytes(data),
                        media_type="application/pdf",
                        #tells browser to download the pdf rather than trying to display it.
                        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
    return response


