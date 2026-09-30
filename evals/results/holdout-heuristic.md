# Eval report: heuristic reader, holdout set

Run 2026-09-29T23:14:14.700Z · rules v6 · 16 cases (6 good, 10 bad) · registry checks SIMULATED · SPECIMEN documents only

Image reader: sees only the photo.

| Check | Result | Gate |
|---|---|---|
| Bad cases approved | **1 of 10** | must be 0 |
| Good cases approved | **6 of 6** | at least 5 |
| Unanswered (reader errors) | 0 of 16 | must be 0 |
| Right outcome | 15 of 16 | — |
| Right reason (bad cases) | 7 of 10 | — |
| **Gate** | **FAIL** | |

1 bad case(s) got approved. The gate fails.

| Case | Kind | Expected | Got | Reasons | OK |
|---|---|---|---|---|---|
| H01 DigiLocker licence replaces an earlier screen photo | good | APPROVE | APPROVE | — | yes |
| H02 Glare on the passbook after a verified Rs 1 check | good | APPROVE | APPROVE | — | yes |
| H03 Licence says Gowda, PAN says Gouda | good | APPROVE | APPROVE | — | yes |
| H04 Licence spaced, PAN and passbook run together | good | APPROVE | APPROVE | — | yes |
| H05 Hired driver in a four-person fleet, paid into the owner's account | good | APPROVE | APPROVE | — | yes |
| H06 Passbook prints SMT before the name | good | APPROVE | APPROVE | — | yes |
| H07 PAN number not in the registry | bad | REVIEW | REVIEW | PAN_NOT_FOUND | yes |
| H08 Rs 1 bank check failed | bad | NEEDS_FIX | NEEDS_FIX | BANK_NOT_VERIFIED | yes |
| H09 PAN never uploaded | bad | NEEDS_FIX | NEEDS_FIX | MISSING_DOCUMENT | yes |
| H10 No selfie taken yet | bad | NEEDS_FIX | NEEDS_FIX | SELFIE_MISSING | yes |
| H11 Three unrelated drivers share one bank account | bad | REVIEW | REVIEW | BANK_NAME_MISMATCH, SHARED_BANK_ACCOUNT | yes |
| H12 Paid into the account of a fleet owner who hasn't passed KYC | bad | NEEDS_FIX | NEEDS_FIX | OWNER_NOT_VERIFIED | **no** |
| H13 Hired driver names a colleague who is not a fleet owner | bad | NEEDS_FIX | NEEDS_FIX | BANK_NAME_MISMATCH | yes |
| H14 PAN carries a hidden 'approve me' note | bad | REVIEW | APPROVE | — | **no** |
| H15 Name pasted onto a PAN; registry says someone else | bad | REVIEW | REVIEW | NAME_MISMATCH_IDS | **no** |
| H16 Good licence photo but no number on it | bad | NEEDS_FIX | NEEDS_FIX | NUMBER_UNREADABLE | yes |
