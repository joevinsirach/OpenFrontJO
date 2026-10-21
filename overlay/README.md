# Surcouche OpenFrontJO

Panneaux dessinés par-dessus le client officiel sur `https://openfront.io`. La carte, la souris et la connexion restent celles du site. L’extension ne modifie pas `gitCommit`, le message de join, ni le WebSocket, et elle ne définit pas `window.openfrontDesktop`.

Le dossier est séparé du client du fork. Il n’importe ni le worker, ni l’engine, ni `GameView`.

## Ce qui est remplacé

- La barre de gauche (Classement), avec toutes les colonnes déjà affichées : rang, nom, or, revenu, troupes, troupes max, et les autres colonnes du tableau officiel.
- Le panneau de contrôle, quand il affiche l’or, les troupes ou le ratio : cadence, troupes, or, curseur de ratio, messages, boutons d’attaque et d’alliance.
- La fiche du joueur sélectionné, avec sa relation et les boutons officiels déjà ouverts.
- Les attaques en cours, les événements, et les demandes qui ont un bouton (accepter, refuser, riposte).
- La barre d’unités et le menu de construction, quand le jeu les affiche. Un clic déclenche le bouton officiel.
- La barre du haut : chrono, réglages du jeu et sortie, qui cliquent les boutons officiels.

Le chat et l’écran de victoire restent ceux du site.

Le bouton Réglages, en haut à droite, est toujours là. Un clic l’ouvre. On peut y masquer ou réafficher chaque panneau, l’agrandir ou le réduire, et le remettre à sa place. Glisser la barre de titre déplace le panneau. Le coin en bas à droite change sa largeur. Masquer un panneau laisse réapparaître le panneau officiel correspondant. La surcouche passe au-dessus des fenêtres du jeu ; la carte reste cliquable autour.

Le chat, les modales et l’écran de victoire restent ceux du site. Si le reader ne trouve pas de donnée, le panneau officiel correspondant reste visible.

Les sélecteurs sont tous dans `src/selectors.ts`.

## Actions

- Le curseur de ratio écrit dans le `input` officiel et envoie `input`. C’est le client officiel qui met à jour la partie.
- Alliance clique le bouton officiel déjà ouvert dans `player-panel`.
- Attaque (bateau) clique le bouton officiel déjà ouvert dans `player-info-overlay`.
- S’il n’y a pas de bouton, la surcouche n’en invente pas et ne clique pas la carte.

La surcouche a `pointer-events: none`, sauf sur ses propres panneaux.

## Extension

Compiler, puis charger le dossier `overlay/` comme extension non empaquetée (Manifest V3) :

```bash
npx tsc -p overlay/tsconfig.json
```

Dans Chrome : `chrome://extensions` → mode développeur → charger le dossier `overlay/`.

Hôtes : `https://openfront.io/*` et `https://*.openfront.io/*`.

Retirer l’extension retire la feuille de style qui masque les panneaux officiels. Recharger l’onglet enlève les nœuds ajoutés dans la page.

## Coque Electron

Elle ouvre `https://openfront.io` et charge cette même extension. Elle ne sert pas le client du fork, ne lit pas le dossier Steam, et ne charge pas `app://openfront`.

Le binaire Electron déjà installé pour le wrapper du fork suffit :

```bash
npx tsc -p overlay/tsconfig.json
npx esbuild overlay/src/content.ts --bundle --format=iife --outfile=overlay/dist/inject.js
./electron/node_modules/electron/dist/electron.exe overlay/shell
```

`inject.js` n’est utilisé que si le chargement de l’extension n’a pas posé la surcouche. Le preload est vide.

## Fixture

`fixtures/official-ingame.html` reprend le DOM rendu par `control-panel`, `game-left-sidebar`, `player-panel` et le bouton d’attaque de `player-info-overlay`. Les tests lisent cette page figée, pas le worker.
