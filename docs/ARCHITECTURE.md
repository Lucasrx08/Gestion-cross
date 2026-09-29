# Dossard Pro — architecture de la V1

## Décision

La V1 est locale d’abord : Excel/CSV, fond, aperçu, codes et PDF restent dans le navigateur. Aucun fichier d’élèves n’est envoyé au serveur. Les événements sont conservés dans IndexedDB sur l’appareil utilisé.

## Stack

| Besoin | Choix | Motif |
| --- | --- | --- |
| Application | React + TypeScript | Modèle documentaire typé et maintenable |
| Import | SheetJS | XLSX, XLS et CSV côté navigateur |
| PDF | pdf-lib + police DejaVu embarquée | Feuilles A4 exactes, dossards A5, textes et codes nets |
| QR | qrcode | Matrice identique à l’écran et dans le PDF |
| Code-barres | Encodeur Code 128 B interne | Rectangles vectoriels, contrôle du checksum |
| Sauvegarde V1 | IndexedDB | Fonds HD et listes volumineuses sans serveur |

Les coordonnées sont stockées en millimètres. Le moteur compose deux dossards A5 paysage exacts (210 × 148 mm) sur chaque feuille A4 portrait (210 × 297 mm), avec un repère de coupe central. Pour un nombre impair, le dernier dossard occupe la moitié supérieure et la moitié inférieure reste blanche. Les codes n’embarquent que l’identifiant technique.

## Modèle

- `RaceEvent` : métadonnées, numérotation, participants et modèle actif ;
- `Participant` : identifiant interne, numéro, identifiant technique et champs importés ;
- `BibTemplate` : format, fond et éléments de mise en page ;
- `LayoutElement` : type, coordonnées physiques, dimensions et style.

## V1

- événements locaux ; import PNG/JPEG, XLSX/XLS/CSV ; correspondance des colonnes nom, prénom, classe et sexe ;
- validation, recherche, édition et suppression ; numérotation configurable ;
- éditeur A5 avec grille, magnétisme, texte, Code 128 et QR ;
- vérification, test douchette, PDF A4 complet/par classe/plage/sélection/unitaire ;
- export CSV/XLSX ; modèles réutilisables ; suppression des données nominatives.

## Après la V1

Comptes et établissements multi-tenant, synchronisation chiffrée, bibliothèque premium, paiements, formats supplémentaires, chronométrage et classements. La couche de stockage locale est isolée pour être remplacée par une API sans refaire le moteur documentaire.

## Risques traités

- 1 500 dossards / 750 feuilles : génération progressive et un seul aperçu dans le DOM ;
- PDF lourd : fond embarqué une fois et réutilisé ;
- codes illisibles : zones blanches, contrôle checksum et test scanner ;
- noms longs : mesure et réduction de taille sans troncature ;
- colonnes ambiguës : suggestion puis validation humaine obligatoire ;
- doublons : blocage si un identifiant n’est pas unique ;
- RGPD : aucune donnée nominative transmise, suppression complète disponible.
