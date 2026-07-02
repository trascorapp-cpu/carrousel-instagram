/*
 * Découpeur de Carrousel Instagram
 * Tout se passe côté navigateur : lecture de fichier, découpage via Canvas,
 * puis compression en ZIP via JSZip. Aucune donnée ne quitte l'appareil.
 */

// Format de sortie Instagram (portrait 4:5)
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1350;
const OUTPUT_RATIO = OUTPUT_WIDTH / OUTPUT_HEIGHT;

// ===== Références DOM =====
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const imageInfo = document.getElementById('image-info');
const sourcePreview = document.getElementById('source-preview');
const imageDimensions = document.getElementById('image-dimensions');
const changeImageBtn = document.getElementById('change-image-btn');

const optionsSection = document.getElementById('options-section');
const colsInput = document.getElementById('cols-count');
const rowsInput = document.getElementById('rows-count');
const decreaseColsBtn = document.getElementById('decrease-cols');
const increaseColsBtn = document.getElementById('increase-cols');
const decreaseRowsBtn = document.getElementById('decrease-rows');
const increaseRowsBtn = document.getElementById('increase-rows');
const totalSlidesLabel = document.getElementById('total-slides');
const convertBtn = document.getElementById('convert-btn');

const previewSection = document.getElementById('preview-section');
const previewGrid = document.getElementById('preview-grid');
const downloadBtn = document.getElementById('download-btn');

// État courant : l'image source chargée
let currentImage = null;
// Blobs PNG générés au dernier clic sur "Convertir"
let generatedSlides = [];

// ===== Import de l'image =====

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

changeImageBtn.addEventListener('click', () => {
  fileInput.value = '';
  currentImage = null;
  imageInfo.classList.add('hidden');
  optionsSection.classList.add('hidden');
  previewSection.classList.add('hidden');
});

