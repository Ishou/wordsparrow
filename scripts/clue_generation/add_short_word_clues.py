#!/usr/bin/env python3
"""Curated multi-clue overlay for 2-3 letter French mots-fléchés fillers.

Each word carries 3-5 distinct hand-authored clues (CC0-1.0, original
Claude/Bliss authorship). The ADR-0031 clue cooldown is per-(word, clue),
so a word is only unavailable when ALL its clues are cooling — multiple
clues per short word multiply the effective fill capacity of the tiny
2-3 letter pool that dense 28x20 grids lean on. Idempotent: the first
clue lands on the word's existing row (or a fresh one), the rest are
appended as duplicate rows; prior source=bliss duplicates are replaced.
The runtime loader (CsvWordRepository) merges duplicate word rows into
one multi-clue Word.
"""
from __future__ import annotations
import csv
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
WORDLIST = REPO / "grid/infrastructure/src/main/resources/words/words-fr.csv"

# word -> list of distinct clues. Words are matched case-insensitively
# against the wordlist; original row casing is preserved.
ENTRIES: dict[str, list[str]] = {
    # === 2-letter: roman numerals (uppercase rows) ===
    "cc": ["C + C", "Deux cents romain", "Copie carbone", "200 en chiffres romains"],
    "cd": ["Disque compact", "Quatre cents romain", "Galette numérique", "Support de musique"],
    "ci": ["Ici abrégé", "Cent un romain", "101 en chiffres romains", "Joint à cette lettre"],
    "cl": ["Chlore", "Cent cinquante romain", "Centilitre", "Symbole du chlore"],
    "cm": ["Centimètre", "M - C", "Neuf cents romain", "Petite mesure de couture"],
    "cv": ["Cheval-vapeur", "Cent cinq romain", "Résumé de carrière", "Sésame de l'embauche"],
    "cx": ["L + LX", "Cent dix romain", "Ancienne Citroën"],
    "dc": ["M - CD", "Six cents romain", "Courant continu", "Capitale américaine"],
    "di": ["MI - D", "Cinq cent un romain", "Préfixe de doublement"],
    "dl": ["Décilitre", "Cinq cent cinquante romain", "Dixième de litre"],
    "dv": ["DX - V", "Cinq cent cinq romain"],
    "dx": ["MX - D", "Cinq cent dix romain"],
    "ii": ["I + I", "Deux romain", "IV - I - I", "Second de la lignée"],
    "iv": ["V - I", "Quatre romain", "II + II", "Perfusion à l'hôpital"],
    "ix": ["X - I", "Neuf romain", "XI - II", "Avant-dernier chiffre romain simple"],
    "li": ["Lithium", "Cinquante et un romain", "Symbole du lithium", "Métal des batteries"],
    "lv": ["LX - V", "Cinquante-cinq romain", "Lettonie sur la Toile"],
    "lx": ["C - XL", "Soixante romain", "L + X"],
    "mc": ["D + DC", "Mille cent romain", "Maître de cérémonie"],
    "md": ["MM - D", "Mille cinq cents romain", "Docteur en médecine abrégé"],
    "mi": ["Demi en composition", "Troisième note", "Note entre ré et fa", "Moitié de préfixe"],
    "ml": ["Millilitre", "Mille cinquante romain", "Millième de litre"],
    "mm": ["Millimètre", "Deux mille romain", "M + M", "Toute petite mesure"],
    "mv": ["MX - V", "Mille cinq romain", "Millivolt"],
    "mx": ["D + DX", "Mille dix romain"],
    "vi": ["Six romain", "V + I", "IV + II", "Sixième de la série"],
    "xc": ["C - X", "Quatre-vingt-dix romain", "L + XL"],
    "xi": ["Lettre grecque", "Onze romain", "X + I", "Quatorzième lettre grecque"],
    "xl": ["L - X", "Quarante romain", "Très grande taille", "XX + XX"],
    "xv": ["XX - V", "Quinze romain", "Équipe de rugby", "X + V"],
    "xx": ["X + X", "Vingt romain", "Chromosomes féminins", "XIX + I"],
    # === 2-letter: chemical elements ===
    "ag": ["Argent", "Symbole de l'argent", "Métal des miroirs", "Assemblée générale"],
    "al": ["Aluminium", "Symbole de l'aluminium", "Métal des canettes", "Capone pour les intimes"],
    "ar": ["Argon", "Symbole de l'argon", "Gaz noble", "Are abrégé"],
    "be": ["Béryllium", "Symbole du béryllium", "Belgique sur la Toile", "Bande à Ernest"],
    "br": ["Brome", "Symbole du brome", "Halogène liquide"],
    "ca": ["Calcium", "Symbole du calcium", "Chiffre d'affaires", "Cela familier"],
    "co": ["Cobalt", "Symbole du cobalt", "Métal bleu", "Monoxyde sans son oxygène"],
    "cr": ["Chrome", "Symbole du chrome", "Métal brillant des pare-chocs"],
    "cu": ["Cuivre", "Symbole du cuivre", "Métal des casseroles", "Rouge comme métal"],
    "fe": ["Fer", "Symbole du fer", "Métal à cheval", "Santa au Brésil"],
    "he": ["Hélium", "Symbole de l'hélium", "Gaz des ballons", "Interpellation discrète"],
    "hg": ["Mercure", "Symbole du mercure", "Métal liquide", "Hectogramme"],
    "kr": ["Krypton", "Symbole du krypton", "Gaz noble rare"],
    "mg": ["Magnésium", "Symbole du magnésium", "Milligramme", "Métal des feux d'artifice"],
    "mn": ["Manganèse", "Symbole du manganèse", "Métal des aciers durs"],
    "na": ["Sodium", "Symbole du sodium", "Métal du sel", "Non applicable"],
    "ni": ["Nickel", "Conjonction négative", "Symbole du nickel", "Répété entre deux refus"],
    "pb": ["Symbole du plomb", "Plomb du chimiste", "Métal lourd", "Problème abrégé"],
    "sn": ["Étain", "Symbole de l'étain", "Métal de la soudure"],
    "ti": ["Titane", "Symbole du titane", "Métal des prothèses", "Petit préfixe créole"],
    "xe": ["Symbole du xenon", "Xénon du chimiste", "Gaz des phares"],
    "zn": ["Symbole du zinc", "Zinc du chimiste", "Métal des toits parisiens"],
    "fr": ["Francium", "Symbole du francium", "France sur la Toile", "Frère abrégé"],
    "ge": ["Germanium", "Symbole du germanium", "Genève sur les plaques"],
    "ir": ["Iridium", "Symbole de l'iridium", "Métal des météorites"],
    "mo": ["Molybdène", "Symbole du molybdène", "Instant très bref", "Mégaoctet"],
    "az": ["Azote ancien", "Début d'alphabet inversé", "De A à Z en raccourci"],
    "po": ["Polonium", "Symbole du polonium", "Fleuve italien", "Pot familier"],
    "sc": ["Scandium", "Symbole du scandium", "Sciences abrégées"],
    # === 2-letter: notes / music ===
    "do": ["Première note", "Note de la gamme", "Ut moderne", "Début de gamme"],
    "re": ["Deuxième note", "Note après do", "Préfixe de répétition", "Retour en préfixe"],
    "fa": ["Quatrième note", "Note après mi", "Clé de basse", "Note du diapason"],
    "ut": ["Ancien do", "Note désuète", "Première note d'autrefois", "Do des anciens"],
    # === 2-letter: grammar / function words ===
    "ai": ["Possède", "Détiens", "Bénéficie de", "Garde en main"],
    "an": ["Année", "Douze mois", "Tour de calendrier", "Unité d'âge", "Période de 365 jours"],
    "as": ["Champion", "Carte maîtresse", "Détiens", "Crack", "Meilleure carte"],
    "au": ["À le", "Article contracté", "Symbole de l'or", "Contraction de à le"],
    "ce": ["Démonstratif", "Adjectif démonstratif", "Cours élémentaire", "Comité d'entreprise"],
    "de": ["Allemagne", "Préposition d'origine", "Cube à jouer", "Particule nobiliaire", "Berlin sur la Toile"],
    "du": ["De le", "Article contracté", "Contraction de de le", "Partitif masculin"],
    "en": ["Dans", "Préposition de lieu", "Pronom adverbial", "Préfixe d'enfermement"],
    "es": ["Deuxième personne d'être", "Verbe être au singulier", "Espagne sur la Toile", "Madrid en ligne"],
    "et": ["Conjonction", "Liaison de mots", "Extraterrestre célèbre", "Signe d'addition"],
    "eu": ["Possédé", "Obtenu", "Europe abrégée", "Reçu en partage"],
    "il": ["Pronom masculin", "Pronom sujet", "Troisième personne", "Lui au sujet"],
    "je": ["Première personne", "Pronom du locuteur", "Moi au sujet", "Pronom de l'ego"],
    "la": ["Article féminin", "Sixième note", "Note du diapason", "Note après sol"],
    "le": ["Article masculin", "Article défini", "Pronom complément", "Déterminant du nom"],
    "ma": ["Possessif féminin", "À moi au féminin", "Maroc sur la Toile", "Adjectif possessif"],
    "me": ["Pronom complément", "Maître abrégé", "Pronom réfléchi", "Titre d'avocat"],
    "ne": ["Côté alsacien", "Particule de négation", "Venu au monde", "Nord-est"],
    "no": ["Numéro abrégé", "Refus anglais", "Théâtre japonais", "Norvège sur la Toile"],
    "on": ["Pronom indéfini", "Tout le monde", "Quelqu'un", "Pronom passe-partout"],
    "or": ["Métal précieux", "Conjonction de transition", "Richesse jaune", "Trésor de la banque centrale"],
    "ou": ["Alternative", "Conjonction de choix", "L'un l'autre", "Sinon"],
    "sa": ["Société anonyme", "Possessif féminin", "À lui au féminin", "Sienne"],
    "se": ["Sud-est abrégé", "Pronom réfléchi", "Sélénium", "Côté provençal"],
    "si": ["Condition", "Septième note", "Tellement", "Note sensible", "Réponse affirmative à une négation"],
    "ta": ["Possessif féminin", "À toi au féminin", "Tantale", "Tienne"],
    "te": ["Pronom complément", "Tellure", "Toi en complément", "Pronom réfléchi de tu"],
    "tu": ["Pronom sujet", "Deuxième personne", "Passé sous silence", "Gardé secret"],
    "un": ["Premier chiffre", "Article indéfini", "Unité", "Le plus petit entier positif"],
    "us": ["Coutumes", "Traditions anciennes", "Amérique abrégée", "Habitudes d'antan"],
    "va": ["Se rend", "Marche", "Se déplace", "Fonce"],
    "vu": ["Aperçu", "Constaté", "Étant donné", "Observé"],
    "lu": ["Parcouru des yeux", "Déchiffré", "Lutécium", "Dévoré page à page"],
    "su": ["Appris", "Connu", "Assimilé", "Maîtrisé"],
    "bu": ["S'est désaltéré", "Avalé", "Éclusé", "Sifflé"],
    "pu": ["Été capable", "Eu la possibilité", "Eu la force"],
    "mu": ["Lettre grecque", "Mis en mouvement", "Poussé par un ressort", "Douzième lettre grecque"],
    "nu": ["Sans vêtement", "Lettre grecque", "Dévêtu", "Comme un ver", "Treizième lettre grecque"],
    "pi": ["Lettre grecque", "Constante du cercle", "3,14 environ", "Seizième lettre grecque"],
    "eh": ["Appel bref", "Interjection d'appel", "Exclamation de surprise", "Interpellation"],
    "ex": ["Ancien", "Partenaire d'avant", "Préfixe du passé", "Ancien conjoint"],
    "ha": ["Hectare", "Cri d'étonnement", "Rire bref", "Cent ares"],
    "oh": ["Cri d'étonnement", "Interjection de surprise", "Exclamation admirative", "Marque la stupeur"],
    "ah": ["Cri de surprise", "Interjection de soulagement", "Exclamation de plaisir", "Marque l'étonnement"],
    "ô": ["Interjection lyrique", "Invocation poétique", "Apostrophe solennelle", "Ouverture d'ode"],
    "ra": ["Dieu solaire", "Divinité égyptienne", "Roulement de tambour", "Soleil du Nil"],
    "if": ["Conifère", "Arbre des cimetières", "Arbre à baies rouges", "Château de Marseille", "Arbre toujours vert"],
    "os": ["Pièce du squelette", "Difficulté imprévue", "Charpente du corps", "Régal du chien", "Hic"],
    # === 2-letter: abbreviations / sigles / misc ===
    "dr": ["Docteur", "Titre médical", "Médecin abrégé", "Droit abrégé"],
    "mr": ["Monsieur anglais", "Mister", "Monsieur d'outre-Manche"],
    "pr": ["Titre abrege", "Professeur abrégé", "Praséodyme", "Titre universitaire"],
    "st": ["Rue abrégée en anglais", "Saint abrégé", "Street en raccourci"],
    "so": ["Côté aquitain", "Sud-ouest", "Tellement anglais", "Cap sur Biarritz"],
    "bo": ["Bulletin officiel", "Bande originale", "Journal de la République", "Musique de film"],
    "ko": ["Hors combat", "Mis au tapis", "Assommé", "Kilooctet", "Fin de match de boxe"],
    "vs": ["Contre", "Face à", "Opposé à", "Versus abrégé"],
    "ad": ["Après Jésus-Christ", "Anno Domini", "Préfixe latin de direction"],
    "am": ["Avant midi", "Matin anglo-saxon", "Américium", "Modulation d'amplitude"],
    "ap": ["Après", "Appartement abrégé", "Après en raccourci"],
    "fm": ["Fréquence modulée", "Bande radio", "Radio moderne"],
    "nb": ["Nota bene", "À noter", "Remarque importante", "Niobium"],
    "nd": ["Notre-Dame", "Néodyme", "Non disponible", "Cathédrale abrégée"],
    "ns": ["Notre-Seigneur", "Nanoseconde", "Nous abrégé"],
    "ok": ["D'accord", "Entendu", "Ça marche", "Approbation universelle", "Validation"],
    "ol": ["Olympique lyonnais", "Club de Lyon", "Suffixe d'alcool", "Gones en sigle"],
    "op": ["Opus", "Œuvre en musique", "Opération abrégée", "Art optique"],
    "pc": ["Ordinateur personnel", "Parti communiste", "Poste de commandement", "Machine de bureau"],
    "ph": ["Potentiel hydrogène", "Mesure d'acidité", "Indice des piscines"],
    "pm": ["Après-midi", "Prométhium", "Premier ministre", "Police municipale"],
    "ps": ["Post-scriptum", "Ajout de fin de lettre", "Parti socialiste", "Dernière pensée"],
    "pt": ["Portugal", "Platine", "Point abrégé", "Lisbonne sur la Toile"],
    "pv": ["Procès-verbal", "Contravention", "Amende du stationnement", "Papillon sur le pare-brise"],
    "qr": ["Code à scanner", "Carré à flasher", "Sésame du smartphone"],
    "tv": ["Télévision", "Petit écran", "Lucarne du salon", "Téloche"],
    "uc": ["Unité centrale", "Cœur de l'ordinateur", "Tour du PC"],
    "vc": ["Vietcong", "Capital-risqueur", "Guérilla d'Indochine"],
    "wc": ["Toilettes", "Petit coin", "Cabinets", "Lieux d'aisances"],
    "ue": ["Union européenne", "Club des Vingt-Sept", "Europe politique", "Unité d'enseignement"],
    "it": ["Italie", "Informatique anglaise", "Rome sur la Toile", "Ça anglais"],
    "uk": ["Royaume-Uni", "Londres sur la Toile", "Albion en sigle"],
    "go": ["Jeu asiatique", "Gigaoctet", "Jeu de pierres noires et blanches", "Signal de départ"],
    "ba": ["Bonne action", "Baryum", "Geste de scout", "Âme égyptienne ailée"],
    "bi": ["Deux fois", "Préfixe de deux", "Bismuth", "Double en préfixe"],
    "da": ["Oui slave", "Oui de Moscou", "Approbation russe"],
    "hi": ["Rire léger", "Salut anglais", "Petit rire", "Ricanement bref"],
    "ho": ["Cri d'arrêt", "Holmium", "Interjection de halte", "Appel du charretier"],
    "in": ["À la mode", "Branché", "Dedans anglais", "Indium", "Tendance"],
    "ka": ["Âme égyptienne", "Double spirituel du pharaon", "Force vitale du Nil"],
    "oc": ["Langue du Midi", "Sud linguistique", "Langue des troubadours", "Occitan en racine"],
    "ri": ["S'est marré", "A pouffé", "S'est esclaffé", "A gloussé"],
    "ru": ["Petit ruisseau", "Cours d'eau modeste", "Russie sur la Toile", "Ruthénium", "Filet d'eau"],
    "wu": ["Dialecte chinois", "Langue de Shanghai", "Parler de Chine orientale"],
    "yo": ["Salut familier", "Interjection de rappeur", "Bonjour de la rue"],
    "av": ["Avant", "Avenue abrégée", "Audiovisuel", "Avant Jésus-Christ en tête"],
    "ur": ["Ville antique", "Cité sumérienne", "Berceau d'Abraham", "Préfixe d'origine"],
    "aa": ["Lave rugueuse", "Coulée hawaïenne", "Fleuve du Nord", "Lave en blocs"],
    "fi": ["Cri de dégoût", "Interjection de mépris", "Finlande sur la Toile", "Marque le dédain"],
    # === 2-letter: units ===
    "db": ["Décibel", "Unité de bruit", "Mesure du volume sonore", "Dubnium"],
    "dm": ["Décimètre", "Dixième de mètre", "Dix centimètres"],
    "km": ["Kilomètre", "Mille mètres", "Unité des distances routières", "Borne kilométrique"],
    "to": ["Téraoctet", "Grosse capacité de disque", "Mille gigaoctets"],
    "cg": ["Centigramme", "Centième de gramme", "Petite masse"],
    "dg": ["Décigramme", "Dixième de gramme", "Directeur général"],
    "kg": ["Kilogramme", "Mille grammes", "Unité de masse", "Poids du sucre en paquet"],
    "hz": ["Hertz", "Unité de fréquence", "Mesure des ondes", "Cycle par seconde"],
    "kh": ["Kilohertz", "Mille hertz", "Fréquence des grandes ondes"],
    "mh": ["Mégahertz", "Million de hertz", "Fréquence de la bande FM"],
    "gh": ["Gigahertz", "Milliard de hertz", "Fréquence de processeur", "Ghana sur la Toile"],
    "kw": ["Kilowatt", "Mille watts", "Puissance du radiateur", "Koweït sur la Toile"],
    "mw": ["Mégawatt", "Million de watts", "Puissance de centrale", "Malawi sur la Toile"],
    "kv": ["Kilovolt", "Mille volts", "Tension des lignes électriques"],
    # === 2-letter: list A (new — no grammalecte lemma, hidden by admission) ===
    "jo": ["Jeux olympiques", "Rendez-vous des athlètes", "Compétition quadriennale", "Anneaux et médailles", "Journal officiel"],
    "ia": ["Intelligence artificielle", "Cerveau de silicium", "Esprit des machines", "ChatGPT en est une"],
    "bd": ["Bande dessinée", "Neuvième art", "Bulles et vignettes", "Album d'Astérix", "Boulevard abrégé"],
    "vo": ["Version originale", "Film non doublé", "Langue d'origine au cinéma", "Sous-titres obligatoires"],
    "qg": ["Quartier général", "Centre de commandement", "Base des opérations", "Repaire de l'état-major"],
    "pj": ["Pièce jointe", "Police judiciaire", "Annexe du courriel", "Quai des Orfèvres en sigle"],
    "cf": ["Confer", "Voir aussi", "Renvoi de bas de page", "Invitation à comparer", "Californium"],
    "ht": ["Hors taxe", "Sans la TVA", "Prix avant taxes", "Haute tension"],
    "id": ["Idem", "Pareillement", "Identifiant", "La même chose", "Idaho abrégé"],
    "dj": ["Disc-jockey", "Maître des platines", "Animateur de soirée", "Mixeur de sons", "Djibouti sur la Toile"],
    # === 3-letter: compass rail ===
    "ene": ["Cap vers l'Alsace", "Est-nord-est", "Entre est et nord-est", "Direction du levant boréal"],
    "ese": ["Cap vers les Alpes du Sud", "Est-sud-est", "Entre est et sud-est"],
    "nne": ["Cap vers les Flandres", "Nord-nord-est", "Presque plein nord"],
    "nno": ["Cap vers la côte d'Opale", "Nord-nord-ouest", "Quasi plein nord"],
    "ono": ["Cap vers la Bretagne", "Ouest-nord-ouest", "Entre ouest et nord-ouest", "Veuve de Lennon"],
    "oso": ["Cap vers le golfe de Gascogne", "Ouest-sud-ouest", "Entre ouest et sud-ouest"],
    "sse": ["Cap vers la Provence", "Sud-sud-est", "Presque plein sud"],
    "sso": ["Cap vers le Pays basque", "Sud-sud-ouest", "Quasi plein sud"],
    "est": ["Point cardinal du levant", "Côté du soleil levant", "Verbe être à la troisième personne", "Opposé à l'ouest", "Orient"],
    "sud": ["Point cardinal du midi", "Direction du Midi", "Opposé au nord", "Cap vers l'Afrique"],
    # === 3-letter: common nouns / staples ===
    "âge": ["Période de la vie", "Nombre d'années", "Il figure sur la carte d'identité", "Époque de l'histoire"],
    "aïe": ["Cri de douleur", "Interjection de souffrance", "Ça fait mal", "Exclamation du blessé"],
    "ail": ["Bulbe à gousses", "Condiment provençal", "Épouvantail à vampires", "Parfum de l'aïoli"],
    "air": ["Mélange respirable", "Mélodie fredonnée", "Apparence trompeuse", "Atmosphère", "On le prend pour respirer"],
    "ami": ["Compagnon de confiance", "Proche du cœur", "Copain fidèle", "Allié intime"],
    "ans": ["Mesure d'une vie", "Années au pluriel", "Ils s'accumulent aux anniversaires", "Printemps comptés"],
    "arc": ["Arme à corde tendue", "Courbe d'architecte", "Il décoche des flèches", "Monument de l'Étoile", "Portion de cercle"],
    "are": ["Cent mètres carrés", "Unité du cadastre", "Mesure de terrain", "Surface agraire"],
    "art": ["Création esthétique", "Talent raffiné", "Il a ses musées", "Savoir-faire", "Expression du beau"],
    "axe": ["Ligne droite centrale", "Pivot de rotation", "Direction stratégique", "Colonne vertébrale d'un plan"],
    "bac": ["Cuve ou ferry", "Examen de fin de lycée", "Bateau de traversée", "Récipient à glaçons", "Sésame pour la fac"],
    "bal": ["Soirée dansante", "Fête à valses", "Rendez-vous des danseurs", "Il ouvre les mariages"],
    "ban": ["Décret public", "Exclusion prononcée", "Applaudissement rythmé", "Proclamation de mariage"],
    "bar": ["Établissement à boire", "Unité de pression", "Poisson de mer", "Comptoir à cocktails", "Loup en poissonnerie"],
    "bas": ["Vêtement de jambe", "Peu élevé", "Contraire de haut", "Sous la jupe", "Voix grave"],
    "bec": ["Pointe d'oiseau", "Bouche de l'oiseau", "Embout de la théière", "Baiser familier"],
    "bis": ["Encore une fois", "Rappel au concert", "Deuxième du numéro", "Répétition réclamée"],
    "blé": ["Céréale dorée", "Grain à pain", "Argent familier", "Or des champs"],
    "bol": ["Récipient creux", "Chance familière", "Tasse sans anse", "Il reçoit le petit-déjeuner"],
    "bon": ["Coupon ou agréable", "Contraire de mauvais", "Billet de réduction", "Généreux", "D'accord en tête de phrase"],
    "bus": ["Transport en commun", "Véhicule de ligne", "Il suit son itinéraire", "Car urbain"],
    "but": ["Objectif à atteindre", "Cage du gardien", "Point au football", "Finalité", "Cible visée"],
    "cap": ["Pointe de terre", "Direction du navire", "Avancée dans la mer", "Bonne-Espérance en est un", "Étape à franchir"],
    "car": ["Bus interurbain", "Conjonction de cause", "Transport scolaire", "Parce que", "Véhicule d'excursion"],
    "cas": ["Situation particulière", "Occurrence médicale", "Affaire à examiner", "Exemple d'école"],
    "cep": ["Pied de vigne", "Souche du vignoble", "Base de la treille"],
    "cet": ["Démonstratif masculin", "Adjectif démonstratif", "Celui-ci en adjectif"],
    "cil": ["Poil de paupière", "Frange de l'œil", "Il retient la poussière", "Protecteur du regard"],
    "clé": ["Outil de serrure", "Elle ouvre la porte", "Solution du problème", "Signe de la portée", "Outil du plombier"],
    "col": ["Passage de montagne", "Haut de chemise", "Étape du Tour de France", "Encolure", "Goulot de bouteille"],
    "coq": ["Mâle de la basse-cour", "Réveil de la ferme", "Emblème gaulois", "Chanteur de l'aube", "Séducteur du poulailler"],
    "cor": ["Instrument à vent", "Durillon du pied", "Cuivre de l'orchestre", "Il sonne la chasse"],
    "cou": ["Porte la tête", "Entre tête et épaules", "Il porte le collier", "Long chez la girafe"],
    "cri": ["Vocalisation forte", "Appel perçant", "Éclat de voix", "Tableau de Munch", "Hurlement"],
    "cru": ["Vin d'un terroir", "Non cuit", "Millésime", "Difficile à avaler", "Grand vin classé"],
    "cul": ["Postérieur familier", "Fond de bouteille", "Derrière", "Bas du sac"],
    "dam": ["Préjudice subi", "Dommage ancien", "Au grand regret", "Décamètre"],
    "duc": ["Titre nobiliaire", "Noble de haut rang", "Rapace nocturne", "Grand hibou", "Époux de la duchesse"],
    "dur": ["Solide et résistant", "Difficile", "Contraire de mou", "Sévère", "Coriace"],
    "eau": ["Liquide vital", "Elle coule du robinet", "H2O", "Boisson sans calorie", "Elle dort sous les ponts"],
    "eux": ["Pronom pluriel masculin", "Ils en complément", "Ceux-là", "Les autres"],
    "fan": ["Admirateur passionné", "Inconditionnel", "Groupie", "Supporter enthousiaste"],
    "fer": ["Métal magnétique", "Il repasse le linge", "Métal des rails", "Bâton de golf", "Symbole Fe"],
    "feu": ["Combustion vive", "Signal tricolore", "Défunt en préfixe", "Flamme", "Il crépite dans l'âtre"],
    "fil": ["Brin allongé", "Il passe dans l'aiguille", "Tranchant de la lame", "Conducteur électrique", "Suite des idées"],
    "foi": ["Croyance profonde", "Confiance absolue", "Vertu théologale", "Conviction religieuse"],
    "fou": ["Privé de raison", "Pièce des échecs", "Insensé", "Bouffon du roi", "Oiseau de mer"],
    "gaz": ["État de la matière", "Combustible de cuisine", "Il alimente la chaudière", "Ni solide ni liquide"],
    "gel": ["Eau solidifiée", "Produit coiffant", "Blocage des prix", "Givre du matin", "Il fige les cheveux"],
    "gré": ["Volonté ou consentement", "Bon vouloir", "Sa guise", "Assentiment"],
    "ici": ["En ce lieu", "À cet endroit", "Pas ailleurs", "Où je me trouve"],
    "île": ["Terre entourée d'eau", "Bout de terre en mer", "La Corse en est une", "Terre insulaire"],
    "jeu": ["Activité ludique", "Divertissement à règles", "Interprétation d'acteur", "Ensemble de cartes", "Espace entre deux pièces"],
    "kit": ["Ensemble à monter", "Meuble en pièces détachées", "Lot à assembler", "Prêt-à-monter"],
    "lac": ["Étendue d'eau intérieure", "Miroir de montagne", "Le Léman en est un", "Eau douce dormante"],
    "las": ["Fatigué", "Épuisé de tout", "Hélas sans h", "Découragé"],
    "lie": ["Dépôt au fond du fût", "Reste du vin", "Attache par un nœud", "Rebut de la société"],
    "lin": ["Plante textile", "Fibre des draps frais", "Tissu d'été", "Champ bleu de Normandie"],
    "lis": ["Fleur royale", "Emblème des rois de France", "Fleur blanche", "Parcours des yeux"],
    "lit": ["Meuble pour dormir", "Fond de la rivière", "Couche", "Il accueille les rêves", "Parcourt la page"],
    "loi": ["Règle obligatoire", "Texte voté au Parlement", "Norme juridique", "Elle est dure mais c'est elle"],
    "lot": ["Part attribuée", "Gain de tombola", "Rivière du Quercy", "Ensemble vendu en bloc", "Destin échu"],
    "lui": ["Pronom de la 3e personne", "Pronom complément", "Cet homme-là", "Pronom tonique masculin"],
    "lys": ["Fleur héraldique", "Blason des Bourbons", "Fleur de pureté", "Blanche fleur royale"],
    "mal": ["Souffrance", "Contraire du bien", "Douleur", "Difficulté", "Il ronge la conscience"],
    "mas": ["Maison provençale", "Ferme du Midi", "Bastide des oliviers", "Demeure en Camargue"],
    "mat": ["Sans éclat", "Fin de partie d'échecs", "Teint hâlé", "Non brillant", "Échec final"],
    "mer": ["Grande étendue d'eau", "Eau salée à l'horizon", "Elle borde la plage", "Domaine des marins", "Méditerranée par exemple"],
    "mie": ["Partie tendre du pain", "Cœur de la baguette", "Bien-aimée d'autrefois", "Intérieur moelleux"],
    "mil": ["Céréale africaine", "Grain du Sahel", "Mille ancien", "Sorgho cousin"],
    "mou": ["Sans fermeté", "Contraire de dur", "Flasque", "Sans énergie", "Abats pour le chat"],
    "mur": ["Cloison verticale", "Il soutient le toit", "Obstacle de pierre", "Berlin a eu le sien", "Paroi de la maison"],
    "nef": ["Vaisseau d'église", "Cœur de la cathédrale", "Navire ancien", "Allée centrale de l'église"],
    "nez": ["Milieu du visage", "Organe de l'odorat", "Flair du parfumeur", "Il précède la bouche", "Cyrano en avait un grand"],
    "nid": ["Abri d'oiseau", "Berceau de brindilles", "Refuge des oisillons", "Cachette douillette"],
    "nom": ["Mot qui désigne", "Il suit le prénom", "Patronyme", "Réputation", "Étiquette d'état civil"],
    "non": ["Refus net", "Contraire de oui", "Réponse négative", "Veto", "Désaccord franc"],
    "nos": ["Possessif pluriel", "À nous", "Les nôtres en adjectif"],
    "nul": ["Aucun et inutile", "Zéro pointé", "Sans valeur", "Match sans vainqueur", "Incompétent"],
    "œil": ["Organe de la vue", "Il cligne et observe", "Judas de porte", "Bourgeon de pomme de terre"],
    "oie": ["Palmipède", "Volaille du foie gras", "Oiseau du Capitole", "Blanche de la basse-cour", "Jeu de l'échelle et du puits"],
    "ont": ["Possèdent au présent", "Détiennent", "Sont propriétaires"],
    "ose": ["Risque ou sucre simple", "Se permet", "Brave l'interdit", "Sucre en chimie", "A du culot"],
    "oui": ["Affirmation", "Accord franc", "Réponse positive", "Consentement du marié", "Contraire de non"],
    "pal": ["Pieu pointu", "Supplice ancien", "Bande héraldique", "Piquet aiguisé"],
    "pan": ["Côté ou chute", "Morceau de mur", "Dieu des bergers", "Bruit de coup de feu", "Partie de chemise"],
    "par": ["Préposition d'agent", "Au moyen de", "Score de référence au golf", "À travers"],
    "pas": ["Mouvement ou négation", "Enjambée", "Il accompagne ne", "Allure de marche", "Détroit de Calais"],
    "pic": ["Sommet escarpé", "Oiseau frappeur", "Outil de mineur", "Pointe de montagne", "Maximum de la courbe"],
    "pie": ["Oiseau noir et blanc", "Voleuse à plumes", "Bavarde de la haie", "Robe de cheval bicolore"],
    "pin": ["Conifère résineux", "Arbre des Landes", "Parasol méditerranéen", "Bois de charpente", "Il porte des pommes"],
    "pis": ["Mamelle ou pire", "Réservoir à lait", "Plus grave encore", "Mamelle de la vache"],
    "pli": ["Marque de couture", "Courrier sous enveloppe", "Levée aux cartes", "Habitude prise", "Froissure du tissu"],
    "pou": ["Insecte parasite", "Hôte du cuir chevelu", "Fléau des écoles", "Squatteur capillaire"],
    "pré": ["Terrain herbeux", "Pâture des vaches", "Préfixe d'antériorité", "Champ à faucher", "Herbage"],
    "pus": ["Liquide d'infection", "Sécrétion de plaie", "Signe d'abcès", "Fus capable"],
    "qui": ["Pronom interrogatif", "Pronom relatif", "Il demande l'identité", "Lequel"],
    "rai": ["Rayon lumineux", "Trait de lumière", "Filet de jour", "Rayon de roue"],
    "ras": ["Coupe très courte", "Au niveau du bord", "Tondu de près", "Plein jusqu'au bord"],
    "rat": ["Rongeur", "Habitant des égouts", "Avare familier", "Danseuse de l'Opéra", "Cobaye de laboratoire"],
    "raz": ["Courant marin", "Pointe bretonne", "Marée dévastatrice", "Cap du Finistère"],
    "riz": ["Céréale asiatique", "Grain des paellas", "Base de la cantonaise", "Il pousse en paddy", "Accompagnement du curry"],
    "roc": ["Pierre dure", "Masse rocheuse", "Solide comme lui", "Bloc inébranlable"],
    "roi": ["Figure couronnée", "Souverain", "Carte au-dessus de la dame", "Majesté", "Pièce à protéger aux échecs"],
    "rot": ["Renvoi gastrique", "Éructation", "Bruit de bébé repu", "Renvoi sonore"],
    "rue": ["Voie urbaine", "Artère de la ville", "Elle a ses numéros", "Chaussée bordée de trottoirs"],
    "sac": ["Contenant souple", "Bagage à main", "Pillage ancien", "Il se porte à l'épaule", "Poche de courses"],
    "sas": ["Pièce de transition", "Écluse d'entrée", "Passage sécurisé", "Antichambre étanche", "Palindrome de passage"],
    "sec": ["Sans humidité", "Contraire de mouillé", "Maigre et nerveux", "Vin non sucré", "Ton cassant"],
    "ses": ["Possessif pluriel", "À lui au pluriel", "Les siens en adjectif"],
    "ski": ["Glisse sur neige", "Planche des pistes", "Sport d'hiver", "Il descend les pentes", "Nautique en été"],
    "soi": ["Pronom réfléchi", "Sa propre personne", "Le moi profond"],
    "sol": ["Note de musique", "Surface du plancher", "Terre sous les pieds", "Cinquième note", "Ancienne monnaie"],
    "son": ["Possessif ou bruit", "Résidu de mouture", "Ce qui s'entend", "Enveloppe du grain", "À lui"],
    "sou": ["Petite monnaie ancienne", "Pièce d'autrefois", "Économies du bas de laine", "Monnaie des radins"],
    "sur": ["Préposition de position", "Au-dessus de", "Acide au goût", "Certain sans accent", "Posé dessus"],
    "tas": ["Amas désordonné", "Monceau", "Grande quantité familière", "Pile informe", "Accumulation"],
    "ter": ["Trois fois", "Après bis", "Troisième du numéro", "Répétition supplémentaire"],
    "thé": ["Infusion chaude", "Boisson de Chine", "Breuvage de cinq heures", "Feuilles à infuser", "Rival du café"],
    "tic": ["Geste involontaire", "Manie répétée", "Mouvement nerveux", "Habitude agaçante", "Il précède tac"],
    "tir": ["Action de viser", "Frappe au but", "Discipline olympique", "Coup de feu", "Essai du footballeur"],
    "toi": ["Pronom de la 2e personne", "Tu en complément", "L'autre en face", "Pronom tonique"],
    "ton": ["Possessif ou hauteur", "Nuance de couleur", "Hauteur de la voix", "À toi", "Intonation"],
    "top": ["Sommet ou signal", "Départ chronométré", "Meilleur du classement", "Haut de gamme", "Signal de départ"],
    "tôt": ["En avance", "De bonne heure", "Avant l'heure", "Contraire de tard", "Dès l'aube"],
    "tri": ["Sélection ordonnée", "Classement des déchets", "Répartition par catégories", "Préfixe de trois", "Rangement sélectif"],
    "tué": ["Mort violemment", "Abattu", "Victime d'homicide", "Éliminé"],
    "une": ["Article féminin", "Première page du journal", "Article indéfini", "Manchette de presse"],
    "van": ["Tamis ou camionnette", "Fourgon aménagé", "Panier à vanner", "Transport de chevaux"],
    "vif": ["Plein de vie", "Rapide d'esprit", "Éclatant", "Alerte", "Piquant comme le froid"],
    "vil": ["Méprisable", "Bas et indigne", "Sans noblesse", "Abject"],
    "vin": ["Boisson du raisin", "Nectar des vignes", "Rouge ou blanc", "Il vieillit en cave", "Compagnon du fromage"],
    "vis": ["Tige filetée", "Elle se serre au tournevis", "Fixation en spirale", "Habites au présent"],
    "vol": ["Larcin ou trajet aérien", "Délit du pickpocket", "Voyage en avion", "Groupe d'oiseaux migrateurs"],
    "vos": ["Possessif pluriel", "À vous", "Les vôtres en adjectif"],
    "vue": ["Sens des yeux", "Panorama", "Elle baisse avec l'âge", "Perspective", "Opinion sur la question"],
    "yen": ["Monnaie japonaise", "Devise de Tokyo", "Argent nippon", "Il s'échange contre l'euro"],
    "zoo": ["Parc animalier", "Jardin des fauves", "Ménagerie moderne", "Refuge des espèces exotiques"],
    "usa": ["États-Unis", "Oncle Sam en sigle", "Se servit de", "Pays aux cinquante étoiles", "Élima par le frottement"],
    "dos": ["Arrière du corps", "Il porte le sac", "Verso du livre", "Colonne et omoplates"],
    "dix": ["Carte moyenne", "Chiffre rond", "Doigts des deux mains", "Note maximale", "Après neuf"],
    "ost": ["Armée féodale", "Troupe du Moyen Âge", "Service militaire vassal"],
    "ire": ["Colère soutenue", "Courroux littéraire", "Fureur ancienne", "Rage poétique"],
    "ode": ["Poème lyrique", "Chant de louange", "Vers à la gloire de", "Poème de Pindare"],
    "ego": ["Le moi conscient", "Amour-propre", "Il peut être surdimensionné", "Moi latin"],
    "ave": ["Salutation latine", "Prière à Marie", "Salut romain", "César le recevait"],
    "bey": ["Titre ottoman", "Gouverneur turc", "Seigneur de Tunis"],
    "dey": ["Souverain d'Alger", "Régent ottoman d'Alger", "Titre barbaresque"],
    "dom": ["Titre religieux", "Préfixe des moines", "Pérignon en champagne", "Titre bénédictin"],
    "gag": ["Trait comique", "Blague visuelle", "Effet comique", "Ressort du burlesque"],
    "gin": ["Alcool britannique", "Eau-de-vie de genièvre", "Base du tonic", "Spiritueux anglais"],
    "gnu": ["Bovidé africain", "Antilope à barbe", "Gibier du Serengeti", "Logiciel libre en sigle"],
    "hue": ["Cri pour faire avancer", "Ordre au cheval", "Contraire de ho", "Injonction du cocher"],
    "ouf": ["Soupir de soulagement", "Fou en verlan", "Exclamation de détente", "Ça passe juste"],
    "pur": ["Sans mélange", "Non coupé", "Innocent", "Limpide", "Cent pour cent"],
    "rab": ["Supplément servi", "Rallonge de cantine", "Extra gratuit", "Portion bonus"],
    "ria": ["Estuaire breton", "Vallée envahie par la mer", "Aber cousin"],
    "rio": ["Ville du Brésil", "Cité du Carnaval", "Fleuve espagnol", "Baie du Pain de Sucre"],
    "ris": ["Glande du veau", "Mets de la gastronomie", "Pli de voile", "Te marres au présent"],
    "rob": ["Sirop concentré", "Extrait de fruits réduit", "Confiture ancienne"],
    "tao": ["Doctrine chinoise", "Voie de Lao-Tseu", "Philosophie du yin et du yang", "Sagesse orientale"],
    "toc": ["Imitation grossière", "Faux bijou", "Bruit de porte", "Camelote", "Trouble compulsif en sigle"],
    "tuf": ["Roche volcanique tendre", "Pierre poreuse", "Matériau des carrières calcaires"],
    "yak": ["Bovin tibétain", "Bœuf de l'Himalaya", "Monture des hauts plateaux"],
    "zen": ["Calme et serein", "Bouddhisme japonais", "Détendu", "École de méditation", "Jardin de sable"],
    "zig": ["Type d'individu", "Drôle de gars", "Gaillard familier", "Il précède zag"],
    "emu": ["Grand oiseau", "Coureur australien", "Cousin de l'autruche", "Touché sans accent"],
    "lou": ["Loup sans p", "Prénom féminin", "Provençal pour l'article", "Reed du rock"],
    "can": ["Canada", "Ottawa sur les plaques", "Coupe d'Afrique en sigle"],
    "dol": ["Dollar abrégé", "Tromperie juridique", "Manœuvre frauduleuse", "Unité de douleur"],
    "usd": ["Dollar américain", "Devise de Washington", "Billet vert en sigle"],
    "gbp": ["Livre sterling", "Devise de Londres", "Monnaie britannique en sigle"],
    "chf": ["Franc suisse", "Devise de Berne", "Monnaie helvétique en sigle"],
    "ino": ["Prénom mythologique", "Fille de Cadmos", "Nourrice de Dionysos"],
    "luc": ["Évangéliste", "Auteur d'un Évangile", "Compagnon de Paul", "Besson du cinéma"],
    "uno": ["Jeu de cartes", "Un espagnol", "Partie aux cartes colorées"],
    "hop": ["Petit saut", "Interjection de bond", "Allez en un mot", "Signal de saut"],
    "aï": ["Paresseux", "Mammifère lent", "Habitant des branches", "Dormeur d'Amazonie"],
    "hé": ["Interpellation", "Appel de loin", "Interjection d'alerte"],
    "nô": ["Théâtre japonais", "Drame masqué nippon", "Scène de Kyoto"],
    "rê": ["Dieu du soleil", "Divinité égyptienne", "Ra autrement"],
    "onu": ["Organisation mondiale", "Assemblée de New York", "Casques bleus en sigle", "Machin de De Gaulle"],
    "oms": ["Santé mondiale", "Agence de Genève", "Gardienne sanitaire en sigle"],
    "mhz": ["Mégahertz", "Fréquence radio", "Million de cycles par seconde"],
    "ghz": ["Gigahertz", "Fréquence de processeur", "Milliard de hertz"],
    "kwh": ["Kilowattheure", "Unité du compteur électrique", "Mesure de consommation"],
    "mwh": ["Mégawattheure", "Production de centrale", "Mille kilowattheures"],
    "atm": ["Atmosphère", "Unité de pression", "Pression au niveau de la mer"],
    "lux": ["Unité d'éclairement", "Mesure de la lumière", "Luxembourg sur les plaques", "Latin pour lumière"],
    "tau": ["Lettre grecque (19e)", "Croix de saint Antoine", "Particule de physicien"],
    "phi": ["Lettre grecque (21e)", "Nombre d'or en symbole", "Initiale grecque de la philosophie"],
    "psi": ["Lettre grecque (23e)", "Symbole de la psychologie", "Trident grec"],
    "rho": ["Lettre grecque (17e)", "R des Hellènes", "Densité en physique"],
    "khi": ["Lettre grecque (22e)", "X des Hellènes", "Test statistique du carré"],
    "eut": ["Posséda jadis", "Passé simple d'avoir", "Obtint autrefois"],
    "fut": ["Tonneau ou verbe être", "Exista jadis", "Passé simple d'être", "Tonneau sans accent"],
    "lia": ["Attacha jadis", "Noua autrefois", "Unit par un lien", "Épaissit la sauce"],
    "nia": ["Refusa jadis", "Contesta autrefois", "Rejeta l'accusation", "Démentit"],
    "ils": ["Pronom masculin pluriel", "Eux au sujet", "Troisième personne du pluriel"],
    "les": ["Article défini pluriel", "Pronom complément pluriel", "Déterminant du pluriel"],
    "ré": ["Île charentaise", "Deuxième note", "Note après do", "Île au pont célèbre", "Préfixe de retour"],
    "dé": ["Cube à six faces", "Protège-doigt du couturier", "Il roule sur le tapis vert", "Cube à points"],
    "dû": ["Ce que l'on doit", "Dette à régler", "Participe de devoir", "Somme exigible"],
    "là": ["Adverbe de lieu", "À cet endroit", "Pas ici", "Il pointe l'endroit"],
    "né": ["Venu au monde", "Sorti du berceau", "Apparu à l'état civil"],
    "où": ["Marque le lieu", "Adverbe interrogatif de lieu", "En quel endroit", "Pronom relatif de lieu"],
    "té": ["Règle d'équerre ou note", "Outil du dessinateur", "Équerre en T", "Si des solfèges anciens"],
    "mme": ["Titre abrege", "Madame en raccourci", "Devant le nom d'une dame"],
    "ste": ["Titre abrege", "Sainte en raccourci", "Société en abrégé"],
}


