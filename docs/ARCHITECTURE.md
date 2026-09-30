# Gestion Cross — architecture

## Principe général

Gestion Cross reste **locale d’abord** pour la préparation documentaire : import Excel/CSV, fond de dossard, aperçu, modèles et PDF sont conservés dans le navigateur avec IndexedDB. Lorsqu’un organisateur active le mode **Courses & résultats**, la liste utile au cross est synchronisée vers un service Supabase protégé afin que plusieurs postes d’arrivée puissent travailler sur la même course.

La copie partagée n’est donc créée qu’au moment où le mode course est activé. Elle contient les participants nécessaires aux courses, leurs statuts, les postes d’arrivée, les scans et les résultats. L’accès organisateur repose sur une clé aléatoire enregistrée localement puis hachée côté serveur. Cette clé peut être incluse dans une sauvegarde complète Gestion Cross afin de reprendre l’organisation sur un autre appareil.

## Stack

| Besoin | Choix | Motif |
| --- | --- | --- |
| Application | React + TypeScript / Next | Interface adaptative PC, Mac et tablette |
| Import | SheetJS CE officiel | XLSX, XLS et CSV côté navigateur |
| PDF | pdf-lib + police DejaVu embarquée | Feuilles A4 exactes, dossards A5, textes et codes nets |
| QR | qrcode | Matrice identique à l’écran et dans le PDF |
| Code-barres | Encodeur Code 128 B interne | Rectangles vectoriels et contrôle du checksum |
| Sauvegarde locale | IndexedDB | Fonds HD et listes volumineuses |
| Mode course partagé | Supabase + Edge Function | Plusieurs postes, verrouillage transactionnel, résultats communs |
| Sauvegarde transportable | JSON Gestion Cross | Événements, modèles et clé organisateur restaurables |

Les coordonnées des dossards sont stockées en millimètres. Le moteur compose deux dossards A5 paysage exacts (210 × 148 mm) sur chaque feuille A4 portrait (210 × 297 mm), avec un repère de coupe central. Pour un nombre impair, le dernier dossard occupe la moitié supérieure et la moitié inférieure reste blanche. Les codes n’embarquent que l’identifiant technique.

## Modèle local

- `RaceEvent` : métadonnées, numérotation, participants, modèle actif et identité visuelle ;
- `Participant` : identifiant interne, numéro, identifiant technique et champs importés ;
- `BibTemplate` : format, fond et éléments de mise en page ;
- `LayoutElement` : type, coordonnées physiques, dimensions et style.

## Modèle partagé du mode course

- `cross_events` : événement synchronisé et propriétaire logique ;
- `cross_participants` : participants actifs et historiques ;
- `cross_heats` : courses préparées, en cours ou terminées ;
- `cross_entries` : engagement, statut et rang final ;
- `cross_stations` : postes A à D ;
- `cross_scans` : journal d’arrivée.

Les opérations sensibles sont transactionnelles : démarrage unique, attribution des postes, scan, annulation pendant une course, clôture et correction d’un classement final. Les lectures de listes sont paginées pour ne pas être limitées à 1 000 lignes.

## Fonctionnalités

- événements locaux ; import PNG/JPEG, XLSX/XLS/CSV ; correspondance des colonnes nom, prénom, classe et sexe ;
- validation, recherche, édition et suppression ; numérotation configurable, avec préfixe facultatif ;
- éditeur A5 avec grille, magnétisme, texte, Code 128 et QR ;
- vérification des dimensions et superpositions des codes avant export ;
- PDF A4 complet/par classe/plage/sélection/unitaire ;
- export CSV/XLSX ; modèles réutilisables ;
- préparation de plusieurs courses, 1 à 4 postes simultanés, saisie manuelle ou douchette ;
- file locale de scans rapides tant que le poste est en ligne ;
- classement individuel et challenge interclasses avec tous les élèves ;
- sauvegarde/restauration complète et purge locale ou partagée explicite.

## Règles de challenge

Tous les élèves des classes sélectionnées sont comptés. Un élève arrivé marque son rang. Un absent ou dispensé marque **dernier arrivé + 1**. Un abandon/non-finisseur marque **dernier arrivé + 10**. Le plus petit total gagne.

## Protection des données

Les données nominatives locales peuvent être supprimées depuis l’espace du cross. Une action distincte permet de supprimer la copie partagée du serveur ; une course en cours doit d’abord être terminée. Une sauvegarde JSON contient des données nominatives et la clé organisateur : elle doit être conservée dans un emplacement sécurisé.

Les accès directs anonymes aux tables sont bloqués par RLS ; les écritures de course passent par l’Edge Function et les fonctions internes réservées au rôle serveur.

## Limites de validation

Les tests automatisés couvrent les fonctions métier et la compilation. La validation finale d’un matériel réel reste indispensable : Safari iPad, navigateur Mac/PC, impression A4 à 100 %, douchette utilisée le jour du cross, cadence de lectures rapprochées et comportement lors d’une coupure réseau.
