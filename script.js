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
const detectionNote = document.getElementById('detection-note');
const gridPreviewCanvas = document.getElementById('grid-preview-canvas');
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

  const detectedGrid = detectGrid(img);
  colsInput.value = detectedGrid.cols;
  rowsInput.value = detectedGrid.rows;
  updateTotalSlidesLabel();
  setDetectionNote(detectedGrid.confident);
  renderGridPreview();
  optionsSection.classList.remove('hidden');
  previewSection.classList.add('hidden');

  optionsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Dessine l'image importée avec des lignes rouges superposées aux positions
// de découpe actuelles (colonnes/lignes), pour vérifier visuellement avant
// de convertir.
function renderGridPreview() {
  if (!currentImage) return;

  const containerWidth = gridPreviewCanvas.parentElement.clientWidth || 600;
  const scale = containerWidth / currentImage.width;
  const w = Math.round(currentImage.width * scale);
  const h = Math.round(currentImage.height * scale);

  gridPreviewCanvas.width = w;
  gridPreviewCanvas.height = h;
  const ctx = gridPreviewCanvas.getContext('2d');
  ctx.drawImage(currentImage, 0, 0, w, h);

  const cols = Math.min(Math.max(parseInt(colsInput.value, 10) || 1, 1), 10);
  const rows = Math.min(Math.max(parseInt(rowsInput.value, 10) || 1, 1), 10);

  ctx.strokeStyle = '#ff3b3b';
  ctx.lineWidth = 2;

  for (let c = 1; c < cols; c++) {
    const x = Math.round((w * c) / cols);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  for (let r = 1; r < rows; r++) {
    const y = Math.round((h * r) / rows);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

// ===== Détection automatique de la disposition (colonnes x lignes) =====
// On repère les vraies coutures entre les slides : à chaque frontière entre
// deux slides, l'image change généralement nettement (fond différent,
// nouveau visuel, bordure). On mesure ces changements de couleur colonne
// par colonne et ligne par ligne, puis on cherche à quel nombre de
// colonnes/lignes ces changements sont les plus alignés.
function detectGrid(img) {
  const profile = buildEdgeProfile(img);
  const cols = findBestSplit(profile.colDiff, profile.width);
  const rows = findBestSplit(profile.rowDiff, profile.height);

  // "confident" = on a réellement trouvé au moins une couture nette. Si ni
  // l'axe des colonnes ni celui des lignes n'en révèle, il n'y a aucune
  // preuve visuelle exploitable : mieux vaut le dire que de deviner 1x1.
  return { cols, rows, confident: cols > 1 || rows > 1 };
}

// Dessine l'image sur un petit canvas d'analyse et calcule, pour chaque
// colonne/ligne, à quel point elle diffère de sa voisine (somme des écarts
// de couleur R/G/B moyennée sur l'axe perpendiculaire).
function buildEdgeProfile(img) {
  const maxDim = 500; // suffisant pour détecter des coutures, rapide à analyser
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(2, Math.round(img.width * scale));
  const h = Math.max(2, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const colDiff = new Float64Array(w); // colDiff[x] = écart entre colonne x et x-1
  const rowDiff = new Float64Array(h);

  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w; x++) {
      const i = (y * w + x) * 4;
      const iPrev = (y * w + (x - 1)) * 4;
      const d = Math.abs(data[i] - data[iPrev]) + Math.abs(data[i + 1] - data[iPrev + 1]) + Math.abs(data[i + 2] - data[iPrev + 2]);
      colDiff[x] += d;
    }
  }
  for (let x = 0; x < w; x++) colDiff[x] /= h;

  for (let x = 0; x < w; x++) {
    for (let y = 1; y < h; y++) {
      const i = (y * w + x) * 4;
      const iPrev = ((y - 1) * w + x) * 4;
      const d = Math.abs(data[i] - data[iPrev]) + Math.abs(data[i + 1] - data[iPrev + 1]) + Math.abs(data[i + 2] - data[iPrev + 2]);
      rowDiff[y] += d;
    }
  }
  for (let y = 0; y < h; y++) rowDiff[y] /= w;

  return { colDiff, rowDiff, width: w, height: h };
}

// Teste les découpages possibles (2 à 8 parts) et vérifie si des coutures
// nettes existent exactement à ces positions. On retient le découpage dont
// TOUTES les frontières sont nettement plus marquées que la moyenne du
// reste de l'image — ce qui élimine les découpages "au hasard".
function findBestSplit(diff, size) {
  // Base robuste (médiane + écart absolu médian) plutôt qu'une moyenne :
  // un dégradé ou une texture bruitée peut légèrement gonfler la moyenne
  // partout, alors que la médiane/MAD ne bougent presque pas. Une vraie
  // couture doit ressortir nettement au-dessus de ce bruit de fond.
  const med = median(diff);
  const dev = mad(diff, med) + 1; // +1 évite une division par ~0 sur une image totalement plate

  // On part du découpage le plus fin (8 parts) et on redescend : le premier
  // découpage dont TOUTES les frontières sont nettes est retenu. Une
  // hypothèse à N parts qui tient est une preuve plus forte qu'une hypothèse
  // à N/2 parts qui ne capte qu'une partie des coutures réelles.
  for (let n = 8; n >= 2; n--) {
    const boundaries = [];
    for (let i = 1; i < n; i++) boundaries.push(Math.round((size * i) / n));

    const strengths = boundaries.map((pos) => {
      // Pic le plus fort dans une petite fenêtre autour de la position
      // théorique (tolère un léger décalage/gouttière).
      let peak = 0;
      for (let o = -2; o <= 2; o++) {
        const idx = pos + o;
        if (idx > 0 && idx < diff.length) peak = Math.max(peak, diff[idx]);
      }
      return peak;
    });

    const weakest = Math.min(...strengths);

    // Chaque frontière doit être un vrai pic isolé : nettement au-dessus du
    // bruit de fond (médiane + plusieurs MAD) ET avoir une valeur absolue
    // significative, pour ignorer les faux positifs sur des zones plates.
    if (weakest > med + 6 * dev && weakest > 18) {
      return n;
    }
  }

  return 1;
}

function median(arr) {
  const sorted = Array.from(arr).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mad(arr, med) {
  const deviations = Array.from(arr, (v) => Math.abs(v - med));
  return median(deviations);
}

function setDetectionNote(confident) {
  if (confident) {
    detectionNote.textContent = '✓ Disposition détectée automatiquement à partir des coutures visibles entre les slides.';
    detectionNote.classList.remove('detection-note-warn');
  } else {
    detectionNote.textContent = '⚠ Aucune couture nette détectée entre des slides — indiquez le nombre de colonnes/lignes manuellement.';
    detectionNote.classList.add('detection-note-warn');
  }
}

// ===== Contrôle des colonnes / lignes =====

function updateTotalSlidesLabel() {
  const cols = parseInt(colsInput.value, 10) || 1;
  const rows = parseInt(rowsInput.value, 10) || 1;
  const total = cols * rows;
  totalSlidesLabel.textContent = `= ${total} slide${total > 1 ? 's' : ''}`;
}

function refreshOptions() {
  updateTotalSlidesLabel();
  renderGridPreview();
}

decreaseColsBtn.addEventListener('click', () => {
  colsInput.value = Math.max(1, parseInt(colsInput.value || '1', 10) - 1);
  refreshOptions();
});

increaseColsBtn.addEventListener('click', () => {
  colsInput.value = Math.min(10, parseInt(colsInput.value || '1', 10) + 1);
  refreshOptions();
});

decreaseRowsBtn.addEventListener('click', () => {
  rowsInput.value = Math.max(1, parseInt(rowsInput.value || '1', 10) - 1);
  refreshOptions();
});

increaseRowsBtn.addEventListener('click', () => {
  rowsInput.value = Math.min(10, parseInt(rowsInput.value || '1', 10) + 1);
  refreshOptions();
});

colsInput.addEventListener('input', refreshOptions);
rowsInput.addEventListener('input', refreshOptions);
window.addEventListener('resize', () => renderGridPreview());

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

      // Petite marge de sécurité à l'intérieur de chaque cellule : les
      // mosaïques générées par IA ont souvent un fin liseré/divider entre
      // les panneaux, qu'on ne veut pas capturer dans le résultat final.
      const insetX = sliceWidth * 0.02;
      const insetY = sliceHeight * 0.02;
      const sx = c * sliceWidth + insetX;
      const sy = r * sliceHeight + insetY;
      const cellWidth = sliceWidth - insetX * 2;
      const cellHeight = sliceHeight - insetY * 2;

      // On n'utilise jamais de recadrage qui coupe du contenu (une slide de
      // carrousel a souvent du texte près des bords). La cellule est
      // toujours affichée en entier ("contain"), centrée ; l'espace vide
      // éventuel (quand la cellule n'est pas déjà au format 4:5) est comblé
      // par la couleur exacte du bord de la slide plutôt qu'un flou, pour un
      // raccord invisible sur les designs à fond uni.
      drawEdgeColorBackground(ctx, img, sx, sy, cellWidth, cellHeight);
      drawContainedSlide(ctx, img, sx, sy, cellWidth, cellHeight);

      index++;
      const filename = `slide_${String(index).padStart(2, '0')}.png`;
      slides.push({ canvas, filename });
    }
  }

  return slides;
}

