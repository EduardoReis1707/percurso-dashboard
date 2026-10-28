/* pdf.js (usado só na Correção por leitura óptica) é carregado sob demanda,
   não no carregamento inicial da página — ver ensurePdfJsLoaded() */
let _pdfJsLoadPromise = null;
function ensurePdfJsLoaded() {
  if (window['pdfjsLib']) return Promise.resolve();
  if (_pdfJsLoadPromise) return _pdfJsLoadPromise;
  _pdfJsLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    };
    s.onerror = () => { _pdfJsLoadPromise = null; reject(new Error('Falha ao carregar a biblioteca de leitura de PDF.')); };
    document.head.appendChild(s);
  });
  return _pdfJsLoadPromise;
}

/* jsPDF (relatório por matéria e ficha de horas) também só é baixado quando alguém gera um PDF */
let _jsPdfLoadPromise = null;
function ensureJsPdfLoaded() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
  if (_jsPdfLoadPromise) return _jsPdfLoadPromise;
  _jsPdfLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve();
    s.onerror = () => { _jsPdfLoadPromise = null; reject(new Error('Falha ao carregar a biblioteca de PDF.')); };
    document.head.appendChild(s);
  });
  return _jsPdfLoadPromise;
}
