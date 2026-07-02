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
const slideCountInput = document.getElementById('slide-count');
const decreaseCountBtn = document.getElementById('decrease-count');
const increaseCountBtn = document.getElementById('increase-count');
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

  const detectedCount = detectSlideCount(img.width, img.height);
  slideCountInput.value = detectedCount;
  optionsSection.classList.remove('hidden');
  previewSection.classList.add('hidden');

  optionsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===== Détection automatique du nombre de slides =====
// Hypothèse : les slides sont accolées horizontalement et proches d'un
// format carré (1:1) ou portrait (4:5), les deux formats les plus courants
// pour les carrousels Instagram. On teste les deux et on garde le nombre
// de slides le plus plausible (proche d'un entier).
function detectSlideCount(width, height) {
  const candidates = [1, OUTPUT_RATIO]; // 1:1 puis 4:5
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

  return Math.min(Math.max(bestCount, 1), 20);
}

// ===== Contrôle du nombre de slides =====

decreaseCountBtn.addEventListener('click', () => {
  const value = Math.max(1, parseInt(slideCountInput.value || '1', 10) - 1);
  slideCountInput.value = value;
});

increaseCountBtn.addEventListener('click', () => {
  const value = Math.min(20, parseInt(slideCountInput.value || '1', 10) + 1);
  slideCountInput.value = value;
});

// ===== Conversion : découpage + redimensionnement =====

convertBtn.addEventListener('click', () => {
  if (!currentImage) return;

  const count = Math.min(Math.max(parseInt(slideCountInput.value, 10) || 1, 1), 20);
  generatedSlides = sliceImage(currentImage, count);
  renderPreview(generatedSlides);

  previewSection.classList.remove('hidden');
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

function sliceImage(img, count) {
  const sliceWidth = img.width / count;
  const slides = [];

  for (let i = 0; i < count; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;
    const ctx = canvas.getContext('2d');

    // Découpe la slice i dans l'image source
    const sx = i * sliceWidth;
    const sy = 0;
    const sWidth = sliceWidth;
    const sHeight = img.height;

    // Recadrage "cover" pour remplir 1080x1350 sans déformer l'image
    const sliceRatio = sWidth / sHeight;
    let cropWidth = sWidth;
    let cropHeight = sHeight;
    let cropX = sx;
    let cropY = sy;

    if (sliceRatio > OUTPUT_RATIO) {
      // Slice trop large : on rogne les côtés
      cropWidth = sHeight * OUTPUT_RATIO;
      cropX = sx + (sWidth - cropWidth) / 2;
    } else if (sliceRatio < OUTPUT_RATIO) {
      // Slice trop haute : on rogne haut/bas
      cropHeight = sWidth / OUTPUT_RATIO;
      cropY = sy + (sHeight - cropHeight) / 2;
    }

    ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

    const filename = `slide_${String(i + 1).padStart(2, '0')}.png`;
    slides.push({ canvas, filename });
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