function drawEdgeColorBackground(ctx, img, sx, sy, sWidth, sHeight) {
  const scale = Math.min(OUTPUT_WIDTH / sWidth, OUTPUT_HEIGHT / sHeight);
  const drawWidth = sWidth * scale;
  const drawHeight = sHeight * scale;
  const dx = (OUTPUT_WIDTH - drawWidth) / 2;
  const dy = (OUTPUT_HEIGHT - drawHeight) / 2;

  if (dx > 0.5) {
    // Bandes verticales (gauche/droite) : on prélève la couleur exacte de
    // chaque bord de la slide pour un raccord invisible sur fond uni.
    const pad = Math.ceil(dx) + 1;
    ctx.fillStyle = averageEdgeColor(img, sx, sy, sWidth, sHeight, 'left');
    ctx.fillRect(0, 0, pad, OUTPUT_HEIGHT);
    ctx.fillStyle = averageEdgeColor(img, sx, sy, sWidth, sHeight, 'right');
    ctx.fillRect(OUTPUT_WIDTH - pad, 0, pad, OUTPUT_HEIGHT);
  } else if (dy > 0.5) {
    // Bandes horizontales (haut/bas)
    const pad = Math.ceil(dy) + 1;
    ctx.fillStyle = averageEdgeColor(img, sx, sy, sWidth, sHeight, 'top');
    ctx.fillRect(0, 0, OUTPUT_WIDTH, pad);
    ctx.fillStyle = averageEdgeColor(img, sx, sy, sWidth, sHeight, 'bottom');
    ctx.fillRect(0, OUTPUT_HEIGHT - pad, OUTPUT_WIDTH, pad);
  }
}

