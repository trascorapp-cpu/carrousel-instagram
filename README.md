# Découpeur de Carrousel Instagram

Application web gratuite, sans serveur ni compte, qui découpe une grande image
de carrousel Instagram en plusieurs slides au format portrait 1080 × 1350 px,
prêtes à publier.

Tout fonctionne dans le navigateur (HTML, CSS, JavaScript vanilla, Canvas HTML5
et [JSZip](https://stuk.github.io/jszip/) pour créer le fichier ZIP). Aucune
image n'est envoyée sur un serveur.

## Structure du projet

```
App Carrousel/
├── index.html      Structure de la page
├── style.css        Design (minimaliste, responsive)
├── script.js        Logique (import, découpage, ZIP)
├── jszip.min.js      Librairie ZIP (incluse localement, fonctionne hors-ligne)
└── README.md
```

## Utiliser l'application en local

Aucune installation n'est nécessaire.

1. Ouvrez simplement le fichier `index.html` en double-cliquant dessus
   (il s'ouvre dans votre navigateur par défaut).
2. Importez votre image de carrousel, vérifiez le nombre de slides, cliquez
   sur « Convertir », puis téléchargez le ZIP.

Pour partager l'application à quelqu'un d'autre, envoyez-lui simplement tout
le dossier `App Carrousel` (par exemple compressé en ZIP). La personne n'a
qu'à ouvrir `index.html` — aucune installation, aucun compte requis.

> Remarque : certains navigateurs (notamment Chrome) appliquent des
> restrictions de sécurité sur les fichiers ouverts en local avec `file://`.
> Si le drag & drop ou l'aperçu ne fonctionnent pas correctement en local,
> essayez avec Firefox, ou utilisez la version hébergée (voir ci-dessous).

## Mettre l'application en ligne gratuitement (GitHub Pages)

1. Créez un compte GitHub si vous n'en avez pas (gratuit sur github.com).
2. Créez un nouveau dépôt (repository), par exemple `carrousel-instagram`.
3. Ajoutez les fichiers du dossier `App Carrousel` (`index.html`, `style.css`,
   `script.js`, `jszip.min.js`) à ce dépôt :
   - soit en les glissant-déposant directement sur la page du dépôt GitHub
     (bouton « Add file » → « Upload files »),
   - soit via Git en ligne de commande :
     ```
     git init
     git add index.html style.css script.js jszip.min.js
     git commit -m "Découpeur de carrousel Instagram"
     git branch -M main
     git remote add origin https://github.com/VOTRE-NOM/carrousel-instagram.git
     git push -u origin main
     ```
4. Dans le dépôt GitHub, allez dans **Settings → Pages**.
5. Sous « Build and deployment », choisissez la branche `main` et le dossier
   `/ (root)`, puis cliquez sur **Save**.
6. Après une à deux minutes, votre application est disponible à une adresse
   du type :
   ```
   https://VOTRE-NOM.github.io/carrousel-instagram/
   ```

Vous pouvez alors partager ce lien à n'importe qui — l'application
fonctionnera directement dans leur navigateur, gratuitement.

## Fonctionnement du découpage

- L'image importée est supposée composée de plusieurs slides accolées
  horizontalement.
- Le nombre de slides est estimé automatiquement en comparant les
  proportions de l'image à des formats courants (carré 1:1 ou portrait
  4:5). Ce nombre reste modifiable manuellement.
- Chaque slide est recadrée en son centre (« cover »), sans déformation,
  pour remplir exactement le format Instagram 1080 × 1350 px.
- Les fichiers sont nommés `slide_01.png`, `slide_02.png`, etc. et
  regroupés dans `carousel_instagram.zip`.
