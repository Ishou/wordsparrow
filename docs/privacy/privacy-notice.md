# Politique de confidentialité

> Source de vérité pour la page `/confidentialite` (FR) et `/privacy` (EN).
> Toute modification du traitement de données doit mettre à jour ce document
> avant ou pendant le PR qui introduit le changement. Garder ce document en
> phase avec `frontend/src/ui/components/PrivacyNotice.tsx`, qui rend la page.

**Dernière mise à jour :** _à compléter à la mise en ligne_

## En bref

WordSparrow (mots fléchés en ligne) collecte le strict minimum nécessaire pour
faire fonctionner le service. Aucun compte obligatoire (la connexion via
Google est facultative), aucun cookie publicitaire, aucun partage avec des
annonceurs. Vous pouvez à tout moment effacer vos données depuis les
paramètres du jeu.

## Responsable du traitement

WordSparrow est exploité par Colin Auberger, contact :
`contact@wordsparrow.io`. Toute demande relative à vos données peut être
adressée à cette adresse.

## Données traitées

| Donnée | Pourquoi | Combien de temps |
|---|---|---|
| Identifiant de session (UUID v7) dans `localStorage` | Identifier votre session, compter vos demandes d'indices et varier les libellés affichés d'une grille à la suivante | Jusqu'à effacement |
| Pseudonyme | Affichage en multijoueur | Jusqu'à effacement |
| Indices demandés par grille | Limiter le nombre d'indices par grille | 90 jours après la dernière demande |
| Lettres saisies et cases validées par grille, indexées par identifiant de session, dans `localStorage` | Reprendre une grille en cours et afficher votre progression dans « Anciennes grilles » | Jusqu'à effacement |
| Tour d'accueil vu (oui / non) dans `localStorage` | Ne pas relancer la visite guidée à chaque ouverture du jeu | Jusqu'à effacement |
| Mémoire courte des libellés déjà affichés (mot et libellé proposé) | Éviter de reproposer le même libellé pour le même mot d'une grille à la suivante | Jusqu'à effacement |
| État de salon multijoueur (salons, joueurs, lettres saisies), stocké côté serveur | Synchroniser la grille en temps réel et reprendre après rechargement | Salons en attente supprimés après 30 min d'inactivité ; salons terminés conservés 7 jours ; salons en cours conservés jusqu'au départ de tous les joueurs |
| Mesures d'audience anonymisées (Matomo auto-hébergé) | Comprendre l'usage du service pour l'améliorer | 13 mois (recommandation CNIL) |

La même mémoire courte est tenue de façon **globale** pour la grille du jour (un seau partagé, sans identifiant individuel) afin que les libellés varient d'un jour sur l'autre.

## Compte joueur et connexion

**Compte joueur.** Si vous vous connectez via Google, nous créons un compte
joueur avec : un identifiant interne (UUID, sans lien avec votre compte
Google) ; un pseudonyme modifiable (par défaut : un nom d'animal aléatoire
repris de votre session anonyme) ; la date de création et de dernière
connexion. Nous ne stockons **pas** votre email, votre nom, votre photo de
profil ou toute autre donnée de votre compte Google. Le périmètre OAuth
utilisé est `openid` uniquement.

