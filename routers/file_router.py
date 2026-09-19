from fastapi import (APIRouter, UploadFile)
from services.ai_services import (extract_text, generate_notes_using_chuncks, chunking_text, create_notes_pdf, create_output_response)
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/file", tags=["file-handling"])

@router.post("/create-notes")
async def upload_pdf(file:UploadFile):

    pdf_byte = await file.read()

    text = extract_text(data=pdf_byte)
    chunks = chunking_text(text)
    notes = await generate_notes_using_chuncks(chunks)
    pdf_output = create_notes_pdf(notes)

    return create_output_response(pdf_output)