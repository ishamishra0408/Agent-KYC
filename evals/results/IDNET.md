# The IDNet round: can the reader tell a forged licence from a genuine one?

Run 2026-09-29T23:23:40.888Z · reader `app` · 150 images from IDNet (synthetic South Dakota driving licences, CC0) · spent $0.1736 · 10.0 s an image

**Forgeries reported as edited: 15 of 120, 10 of them on the forged copy only. Genuine licences wrongly reported: 2 of 30.** A report sends the case to a person (policy v6); it never rejects anyone.

| Images | Reported as edited | Forged copy only | Unanswered |
|---|---|---|---|
| Genuine (30) | 2 of 30 | — | 0 |
| Text copied over from another licence (30) | 2 of 30 | 1 | 0 |
| Portrait morphed with another face (30) | 5 of 30 | 3 | 0 |
| Portrait replaced (30) | 1 of 30 | 1 | 0 |
| Text and portrait both changed (30) | 7 of 30 | 5 | 0 |

Each forgery is a genuine licence in the sample, changed. "Forged copy only" counts a report on the forgery when the same licence's genuine copy wasn't reported: a report on both copies is about the licence, not the edit.

| Read by | Genuine: reported | Forged: reported |
|---|---|---|
| gemma-4-31b-it | 2 of 29 | 6 of 104 |
| claude-sonnet-5.5 | 0 of 1 | 9 of 16 |

The app's reader is a chain: the fallback model reads only what the first was slow on or failed, so its row is a small, uneven sample.

The licences aren't Indian, and the reader's prompt is written for Indian documents; what's measured here is only whether it notices editing.

Every report:

- Genuine, generated.photos_v3_0111624.png (gemma-4-31b-it): "Height field '7'-10"' is inconsistent with the portrait"
- Genuine, generated.photos_v3_0865316.png (gemma-4-31b-it): "Height field '7'-02"' is inconsistent with the portrait"
- Text copied over from another licence, generated.photos_v3_0059837.png (claude-sonnet-5.5): "Licence number and DOB are in red, while other fields are black. EXP date, class, endorsements, restrictions and sex are in a larger bold font than the rest of the text."
- Text copied over from another licence, generated.photos_v3_0111624.png (claude-sonnet-5.5): "Expiry date 10/24/2025 is larger and bolder than the issue date. Class, endorsements, restrictions, height, weight and eye colour are in a heavier font than the other text. Licence number and DOB are in red. Ghost portrait overlaps the sex and eyes text."
- Portrait morphed with another face, generated.photos_v3_0059837.png (gemma-4-31b-it): "Height listed as 7'-10""
- Portrait morphed with another face, generated.photos_v3_0111624.png (gemma-4-31b-it): "HGT field value '7'-10"' is highly improbable and appears inconsistent with the portrait"
- Portrait morphed with another face, generated.photos_v3_0198801_0420100_0306439.png (claude-sonnet-5.5): "Main portrait sits on a flat blue block that looks pasted in, and the small ghost portrait box covers part of the SEX field. Licence number and DOB are in red while the other fields are black."
- Portrait morphed with another face, generated.photos_v3_0538341.png (gemma-4-31b-it): "Height field '7'-07"' is inconsistent with the portrait"
- Portrait morphed with another face, generated.photos_v3_0865316.png (gemma-4-31b-it): "Height field '7'-02"' is inconsistent with the portrait"
- Portrait replaced, generated.photos_v3_0903468_0939104_0272385.png (claude-sonnet-5.5): "Portrait shows a young child, which does not fit a 1991 date of birth. Text appears to be in a different font and colour from the rest of the document."
- Text and portrait both changed, generated.photos_v3_0059837.png (gemma-4-31b-it): "Height field '7'-10"' is in a different font weight and size compared to other data fields"
- Text and portrait both changed, generated.photos_v3_0111624.png (gemma-4-31b-it): "Height '7'-10"' is inconsistent with the portrait"
- Text and portrait both changed, generated.photos_v3_0328996.png (claude-sonnet-5.5): "Expiry date 03/25/2028 is in a larger, bolder font than the issue date beside it; the licence number and DOB are in red."
- Text and portrait both changed, generated.photos_v3_0538341.png (claude-sonnet-5.5): "Licence number and DOB are in dark red while other fields are black; expiry date is in a larger, bolder font than the issue date"
- Text and portrait both changed, generated.photos_v3_0651772.png (claude-sonnet-5.5): "Licence number and DOB are in red, unlike the black text elsewhere. Expiry date is in a larger, bolder font than the issue date. Class, End and Restrictions values also look bolder than the labels."
- Text and portrait both changed, generated.photos_v3_0865316.png (claude-sonnet-5.5): "Licence number and DOB are in red while the other fields are black; name, address and expiry look like a different font and weight from the rest of the card"
- Text and portrait both changed, generated.photos_v3_0970065.png (claude-sonnet-5.5): "Expiry date is in a larger, bolder font than the issue date; licence number and DOB are in red while other fields are black"
