# 🌿 ST-PRO — Application de Gestion d'Arrosage et d'Entretien d'Espaces Verts

> Application Android mobile pour la gestion professionnelle des interventions d'arrosage et d'entretien d'espaces verts.

---

## 📱 Fonctionnalités

- **Tableau de bord** — Vue d'ensemble des interventions du jour et de la semaine
- **Gestion des interventions** — Planifier, suivre et facturer chaque passage
- **Gestion des contrats** — Créer des contrats récurrents avec calendrier personnalisé
- **Gestion des clients** — Fiche client avec GPS, téléphone, plantes et formule
- **Géolocalisation** — Carte interactive avec tous les domiciles clients
- **Itinéraires GPS** — Navigation directe vers le client depuis l'application
- **Reçus officiels** — Génération et envoi par WhatsApp
- **Historique & Bilans** — Suivi financier par période
- **Base de données locale** — Données stockées sur l'appareil (IndexedDB)

---

## 🏢 Informations de l'entreprise

| Champ | Valeur |
|---|---|
| **Entreprise** | ST-PRO Services Techniques Professionnels |
| **Ville** | Niamey, Niger |
| **Téléphone** | +227 76 75 74 68 / 91 99 04 66 |
| **Email** | stpro8481@gmail.com |
| **NIF** | 141576 /P |
| **RCCM** | NE/NIM/01/2025/A10/02064 |

---

## 🛠️ Stack Technique

- **Framework** : Apache Cordova 13
- **Plateforme** : Android
- **Base de données** : IndexedDB (locale, sur l'appareil)
- **Cartographie** : Leaflet.js
- **UI** : HTML5 / CSS3 / JavaScript Vanilla
- **Icons** : Font Awesome 6.5

---

## 🚀 Installation & Compilation

### Prérequis
- Node.js + npm
- Java JDK 17 ou 21
- Android SDK (`C:\Android`)
- Cordova CLI : `npm install -g cordova`

### Compilation de l'APK

```bash
# Cloner le projet
git clone https://github.com/chamsoudine-dev/l-appli-de-ST-PRO.git
cd l-appli-de-ST-PRO

# Installer les dépendances
npm install

# Ajouter la plateforme Android
npx cordova platform add android

# Compiler l'APK
npx cordova build android
```

L'APK se trouve dans :
```
platforms/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 🔄 Processus de mise à jour

Pour chaque nouvelle version :

1. Modifier les fichiers dans `www/`
2. Dans `config.xml`, incrémenter :
   - `version="1.0.0"` → `"1.1.0"`
   - `android-versionCode="1"` → `"2"`
3. Compiler et envoyer l'APK au client

```bash
git add .
git commit -m "✨ v1.1.0 - Description des changements"
git push
npx cordova build android
```

> ✅ Les données du client (IndexedDB) sont **conservées** lors d'une mise à jour sans désinstallation.

---

## 📦 Versions

| Version | versionCode | Date | Notes |
|---|---|---|---|
| 1.0.0 | 1 | Juin 2026 | Version initiale |

---

## 📄 Licence

Propriété de **ST-PRO Services Techniques Professionnels** — Tous droits réservés.
