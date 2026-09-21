/* ==========================================================
   Notes Maker: talks to your FastAPI backend.

   The backend has one endpoint:
     POST /file/create-notes   (form field "file" = the PDF)
   and it answers with the finished notes as a PDF.
   ========================================================== */

/* ---------- Step 1: settings you may want to change ---------- */
const API_BASE = "http://127.0.0.1:8000/";            // your deployed backend (keep the trailing slash)
const CREATE_NOTES_URL = `${API_BASE}file/create-notes`;
const MAX_FILE_MB = 25;                              // stops huge uploads from costing you Gemini calls

/* ---------- Step 2: grab the elements we need ---------- */
const $ = (id) => document.getElementById(id);

const sheet = $("sheet");
const panels = document.querySelectorAll(".panel");

const dropzone = $("dropzone");
const fileInput = $("file-input");
const pickMsg = $("pick-msg");

const fileNameEl = $("file-name");
const fileMetaEl = $("file-meta");
const makeBtn = $("make-btn");
const changeBtn = $("change-btn");

const elapsedEl = $("elapsed");
const cancelBtn = $("cancel-btn");

const doneNameEl = $("done-name");
const downloadLink = $("download-link");
const openLink = $("open-link");
const preview = $("preview");
const againBtn = $("again-btn");

const errorTitle = $("error-title");
const errorBody = $("error-body");
const retryBtn = $("retry-btn");
const errorChangeBtn = $("error-change-btn");

$("max-mb").textContent = MAX_FILE_MB;

/* ---------- Step 3: what the page remembers ---------- */
let selectedFile = null;      // the PDF the person chose
let abortController = null;   // lets the Cancel button stop the request
let timerId = null;           // the "Working for 0:42" clock
let resultUrl = null;         // temporary address of the finished PDF in the browser

/* ---------- Step 4: show one panel at a time ---------- */
// States: "idle" | "ready" | "working" | "done" | "error"
function setState(state, { focus = true } = {}) {
  sheet.dataset.state = state;
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== state;
  });

  // Move keyboard/screen-reader focus to the new panel's heading.
  if (focus) {
    const heading = document.querySelector(`.panel[data-panel="${state}"] [data-focus]`);
    if (heading) heading.focus();
  }
}

/* ---------- Step 6: choose a file (click or drag and drop) ---------- */
function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showPickMessage(text) {
  pickMsg.textContent = text;
  pickMsg.hidden = !text;
}

function handleFile(file) {
  showPickMessage("");
  if (!file) return;

  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    showPickMessage("That file isn't a PDF. Choose a file that ends in .pdf.");
    return;
  }
  if (file.size === 0) {
    showPickMessage("That PDF is empty. Choose a different file.");
    return;
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    showPickMessage(`That PDF is ${formatSize(file.size)}. The limit is ${MAX_FILE_MB} MB.`);
    return;
  }

  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileMetaEl.textContent = `PDF, ${formatSize(file.size)}`;
  setState("ready");
}

fileInput.addEventListener("change", () => {
  handleFile(fileInput.files[0]);
  fileInput.value = ""; // lets the person pick the same file again later
});

["dragenter", "dragover"].forEach((type) => {
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  });
});
["dragleave", "drop"].forEach((type) => {
  dropzone.addEventListener(type, () => dropzone.classList.remove("is-over"));
});
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  const files = event.dataTransfer.files;
  if (files.length > 1) {
    showPickMessage("Drop one PDF at a time.");
    return;
  }
  handleFile(files[0]);
});

// If a file is dropped outside the drop zone, don't let the browser open it and leave the page.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