// Réduit une fine bande prélevée sur un bord de la slide à un unique pixel :
// le lissage du navigateur lors de la réduction moyenne toutes les couleurs
// de cette bande, ce qui donne une teinte représentative du bord.
function averageEdgeColor(img, sx, sy, sWidth, sHeight, side) {
  const stripFraction = 0.04;
  let stripSx = sx;
  let stripSy = sy;
  let stripSw = sWidth;
  let stripSh = sHeight;

  if (side === 'left') {
    stripSw = Math.max(1, sWidth * stripFraction);
  } else if (side === 'right') {
    stripSw = Math.max(1, sWidth * stripFraction);
    stripSx = sx + sWidth - stripSw;
  } else if (side === 'top') {
    stripSh = Math.max(1, sHeight * stripFraction);
  } else if (side === 'bottom') {
    stripSh = Math.max(1, sHeight * stripFraction);
    stripSy = sy + sHeight - stripSh;
  }

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 1;
  sampleCanvas.height = 1;
  const sampleCtx = sampleCanvas.getContext('2d');
  sampleCtx.drawImage(img, stripSx, stripSy, stripSw, stripSh, 0, 0, 1, 1);
  const [r, g, b] = sampleCtx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

function drawContainedSlide(ctx, img, sx, sy, sWidth, sHeight) {
  const scale = Math.min(OUTPUT_WIDTH / sWidth, OUTPUT_HEIGHT / sHeight);
  const drawWidth = sWidth * scale;
  const drawHeight = sHeight * scale;
  const dx = (OUTPUT_WIDTH - drawWidth) / 2;
  const dy = (OUTPUT_HEIGHT - drawHeight) / 2;
  ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, drawWidth, drawHeight);
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
