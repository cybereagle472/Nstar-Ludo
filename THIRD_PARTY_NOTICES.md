# Third-party notices and asset provenance

## LudoVerse reference assets

The following files were copied from [jamalihassan0307/LudoVerse](https://github.com/jamalihassan0307/LudoVerse), reference commit `03bac98854734d09218e89b7d61d252b8b01fa77`, to honor the requested visual and sound reference:

- `assets/images/board.png`
- `assets/images/dice/*`
- `assets/images/crown/*` and `assets/images/thankyou.gif` (included for reference; the new victory screen uses newly drawn badges instead)
- `assets/reference-logo.jpg` (included for reference, not used as Nstar branding)
- `assets/sounds/roll_the_dice.mp3`, `assets/sounds/move.wav`, and `assets/sounds/laugh.mp3`

The upstream repository did **not** contain a license file when inspected. A public repository is not, by itself, a grant of copyright permission. The rights to the board, dice, audio, photographs, memes, and other bundled upstream material are therefore **unverified**; some may belong to third parties. Obtain the necessary permission or replace these assets before distributing or publishing the project. The MIT license in this repository applies only to the newly authored Nstar Ludo code and original icons, not these upstream files.

The upstream APK and screenshots are not included; they were used only to inspect the reference. The original Flutter source was not present in the linked repository.

## Roboto font

`assets/fonts/roboto-latin.woff2` is Roboto, obtained from Google Fonts. It is distributed under the SIL Open Font License 1.1; the license text is included at `assets/fonts/ROBOTO-OFL.txt`.

## Original NStar artwork and audio

`assets/boards/nstar-board.svg` is newly drawn for NStar Ludo, based on the game's 15-by-15 board coordinates. `assets/generated/ludo-hero.jpg` and `assets/generated/room-background.jpg` are original AI-generated artwork made for this project. `assets/sounds/victory.wav` is a newly synthesized chime. These assets are not copies of Yalla Ludo artwork. The legacy meme images from the reference are retained only for reference and are not shown in the game.

## Supabase JavaScript SDK

`vendor/supabase-js.mjs` is a browser bundle of `@supabase/supabase-js` 2.118.0 and its dependencies. Supabase packages are MIT-licensed; included dependency license texts are in `vendor/DEPENDENCY-LICENSES.txt` and `vendor/SUPABASE-LICENSE.txt`.
