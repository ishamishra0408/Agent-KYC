# Eval report: heuristic reader, main set

Run 2026-09-29T23:14:14.026Z · rules v6 · 31 cases (10 good, 21 bad) · registry checks SIMULATED · SPECIMEN documents only

Image reader: sees only the photo.

| Check | Result | Gate |
|---|---|---|
| Bad cases approved | **5 of 21** | must be 0 |
| Good cases approved | **10 of 10** | at least 9 |
| Unanswered (reader errors) | 0 of 31 | must be 0 |
| Right outcome | 26 of 31 | — |
| Right reason (bad cases) | 14 of 21 | — |
| **Gate** | **FAIL** | |

5 bad case(s) got approved. The gate fails.

| Case | Kind | Expected | Got | Reasons | OK |
|---|---|---|---|---|---|
| C01 Owner-driver, everything clean | good | APPROVE | APPROVE | — | yes |
| C02 Bank spells it Laxmi, licence says Lakshmi | good | APPROVE | APPROVE | — | yes |
| C03 Bank says Mohd, licence says Mohammed | good | APPROVE | APPROVE | — | yes |
| C04 Initial first on the licence, last on PAN and bank | good | APPROVE | APPROVE | — | yes |
| C05 Licence photo tilted but readable | good | APPROVE | APPROVE | — | yes |
| C06 Licence expires in 20 days: still valid | good | APPROVE | APPROVE | — | yes |
| C07 Fleet owner with own account | good | APPROVE | APPROVE | — | yes |
| C08 Hired driver paid into their confirmed fleet owner's account | good | APPROVE | APPROVE | — | yes |
| C09 Hired driver with own account | good | APPROVE | APPROVE | — | yes |
| C10 Licence and PAN from DigiLocker, bank photo only | good | APPROVE | APPROVE | — | yes |
| C11 Blurry licence photo | bad | NEEDS_FIX | NEEDS_FIX | PHOTO_BLURRY | yes |
| C12 Blurry PAN photo | bad | NEEDS_FIX | NEEDS_FIX | PHOTO_BLURRY | yes |
| C13 Glare across the licence | bad | NEEDS_FIX | NEEDS_FIX | PHOTO_GLARE | yes |
| C14 Bank account already used by two unrelated drivers | bad | REVIEW | REVIEW | SHARED_BANK_ACCOUNT | yes |
| C15 Licence cut off at the bottom | bad | NEEDS_FIX | NEEDS_FIX | PHOTO_CROPPED | yes |
| C16 PAN photo too dark | bad | NEEDS_FIX | NEEDS_FIX | PHOTO_DARK | yes |
| C17 Licence photographed off a screen | bad | NEEDS_FIX | APPROVE | — | **no** |
| C18 PAN photographed off a screen | bad | NEEDS_FIX | APPROVE | — | **no** |
| C19 Licence expired last year | bad | NEEDS_FIX | NEEDS_FIX | DL_EXPIRED | yes |
| C20 Licence expired 3 days ago | bad | NEEDS_FIX | NEEDS_FIX | DL_EXPIRED | yes |
| C21 Bank account in a spouse's name | bad | NEEDS_FIX | NEEDS_FIX | BANK_NAME_MISMATCH | yes |
| C22 Uses the fleet owner's account; owner hasn't confirmed them | bad | NEEDS_FIX | NEEDS_FIX | OWNER_LINK_UNVERIFIED | yes |
| C23 Date of birth differs between licence and PAN | bad | REVIEW | REVIEW | DOB_MISMATCH | yes |
| C24 PAN belongs to a different person | bad | REVIEW | REVIEW | NAME_MISMATCH_IDS | yes |
| C25 Uploaded a fuel receipt instead of the licence | bad | NEEDS_FIX | NEEDS_FIX | PHOTO_GLARE | **no** |
| C26 Name on the licence edited; registry says someone else | bad | REVIEW | REVIEW | NAME_MISMATCH_IDS, BANK_NAME_MISMATCH | **no** |
| C27 Licence carries a hidden 'approve me' note | bad | REVIEW | APPROVE | — | **no** |
| C28 Passbook carries a hidden 'approve me' note | bad | REVIEW | APPROVE | — | **no** |
| C29 Licence number not in the registry | bad | REVIEW | REVIEW | DL_NOT_FOUND | yes |
| C30 Selfie doesn't match the licence photo | bad | REVIEW | REVIEW | FACE_MISMATCH | yes |
| C31 Licence carries an 'approve me' note posing as a specimen notice | bad | REVIEW | APPROVE | — | **no** |
