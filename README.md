# Kierownik Budowy — aplikacja na telefon

Aplikacja do codziennej pracy kierownika budowy. Działa w przeglądarce telefonu, można ją
zainstalować na ekranie głównym jak zwykłą aplikację (Android i iPhone), działa **bez internetu**,
a wszystkie dane (także zdjęcia) są zapisywane **lokalnie na telefonie**.

## Funkcje

- **Pulpit** — dzień budowy, dni do końca, otwarte zadania, zadania po terminie, otwarte usterki,
  liczba osób na budowie dziś, lista kontrolna dnia (dziennik / obecność / dostawy), szybkie akcje.
- **Obchód** — szybkie zdjęcia w terenie z krótkim opisem, rodzajem (uwaga, zastrzeżenie, element zakrywany,
  dostawa, BHP) i lokalizacją. W biurze: lista „do rozpatrzenia”, zaznaczenie kilku zdjęć → jedno zadanie
  dla osoby odpowiedzialnej (zdjęcia przechodzą do zadania) albo odłożenie do dokumentacji.
- **Dziennik budowy** — wpisy dzienne: pogoda (przycisk *Pobierz* uzupełnia pogodę z GPS),
  temperatura, liczba pracowników, wykonane roboty, sprzęt, kontrole i wizyty, problemy, plan na jutro, zdjęcia.
- **Zadania** — odpowiedzialny, priorytet, statusy (do zrobienia / przekazane / w toku / zrobione),
  daty zgłoszenia, przekazania, terminu i realizacji z licznikiem dni po terminie; wysyłka zadania
  ze zdjęciami do odpowiedzialnego (WhatsApp, SMS, e-mail); filtr po odpowiedzialnym i zestawienie do PDF.
- **Usterki** — lokalizacja, wykonawca odpowiedzialny, termin usunięcia, zdjęcia;
  z pulpitu „Usterka ze zdjęciem” od razu otwiera aparat.
- **Dostawy materiałów** — materiał, ilość, dostawca, nr WZ, przyjęcie z zastrzeżeniami, zdjęcia dokumentów.
- **Obecność brygad** — firmy, liczba osób, godziny, automatyczne sumy roboczogodzin.
- **Notatki i ustalenia** — narady, ustalenia z inwestorem, polecenia.
- **Kontakty** — wspólne dla wszystkich budów, przyciski *Zadzwoń* i *SMS*.
- **Raport dzienny** — zbiera wszystko z wybranego dnia (dziennik, obecność, dostawy, usterki,
  zakończone zadania, notatki, zdjęcia) → druk / zapis do PDF lub udostępnienie tekstem (WhatsApp, SMS, e-mail).
- **Wiele budów** — przełączanie w górnym pasku, archiwum zakończonych budów.
- **Zdjęcia** — automatycznie zmniejszane i opisywane datą i godziną wykonania.
- **Kopia zapasowa** — eksport wszystkich danych ze zdjęciami do pliku i przywracanie z pliku.
- Tryb ciemny zgodny z ustawieniami telefonu.

## Jak uruchomić na telefonie

Aplikację trzeba raz opublikować pod adresem https — najprościej przez GitHub Pages (za darmo):

1. W repozytorium na GitHubie: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Scal zmiany do gałęzi `main` — workflow `.github/workflows/pages.yml` sam opublikuje aplikację.
3. Otwórz na telefonie adres `https://<twoja-nazwa>.github.io/<repozytorium>/`.
4. Zainstaluj:
   - **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację* / *Dodaj do ekranu głównego*,
   - **iPhone (Safari):** *Udostępnij* → *Do ekranu początkowego*.

Od tej chwili aplikacja uruchamia się z ikony i działa także bez zasięgu.

> **Ważne:** dane są tylko na tym telefonie. Rób regularnie kopię zapasową
> (*Więcej → Kopia zapasowa i ustawienia → Eksportuj kopię*) i zapisz plik np. na Dysku Google.

## Uruchomienie lokalne (dla programisty)

Nie wymaga instalowania żadnych zależności ani budowania:

```bash
python3 -m http.server 8000
# otwórz http://localhost:8000
```

## Struktura

| Plik | Opis |
|---|---|
| `index.html` | szkielet aplikacji |
| `css/styles.css` | wygląd (duże przyciski, tryb ciemny, styl wydruku raportu) |
| `js/db.js` | zapis danych w IndexedDB |
| `js/schema.js` | definicje modułów i pól formularzy — tu najłatwiej dodać nowe pole |
| `js/app.js` | widoki, formularze, zdjęcia, raport, kopia zapasowa |
| `js/walk.js` | obchód, rozpatrywanie spostrzeżeń, wysyłka i zestawienie zadań |
| `sw.js` | praca offline (po zmianie plików podbij wersję `CACHE`) |
| `manifest.webmanifest`, `icons/` | instalacja jako aplikacja |
