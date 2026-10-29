# Third-party notices and asset provenance

## LudoVerse reference assets

The following files were copied from [jamalihassan0307/LudoVerse](https://github.com/jamalihassan0307/LudoVerse), reference commit `03bac98854734d09218e89b7d61d252b8b01fa77`, to honor the requested visual and sound reference:

- `assets/images/board.png`
- `assets/images/dice/*`
- `assets/images/crown/*` and `assets/images/thankyou.gif` (included for reference; the new victory screen uses newly drawn badges instead)
- `assets/reference-logo.jpg` (included for reference, not used as Nstar branding)
- `assets/sounds/*`

The upstream repository did **not** contain a license file when inspected. A public repository is not, by itself, a grant of copyright permission. The rights to the board, dice, audio, photographs, memes, and other bundled upstream material are therefore **unverified**; some may belong to third parties. Obtain the necessary permission or replace these assets before distributing or publishing the project. The MIT license in this repository applies only to the newly authored Nstar Ludo code and original icons, not these upstream files.

The upstream APK and screenshots are not included; they were used only to inspect the reference. The original Flutter source was not present in the linked repository.

## Roboto font

`assets/fonts/roboto-latin.woff2` is Roboto, obtained from Google Fonts. It is distributed under the SIL Open Font License 1.1; the license text is included at `assets/fonts/ROBOTO-OFL.txt`.

## Firebase SDK

When and only when the user configures Firebase, `auth.js` loads the official Firebase web SDK from Google's CDN at runtime. No Firebase SDK files or project credentials are bundled in this repository. Consult the SDK's upstream terms and the Firebase project policies for a deployment.

## Supabase JavaScript SDK

`vendor/supabase-js.mjs` is a browser bundle of `@supabase/supabase-js` 2.118.0 and its dependencies. Supabase packages are MIT-licensed; included dependency license texts are in `vendor/DEPENDENCY-LICENSES.txt` and `vendor/SUPABASE-LICENSE.txt`.
