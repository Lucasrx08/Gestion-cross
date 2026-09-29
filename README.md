# Bon Sauveur Cross — Générateur de dossards

Application web locale-first pour générer les dossards de n’importe quelle course à partir d’un fond PNG/JPEG et d’une liste XLSX, XLS ou CSV.

## V1 fonctionnelle

- événements multiples stockés dans IndexedDB ;
- import et correspondance des quatre données utiles : nom, prénom, classe et sexe ;
- contrôle des données, édition, recherche et filtrage ;
- numérotation technique unique ;
- éditeur visuel en millimètres avec grille et magnétisme ;
- Code 128 et QR code vectoriels ;
- génération PDF A4 prête à imprimer, avec deux dossards A5 paysage par feuille et repère de coupe ;
- exports complet, par classe, plage, sélection et réimpression ;
- export CSV/XLSX et sauvegarde des modèles ;
- purge des données nominatives d’un événement.

Les données élèves restent dans le navigateur : aucun fichier participant n’est envoyé au serveur dans cette version.

## Site public

La branche `main` est automatiquement publiée avec GitHub Pages :

<https://lucasrx08.github.io/Gestion-cross/>

Le site est public, mais les courses, modèles et listes importées restent enregistrés uniquement dans le navigateur de chaque utilisateur.

## Développement

```bash
pnpm install
pnpm dev
```

Contrôles :

```bash
pnpm exec tsc --noEmit
node --import tsx scripts/acceptance-tests.mts
pnpm build
```

La documentation d’architecture, le modèle de données et la trajectoire SaaS sont dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Structure

- `app/` : interface et parcours en cinq étapes ;
- `components/dossard/` : participants, modèle, éditeur, vérification, export ;
- `lib/dossard/` : types, import, validation, stockage, codes et PDF ;
- `scripts/acceptance-tests.mts` : scénarios d’acceptation automatisés ;
- `public/fonts/` : polices Unicode incorporées dans les PDF.