/* ---------- Step 7: send the PDF to FastAPI ---------- */
async function makeNotes() {
  if (!selectedFile) return;

  abortController = new AbortController();
  setState("working");
  startTimer();

  // FormData builds a multipart/form-data request, which is what UploadFile expects.
  const formData = new FormData();
  // "file" must match the parameter name in your router: async def upload_pdf(file: UploadFile)
  formData.append("file", selectedFile);

  try {
    const response = await fetch(CREATE_NOTES_URL, {
      method: "POST",
      body: formData,
      signal: abortController.signal,
    });

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new ApiError(response.status, detail);
    }

    const pdfBlob = await response.blob();
    showResult(pdfBlob);
  } catch (error) {
    if (error.name === "AbortError") {
      setState("ready"); // the person pressed Cancel
    } else {
      showError(error);
    }
  } finally {
    stopTimer();
    abortController = null;
  }
}

// FastAPI sends errors as JSON like {"detail": "failed to create notes."}
async function readErrorDetail(response) {
  try {
    const body = await response.json();
    return typeof body.detail === "string" ? body.detail : null;
  } catch {
    return null;
  }
}

class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed with status ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

/* ---------- Step 8: show the finished notes ---------- */
function showResult(pdfBlob) {
  // Free the previous result before making a new one.
  if (resultUrl) URL.revokeObjectURL(resultUrl);

  const pdf = new Blob([pdfBlob], { type: "application/pdf" });
  resultUrl = URL.createObjectURL(pdf);

  const outputName = selectedFile.name.replace(/\.pdf$/i, "") + "-notes.pdf";

  doneNameEl.textContent = `${outputName}, ${formatSize(pdf.size)}`;
  downloadLink.href = resultUrl;
  downloadLink.download = outputName;
  openLink.href = resultUrl;
  preview.src = `${resultUrl}#view=FitH`;

  setState("done");
}

/* ---------- Step 9: explain errors in plain language ---------- */
function showError(error) {
  let title = "Something went wrong";
  let body = "Try again in a moment.";

  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        title = "The notes PDF couldn't be built";
        body = error.detail || "The server couldn't turn the notes into a PDF.";
        break;
      case 422:
        title = "The server didn't get a PDF";
        body = "The upload didn't include a file the server could read. Choose the PDF again.";
        break;
      case 502:
        title = "The AI service didn't respond";
        body = "The server tried several times and gave up. Wait a minute, then try again.";
        break;
      case 500:
        title = "The server hit an error";
        body = "The server hit an error while making your notes. A damaged or scanned PDF is a common cause, so try a different PDF.";
        break;
      default:
        title = `Something went wrong (status ${error.status})`;
        body = error.detail || body;
    }
  } else {
    // fetch() itself failed: the server is off, the address is wrong, or the connection dropped.
    title = "Can't reach the server";
    body = "The page couldn't connect to the server. Check your internet connection, wait a moment, then try again.";
  }

  errorTitle.textContent = title;
  errorBody.textContent = body;
  setState("error");
}

/* ---------- Step 10: the "Working for 0:42" clock ---------- */
function startTimer() {
  const startedAt = Date.now();
  elapsedEl.textContent = "0:00";
  timerId = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    const minutes = Math.floor(seconds / 60);
    elapsedEl.textContent = `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

/* ---------- Step 11: start over ---------- */
function resetToStart() {
  selectedFile = null;
  showPickMessage("");
  setState("idle");
  fileInput.focus();
}

/* ---------- Step 12: wire up the buttons ---------- */
makeBtn.addEventListener("click", makeNotes);
retryBtn.addEventListener("click", makeNotes);
cancelBtn.addEventListener("click", () => abortController && abortController.abort());
changeBtn.addEventListener("click", resetToStart);
errorChangeBtn.addEventListener("click", resetToStart);
againBtn.addEventListener("click", () => {
  preview.removeAttribute("src");
  resetToStart();
});

// A long job is easy to lose by accident, so ask before the tab closes mid-request.
window.addEventListener("beforeunload", (event) => {
  if (sheet.dataset.state === "working") event.preventDefault();
});

/* ---------- Go ---------- */
setState("idle", { focus: false });