def main() -> None:
    entries = {
        w: clues for w, clues in ENTRIES.items()
        if "placeholder" not in clues and not w.endswith("_unused")
    }
    for w, clues in entries.items():
        assert len(clues) == len(set(clues)), f"duplicate clue for {w!r}"
        assert all(clues), f"empty clue for {w!r}"

    with WORDLIST.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
        fieldnames = list(rows[0].keys())

    # Rows grouped case-insensitively; the first row per word is the primary
    # (keeps original casing/frequency), later source=bliss rows are treated
    # as replaceable multi-clue duplicates from a previous run.
    primary: dict[str, dict] = {}
    out_rows: list[dict] = []
    dropped_dups = 0
    for r in rows:
        key = r["word"].strip().lower()
        if key in entries and key in primary and r.get("source") == "bliss":
            dropped_dups += 1
            continue
        if key not in primary:
            primary[key] = r
        out_rows.append(r)

    updated = 0
    added_words = 0
    added_rows = 0
    for word, clues in entries.items():
        base = primary.get(word)
        if base is not None:
            base["clue"] = clues[0]
            base["source"] = "bliss"
            base["source_license"] = "CC0-1.0"
            if not (base.get("lemma") or "").strip():
                base["lemma"] = base["word"]
            updated += 1
        else:
            base = {k: "" for k in fieldnames}
            base["word"] = word
            base["language"] = "fr"
            base["length"] = str(len(word))
            base["frequency"] = "100000"
            base["clue"] = clues[0]
            base["source"] = "bliss"
            base["source_license"] = "CC0-1.0"
            base["lemma"] = word
            out_rows.append(base)
            added_words += 1
        for clue in clues[1:]:
            dup = dict(base)
            dup["clue"] = clue
            out_rows.append(dup)
            added_rows += 1

    with WORDLIST.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        for r in out_rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})

    print(f"overlay words:            {len(entries)}")
    print(f"updated primary rows:     {updated}")
    print(f"new words added:          {added_words}")
    print(f"extra clue rows appended: {added_rows}")
    print(f"stale bliss dups dropped: {dropped_dups}")
    print(f"total wordlist rows:      {len(out_rows)}")


if __name__ == "__main__":
    main()