function handleFile(file) {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    alert('Format non supporté. Merci d\'importer une image JPG, PNG ou WebP.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => onImageLoaded(img, e.target.result);
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function onImageLoaded(img, dataUrl) {
  currentImage = img;

  sourcePreview.src = dataUrl;
  imageDimensions.textContent = `${img.width} × ${img.height} px`;
  imageInfo.classList.remove('hidden');

  const detectedGrid = detectGrid(img.width, img.height);
  colsInput.value = detectedGrid.cols;
  rowsInput.value = detectedGrid.rows;
  updateTotalSlidesLabel();
  optionsSection.classList.remove('hidden');
  previewSection.classList.add('hidden');

  optionsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===== Détection automatique de la disposition (colonnes x lignes) =====
// Deux cas fréquents pour un carrousel Instagram :
// - une bande horizontale (1 ligne, plusieurs slides carrées ou 4:5 côte à côte)
// - une grille carrée (ex : 3x3), format très utilisé par les outils de
//   création de carrousels (Canva et autres).
// C'est une estimation : les champs restent modifiables manuellement.
function detectGrid(width, height) {
  const overallRatio = width / height;

  // Image globalement carrée : on suppose une grille 3x3, la disposition
  // la plus courante pour ce type d'export.
  if (overallRatio > 0.85 && overallRatio < 1.18) {
    return { cols: 3, rows: 3 };
  }

  // Sinon, on suppose une bande horizontale à une seule ligne, et on estime
  // le nombre de slides en comparant la largeur à des formats de slide
  // courants (carré 1:1 ou portrait 4:5).
  const candidates = [1, OUTPUT_RATIO];
  let bestCount = 2;
  let bestScore = Infinity;

  candidates.forEach((slideRatio) => {
    const rawCount = width / (height * slideRatio);
    const rounded = Math.round(rawCount);
    if (rounded < 1) return;
    const score = Math.abs(rawCount - rounded);
    if (score < bestScore) {
      bestScore = score;
      bestCount = rounded;
    }
  });

  return { cols: Math.min(Math.max(bestCount, 1), 10), rows: 1 };
}

// ===== Contrôle des colonnes / lignes =====

function updateTotalSlidesLabel() {
  const cols = parseInt(colsInput.value, 10) || 1;
  const rows = parseInt(rowsInput.value, 10) || 1;
  const total = cols * rows;
  totalSlidesLabel.textContent = `= ${total} slide${total > 1 ? 's' : ''}`;
}

decreaseColsBtn.addEventListener('click', () => {
  colsInput.value = Math.max(1, parseInt(colsInput.value || '1', 10) - 1);
  updateTotalSlidesLabel();
});

increaseColsBtn.addEventListener('click', () => {
  colsInput.value = Math.min(10, parseInt(colsInput.value || '1', 10) + 1);
  updateTotalSlidesLabel();
});

decreaseRowsBtn.addEventListener('click', () => {
  rowsInput.value = Math.max(1, parseInt(rowsInput.value || '1', 10) - 1);
  updateTotalSlidesLabel();
});

increaseRowsBtn.addEventListener('click', () => {
  rowsInput.value = Math.min(10, parseInt(rowsInput.value || '1', 10) + 1);
  updateTotalSlidesLabel();
});

colsInput.addEventListener('input', updateTotalSlidesLabel);
rowsInput.addEventListener('input', updateTotalSlidesLabel);

// ===== Conversion : découpage + redimensionnement =====

convertBtn.addEventListener('click', () => {
  if (!currentImage) return;

  const cols = Math.min(Math.max(parseInt(colsInput.value, 10) || 1, 1), 10);
  const rows = Math.min(Math.max(parseInt(rowsInput.value, 10) || 1, 1), 10);
  generatedSlides = sliceImage(currentImage, cols, rows);
  renderPreview(generatedSlides);

  previewSection.classList.remove('hidden');
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

function sliceImage(img, cols, rows) {
  const sliceWidth = img.width / cols;
  const sliceHeight = img.height / rows;
  const slides = [];
  let index = 0;

  // Ordre de lecture standard : gauche à droite, puis haut en bas.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const ctx = canvas.getContext('2d');

      // Découpe la cellule (c, r) dans l'image source
      const sx = c * sliceWidth;
      const sy = r * sliceHeight;

      // Recadrage "cover" pour remplir 1080x1350 sans déformer l'image
      const sliceRatio = sliceWidth / sliceHeight;
      let cropWidth = sliceWidth;
      let cropHeight = sliceHeight;
      let cropX = sx;
      let cropY = sy;

      if (sliceRatio > OUTPUT_RATIO) {
        // Cellule trop large : on rogne les côtés
        cropWidth = sliceHeight * OUTPUT_RATIO;
        cropX = sx + (sliceWidth - cropWidth) / 2;
      } else if (sliceRatio < OUTPUT_RATIO) {
        // Cellule trop haute : on rogne haut/bas
        cropHeight = sliceWidth / OUTPUT_RATIO;
        cropY = sy + (sliceHeight - cropHeight) / 2;
      }

      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

      index++;
      const filename = `slide_${String(index).padStart(2, '0')}.png`;
      slides.push({ canvas, filename });
    }
  }

  return slides;
}

function renderPreview(slides) {
  previewGrid.innerHTML = '';

  slides.forEach((slide) => {
    const item = document.createElement('div');
    item.className = 'preview-item';

    const img = document.createElement('img');
    img.src = slide.canvas.toDataURL('image/png');
    img.alt = slide.filename;

    const label = document.createElement('span');
    label.textContent = slide.filename;

    item.appendChild(img);
    item.appendChild(label);
    previewGrid.appendChild(item);
  });
}

// ===== Téléchargement du ZIP =====

downloadBtn.addEventListener('click', async () => {
  if (!generatedSlides.length) return;

  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Préparation du ZIP…';

  try {
    const zip = new JSZip();

    for (const slide of generatedSlides) {
      const blob = await canvasToBlob(slide.canvas);
      zip.file(slide.filename, blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(zipBlob, 'carousel_instagram.zip');
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Télécharger le ZIP';
  }
});

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
