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
