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

Les listes et les modèles de dossard sont enregistrés dans le navigateur de l’organisateur. L’activation du mode course synchronise les participants avec le service partagé pour permettre la gestion des arrivées sur plusieurs appareils.

## Site public

La branche `main` est automatiquement publiée avec GitHub Pages :

<https://lucasrx08.github.io/Gestion-cross/>

Le site est public. Les courses préparées et les résultats sont retrouvés depuis l’appareil organisateur grâce à sa clé locale. Les postes d’arrivée rejoignent uniquement la course partagée par son code, son lien ou son QR code.

## Préparer et gérer les courses

- Dans « Courses & résultats », préparer plusieurs courses avec leurs classes, le sexe, le challenge et un horaire prévu facultatif.
- Les courses restent enregistrées au statut « Prête ». Leur modification conserve les absents et dispensés déjà renseignés pour les élèves conservés.
- Le programme est trié par horaire. Un clic sur « Lancer » démarre le chronomètre et affiche le partage des postes d’arrivée.
- Les postes acceptent le numéro visible du dossard (ex. `17`), le numéro avec des zéros (ex. `0017`) et le code scanné. Un échec conserve la saisie pour pouvoir la corriger.
- Après la course, consulter les résultats, imprimer / enregistrer en PDF et télécharger les classements et les challenges dans des fichiers Excel séparés. Les exports du programme regroupent les courses terminées, avec une feuille par course.
- Challenge : tous les élèves comptent. Arrivé = rang ; absent ou dispensé = dernier arrivé + 1 ; abandon / non-finisseur = dernier arrivé + 10. La classe avec le plus petit total gagne.

Le service des courses et sa migration sont versionnés dans `supabase/` ; les fonctions internes sont accessibles uniquement au rôle serveur.

## Présentation et tablettes

La [charte graphique](docs/DESIGN.md) reprend les bleus et le jaune du logo. L’accueil, les cartes, les titres et les commandes suivent la même présentation. Le logo et les couleurs du cross restent personnalisables.

La navigation se répartit sur deux rangées aux formats tablette. Les élèves sont présentés en fiches sous 1280 px, les outils passent à la ligne, les tableaux d’arrivée défilent dans leur cadre et les fenêtres de réglage s’adaptent à la hauteur visible. Les commandes principales mesurent au moins 44 px pour l’usage tactile.

## Développement

```bash
pnpm install
pnpm dev
```

Contrôles :

```bash
pnpm exec tsc --noEmit
node --import tsx scripts/race-tests.mts
node --import tsx scripts/acceptance-tests.mts
pnpm build
```

La documentation d’architecture, le modèle de données et la trajectoire SaaS sont dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Structure

- `app/` : interface et parcours en six étapes ;
- `components/dossard/` : participants, modèle, éditeur, vérification, export ;
- `lib/dossard/` : types, import, validation, stockage, codes et PDF ;
- `scripts/acceptance-tests.mts` : scénarios d’acceptation automatisés ;
- `public/fonts/` : polices Unicode incorporées dans les PDF.