**Sessions.** Un cookie `__Secure-ws_session` (HttpOnly, Secure, durée
7 jours) contient un identifiant de session opaque (un jeton aléatoire, sans
donnée personnelle à l'intérieur). Il est révoqué à la déconnexion et
supprimé lors de la suppression du compte.

**Sous-traitants.** Lors de la connexion, Google reçoit votre choix
d'autorisation. Aucune donnée n'est partagée en dehors du flux OAuth.

**Droit à l'effacement.** Le bouton « Supprimer mon compte » accessible
depuis le menu « Mon compte » supprime immédiatement vos données identité —
sans période de rétention ni conservation différée.

### Ce que nous **ne** collectons **pas**

- Pas de compte obligatoire, aucun mot de passe, aucune adresse e-mail — la
  connexion via Google est facultative et crée un compte joueur tel que
  décrit ci-dessus.
- Aucun cookie de tracking publicitaire.
- Aucune adresse IP n'est conservée par l'application (Matomo
  l'anonymise au niveau des deux derniers octets avant tout stockage).
- Aucun partage avec des régies publicitaires ou des courtiers en données.

## Base légale

**Intérêt légitime** (RGPD article 6.1.f) : faire fonctionner un service
ludique gratuit et mesurer son audience de façon anonymisée. La mesure
d'audience est exemptée de consentement par la CNIL (délibération 2020-091)
parce que sa configuration respecte les conditions de l'exemption :

- adresse IP anonymisée,
- absence de recoupement avec d'autres traitements,
- pas de transmission à des tiers,
- pas de profilage individuel.

**Consentement** (RGPD article 6.1.a). Le traitement des données d'identité
(UUID interne, pseudonyme, horodatages, cookie de session) lié à un compte
joueur repose sur votre consentement donné lors de la connexion via Google.
Vous pouvez retirer ce consentement à tout moment en supprimant votre compte
depuis le menu « Mon compte ».

## Cookies

Pour les utilisateurs anonymes, WordSparrow n'utilise **pas** de cookies. Le
service stocke un identifiant de session anonyme dans le `localStorage` de
votre navigateur (technologie distincte des cookies). La mesure d'audience
Matomo fonctionne en mode sans cookie. Si vous vous connectez via Google, le
cookie `__Secure-ws_session` (HttpOnly, Secure, durée 7 jours) est posé —
voir la section « Compte joueur et connexion » ci-dessus.

## Vos droits

Vous disposez des droits prévus par le RGPD :

- **Droit d'accès et de portabilité** (articles 15 et 20) : vos données
  étant minimales et anonymes, l'essentiel est déjà visible dans les
  paramètres du jeu (pseudonyme, identifiant de session). Pour
  l'historique des indices, écrivez à l'adresse ci-dessus.
- **Droit à l'effacement** (article 17) : utilisez le bouton "Effacer
  mes données" dans les paramètres. L'identifiant de session, le
  pseudonyme, l'historique d'indices côté serveur et votre empreinte
  dans les salons multijoueurs sont supprimés immédiatement. Pour les
  salons multijoueurs, une cascade en trois règles s'applique : un
  salon dont vous étiez seul propriétaire est supprimé ; un salon que
  vous partagiez continue pour les autres joueurs (le plus
  ancien joueur restant en devient propriétaire, votre pseudonyme
  disparaît, et les lettres que vous aviez saisies restent sur la
  grille mais ne vous sont plus attribuées) ; un salon où vous n'étiez
  qu'invité perd votre pseudonyme et vos lettres deviennent
  non-attribuées. Les visites Matomo ne sont pas activement supprimées
  parce qu'elles sont déjà non-attribuables par construction : le
  hachage rotatif quotidien empêche tout recoupement avec d'autres
  jours, et la création d'un nouvel identifiant de session local après
  l'effacement rompt le lien avec les visites du jour en cours. Les
  visites Matomo restent soumises à la fenêtre de conservation de
  13 mois sous forme agrégée et anonyme.
- **Droit d'opposition** : vous pouvez désactiver la mesure d'audience
  via le réglage `Do Not Track` de votre navigateur ; Matomo le
  respecte automatiquement.
- **Droit de réclamation** : vous pouvez saisir la CNIL (cnil.fr) si
  vous estimez que vos données ne sont pas traitées correctement.

## Sous-traitants

WordSparrow s'appuie sur les sous-traitants suivants. La liste à jour est
maintenue dans
[`docs/privacy/sub-processors.md`](./sub-processors.md).

- **Hetzner Online GmbH** (Allemagne) — hébergement du cluster
  Kubernetes et de la base de données.
- **Cloudflare, Inc.** (États-Unis) — DNS et diffusion de contenu
  statique. Cloudflare voit votre adresse IP lorsqu'elle livre les
  pages du jeu mais ne la transmet pas à WordSparrow et la traite selon son
  propre Data Processing Addendum (clauses contractuelles types).
- **Google LLC** (États-Unis) — fournisseur d'identité OAuth. Reçoit
  votre choix d'autorisation lors de la connexion ; traité selon son
  propre DPA RGPD.

Aucune donnée n'est transférée hors UE par WordSparrow elle-même ; les
serveurs sont situés en Allemagne (Hetzner). Cloudflare opère un réseau
mondial mais maintient des engagements contractuels conformes au RGPD.

## Sondage de qualité des définitions

WordSparrow propose un sondage de notation des définitions candidates afin
d'améliorer la qualité du corpus de mots fléchés. Vos notes (qualité et
difficulté, de 1 à 5) ainsi que les éventuelles corrections proposées
(texte libre) sont collectées en mode anonyme par défaut. Si vous êtes
connecté·e, le sondage est associé à votre compte joueur pour éviter les
doublons.

### Anonymisation à la suppression du compte

Lorsque vous supprimez votre compte joueur (RGPD article 17), vos notes
sont **conservées mais anonymisées** — elles ne sont pas effacées. Le lien
avec votre identité est rompu : l'identifiant qui les reliait à votre
compte est retiré, les informations techniques associées sont effacées et
la date est réduite au mois. Les notes restent utilisables pour entraîner
le modèle sans qu'il soit possible de les rattacher à vous.

### Corrections proposées

Les corrections de définition que vous proposez (texte libre) sont, par
défaut, **également conservées** à la suppression de votre compte, sous une
forme détachée de votre identité (le lien indiquant que vous en êtes
l'auteur·e est entièrement supprimé). Si vous préférez que vos corrections
soient effacées en même temps que votre compte, activez la préférence
« Supprimer aussi mes corrections proposées en cas de suppression de mon
compte » dans votre espace « Mon compte ».

## Modifications

Toute évolution de cette politique passe par une Pull Request publique
sur le dépôt du projet, avec un message de commit décrivant le
changement. Les versions précédentes sont consultables dans l'historique
Git.

---

# Privacy Policy (English)

> Reference rendering for `/privacy`. The French version is canonical;
> any divergence is a bug — open an issue.

## In short

WordSparrow (online French crossword puzzles) collects the minimum needed to
run the service. No mandatory accounts (Google sign-in is optional), no
advertising cookies, no sharing with advertisers. You can erase your data at
any time from the game settings.

## Data controller

WordSparrow is operated by Colin Auberger, contact: `contact@wordsparrow.io`.

## Data we process

| Data | Purpose | Retention |
|---|---|---|
| Session id (UUID v7) in `localStorage` | Identify your session, count your hint requests, and vary the clue text shown across consecutive grids | Until erased |
| Pseudonym | Multiplayer display | Until erased |
| Hints used per puzzle | Cap hints per puzzle | 90 days from last request |
| Letters entered and validated cells per puzzle, keyed by session id, in `localStorage` | Resume an in-progress puzzle and show progress on "Past puzzles" | Until erased |
| Onboarding tour seen (yes / no) in `localStorage` | Avoid replaying the guided tour every time you open the game | Until erased |
| Short-term memory of clue labels already shown (word and clue text) | Avoid repeating the same clue for the same word across consecutive grids | Until erased |
| Multiplayer lobby state (lobbies, players, placed letters), stored server-side | Real-time grid sync and resume after reload | Lobbies still waiting for players are dropped after 30 min of inactivity; finished lobbies are kept 7 days; in-progress lobbies are kept until everyone leaves |
| Anonymized audience metrics (self-hosted Matomo) | Understand usage to improve the service | 13 months (CNIL guidance) |

The same short-term memory is also kept **globally** for the daily puzzle (one shared bucket, no individual identifier) so that clue labels vary day over day.

## Player account and sign-in

**Player account.** When you sign in with Google we create a player account
with: an internal identifier (UUID, unrelated to your Google account ID); an
editable display name (defaulting to a random animal name carried over from
your anonymous session); creation and last-seen timestamps. We do **not**
store your email, name, profile picture, or any other Google account data.
The OAuth scope is `openid` only.

**Sessions.** A `__Secure-ws_session` cookie (HttpOnly, Secure, 7-day
lifetime) holds an opaque session ID (a random token with no personal data
inside). It is revoked on sign-out and deleted when the account is deleted.

**Sub-processors.** During sign-in Google receives your authorisation
choice. No data is shared outside the OAuth flow itself.

**Right to erasure.** The "Delete my account" button in the "Mon compte"
menu immediately deletes your identity data — with no retention period and
no delayed deletion.

### What we do **not** collect

- No mandatory accounts, no passwords, no email addresses — sign-in with
  Google is optional and creates a player account as described above.
- No advertising or tracking cookies.
- No IP addresses retained by the application (Matomo anonymizes the
  last two octets before any storage).
- No sharing with ad networks or data brokers.

## Lawful basis

**Legitimate interest** (GDPR Article 6.1.f): running a free crossword
service and measuring its audience anonymously. Audience measurement is
exempt from consent under the French CNIL deliberation 2020-091 because the
configuration meets the exemption conditions (anonymized IP, no cross-site
profiling, no third-party sharing, no individual profiling).

**Consent** (GDPR Article 6.1.a). Processing of identity data (internal
UUID, display name, timestamps, session cookie) associated with a player
account is based on your consent given during Google sign-in. You may
withdraw this consent at any time by deleting your account from the "Mon
compte" menu.

## Cookies

For anonymous users, WordSparrow does **not** set cookies. The service
stores an anonymous session identifier in your browser's `localStorage` (a
technology distinct from cookies). Matomo audience measurement runs in
cookieless mode. If you sign in with Google, the `__Secure-ws_session`
cookie (HttpOnly, Secure, 7-day lifetime) is set — see the "Player account
and sign-in" section above.

## Your rights

GDPR rights:

- **Access and portability** (Articles 15, 20): your data is minimal and
  visible in game settings (pseudonym, session ID). For the hint
  history, contact the address above.
- **Erasure** (Article 17): use the "Erase my data" button in settings.
  Session ID, pseudonym, server-side hint history, and your multiplayer
  lobby footprint are deleted immediately. For multiplayer lobbies we
  apply a three-rule cascade: a lobby you owned alone is deleted; a
  lobby you owned with others continues for the remaining players (the
  earliest-joined remaining player becomes the owner, your name is
  removed, and any letters you typed stay on the grid but are no longer
  attributed to you); a lobby you only joined loses your name from the
  member list and your letters become unattributed. Matomo visits are
  not actively deleted because they are already non-attributable by
  design — the daily-rotated hash prevents cross-day linkage, and a
  fresh local session id after the call breaks linkage with same-day
  visits. Matomo data remains under the 13-month retention window in
  aggregate, anonymous form.
- **Opt-out**: enable your browser's `Do Not Track` setting; Matomo
  honours it automatically.
- **Complaints**: you may file a complaint with the CNIL (cnil.fr) if
  you believe your data is mishandled.

## Sub-processors

See [`docs/privacy/sub-processors.md`](./sub-processors.md) for the
authoritative list.

- **Hetzner Online GmbH** (Germany) — Kubernetes cluster and database
  hosting.
- **Cloudflare, Inc.** (USA) — DNS and static content delivery.
  Cloudflare sees your IP address when serving game pages but does not
  forward it to WordSparrow and processes it under its own DPA (Standard
  Contractual Clauses).
- **Google LLC** (USA) — OAuth identity provider. Receives your
  authorisation choice at sign-in; processed under its own GDPR DPA.

WordSparrow itself does not transfer data outside the EU; servers are in
Germany (Hetzner). Cloudflare runs a global network but maintains
GDPR-compliant contractual safeguards.

## Definition quality survey

WordSparrow offers a survey to rate candidate definitions, in order to
improve the quality of the crossword corpus. Your ratings (quality and
difficulty, from 1 to 5) and any suggested corrections (free text) are
collected anonymously by default. If you are signed in, the survey is
linked to your player account to avoid duplicates.

### Anonymisation when you delete your account

When you delete your player account (GDPR Article 17), your ratings are
**kept but anonymised** — they are not erased. The link to your identity is
broken: the identifier that tied them to your account is removed, the
associated technical information is cleared, and the date is reduced to the
month. The ratings remain usable to train the model without any way to
trace them back to you.

### Suggested corrections

The definition corrections you suggest (free text) are, by default, **also
kept** when you delete your account, in a form detached from your identity
(the record showing that you are the author is entirely removed). If you
would prefer your corrections to be erased along with your account, enable
the "Also delete my suggested corrections when I delete my account"
preference in your "Mon compte" area.

## Changes

Every change to this policy goes through a public Pull Request on the
project repository, with a descriptive commit message. Previous versions
are visible in the Git history.
