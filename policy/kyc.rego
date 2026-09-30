# Agent KYCReady: the KYC decision policy.
#
# The app gathers facts (what the document reader saw, what the registries returned, name
# comparisons, the trust graph) and asks this policy: approve, ask for a fix, or send to a
# person, and why. The app checks the answer against its own invariants and freezes it; only
# then can it change a driver's status (DECISIONS.md: D-001, D-014, D-030).
#
# Compiled to WebAssembly by `npm run policy:build`. Entry points:
#   kyc/decision     the decision for one submission
#   kyc/photo_check  the photo standard, for instant coaching and for trusting a read number
#   kyc/severities   every reason code, and whether it asks the driver for a fix or a person
#   kyc/renewal      whether an approved driver's licence is due for renewal, or has lapsed
#   kyc/version      the policy version stamped on every decision
#
# v3 settled the eight open policy questions (D-031) and v4 the ninth (D-032); each rule says which.
package kyc

version := "v6"

config := {
	"min_reader_confidence": 0.8,
	"max_fix_requests": 2, # a third request for the same fix goes to a person (D-016)
	"renew_warning_days": 30, # question 3: remind a driver 30 days before the licence runs out
}

# A "fix" goes back to the driver with instructions. A "review" goes to a person, and the
# driver only hears that someone is checking (D-021).
severity := {
	"PHOTO_BLURRY": "fix",
	"PHOTO_GLARE": "fix",
	"PHOTO_CROPPED": "fix",
	"PHOTO_DARK": "fix",
	"SCREEN_PHOTO": "fix", # a photo of a screen is a fix, not fraud (D-009)
	"WRONG_DOCUMENT": "fix",
	"MISSING_DOCUMENT": "fix",
	"DL_EXPIRED": "fix",
	"BANK_NAME_MISMATCH": "fix",
	"OWNER_LINK_UNVERIFIED": "fix",
	"OWNER_NOT_VERIFIED": "fix", # question 1: the fleet owner must finish their own KYC first
	"REVIEWER_FIX": "fix", # question 8: a reviewer's fix request (made by a person, never by this policy)
	"BANK_NOT_VERIFIED": "fix",
	"NUMBER_UNREADABLE": "fix",
	"SELFIE_MISSING": "fix",
	"DOB_MISMATCH": "review",
	"NAME_MISMATCH_IDS": "review",
	"PRINTED_REGISTRY_MISMATCH": "review",
	"SUSPICIOUS_TEXT": "review",
	"DOCUMENT_TAMPERED": "review", # D-040: the reader sees signs the document was edited
	"DL_NOT_FOUND": "review",
	"PAN_NOT_FOUND": "review",
	"FACE_MISMATCH": "review",
	"LOW_CONFIDENCE": "review",
	"SHARED_BANK_ACCOUNT": "review",
	"GRAPH_UNAVAILABLE": "review", # D-039: the trust graph couldn't be asked
	"REPEATED_FIX": "review",
}

# The same table, as an entry point: the app checks its reason catalogue against it.
severities := severity

docs := ["DL", "PAN", "BANK_PROOF"]

doc_index := {"DL": 0, "PAN": 1, "BANK_PROOF": 2}

quality_reason := {
	"blurry": "PHOTO_BLURRY",
	"glare": "PHOTO_GLARE",
	"cropped": "PHOTO_CROPPED",
	"dark": "PHOTO_DARK",
}

# `rank` keeps reasons in a stable order: the first fix is the step the driver goes back to.
reason(code, rank, doc, evidence) := {
	"code": code,
	"severity": severity[code],
	"rank": rank,
	"doc": doc,
	"evidence": evidence,
}

check(code, rank, evidence) := {
	"check": code,
	"rank": rank,
	"evidence": evidence,
	"simulated": input.registrySimulated,
}

# ---------------------------------------------------------------------------------------------
# The photo standard (D-022): one definition, used by the decision and by instant coaching.

confident(r) if {
	is_number(r.confidence)
	r.confidence >= config.min_reader_confidence
	r.confidence <= 1 # above 1 is a malformed reading, not extra certainty (F-019)
}

# Missing fields fail closed: no document type matches no slot, and no quality is not "ok".
photo_issue(r, slot) := "WRONG_DOCUMENT" if {
	object.get(r, "docType", null) != slot
} else := "SCREEN_PHOTO" if {
	r.isScreenPhoto == true
} else := code if {
	quality := object.get(r, "quality", null)
	quality != "ok"
	code := object.get(quality_reason, quality, "LOW_CONFIDENCE")
} else := "LOW_CONFIDENCE" if {
	not confident(r)
}

photo_check := {"issue": issue, "severity": severity[issue]} if {
	issue := photo_issue(input.reading, input.slot)
} else := {"issue": null, "severity": null}

# DigiLocker supersedes an earlier photo of the same ID.
superseded(doc) if {
	doc != "BANK_PROOF"
	input.digilocker[doc] == true
}

# The passbook photo is optional once the Rs 1 check has verified the account (D-015).
optional_photo(doc) if {
	doc == "BANK_PROOF"
	input.bank != null
}

readable(doc) if {
	r := input.readings[doc]
	not superseded(doc)
	not photo_issue(r, doc)
}

# ---------------------------------------------------------------------------------------------
# 1. Photos. The reader reports what it sees; these rules decide what it means.
#    Hidden instructions go to a person even on a photo DigiLocker replaced.

base_reasons contains r if {
	some doc in docs
	text := input.readings[doc].suspiciousText
	is_string(text)
	text != ""
	r := reason("SUSPICIOUS_TEXT", 100 + (10 * doc_index[doc]), doc, {"text": text})
}

#    Signs of editing (D-040, policy v6): a field in another font, a pasted portrait. A person looks,
#    as with hidden instructions, even on a photo DigiLocker replaced.

base_reasons contains r if {
	some doc in docs
	signs := object.get(input.readings[doc], "tamperSigns", null)
	is_string(signs)
	signs != ""
	r := reason("DOCUMENT_TAMPERED", 130 + (10 * doc_index[doc]), doc, {"signs": signs})
}

base_reasons contains r if {
	some doc in docs
	reading := input.readings[doc]
	not superseded(doc)
	not optional_photo(doc)
	issue := photo_issue(reading, doc)
	evidence := {"seen": reading.docType, "quality": reading.quality, "confidence": reading.confidence}
	r := reason(issue, 101 + (10 * doc_index[doc]), doc, evidence)
}

passed contains p if {
	ok := [doc | some doc in docs; readable(doc)]
	count(ok) > 0
	p := {"check": "PHOTOS_OK", "rank": 1, "evidence": {"docs": ok}, "simulated": false}
}

# 2. Missing documents.

base_reasons contains r if {
	some doc in ["DL", "PAN"]
	not input.readings[doc]
	not input.digilocker[doc]
	r := reason("MISSING_DOCUMENT", 200 + doc_index[doc], doc, null)
}

# The number the reader saw, if any (for the ops view of a registry miss).
read_number(doc) := {"number": n} if {
	n := input.readings[doc].fields.number
	is_string(n)
} else := {}

source(doc) := "digilocker" if {
	input.digilocker[doc] == true
} else := "registry"

# 3. Licence. The registry is the source of truth, not the photo. A usable photo with no
#    number read is not a pass: nothing was verified (D-013).

licence_present if readable("DL")

licence_present if input.digilocker.DL == true

base_reasons contains r if {
	input.dl.status == "not_checked"
	licence_present
	r := reason("NUMBER_UNREADABLE", 300, "DL", null)
}

base_reasons contains r if {
	input.dl.status == "not_found"
	r := reason("DL_NOT_FOUND", 300, "DL", read_number("DL"))
}

# Valid through its last day.
licence_expired if {
	input.dl.status == "found"
	input.dl.record.validTill < input.today
}

base_reasons contains r if {
	licence_expired
	r := reason("DL_EXPIRED", 301, "DL", {"validTill": input.dl.record.validTill})
}

# A registry date that isn't a date proves nothing: a person should look (and it could never lapse).
base_reasons contains r if {
	input.dl.status == "found"
	not is_number(input.dl.daysLeft)
	r := reason("LOW_CONFIDENCE", 303, "DL", {"validTill": input.dl.record.validTill, "invariant": "licence date unreadable"})
}

licence_printed_mismatch if {
	input.dl.status == "found"
	readable("DL")
	input.names.licencePrinted == false
}

base_reasons contains r if {
	licence_printed_mismatch
	evidence := {"printed": input.readings.DL.fields.name, "registry": input.dl.record.name}
	r := reason("PRINTED_REGISTRY_MISMATCH", 302, "DL", evidence)
}

passed contains p if {
	input.dl.status == "found"
	is_number(input.dl.daysLeft)
	not licence_expired
	not licence_printed_mismatch
	record := input.dl.record
	p := check("DL_VALID", 2, {"number": record.number, "validTill": record.validTill, "source": source("DL")})
}

# 4. PAN.

pan_present if readable("PAN")

pan_present if input.digilocker.PAN == true

base_reasons contains r if {
	input.pan.status == "not_checked"
	pan_present
	r := reason("NUMBER_UNREADABLE", 400, "PAN", null)
}

base_reasons contains r if {
	input.pan.status == "not_found"
	r := reason("PAN_NOT_FOUND", 400, "PAN", read_number("PAN"))
}

pan_printed_mismatch if {
	input.pan.status == "found"
	readable("PAN")
	input.names.panPrinted == false
}

base_reasons contains r if {
	pan_printed_mismatch
	evidence := {"printed": input.readings.PAN.fields.name, "registry": input.pan.record.name}
	r := reason("PRINTED_REGISTRY_MISMATCH", 401, "PAN", evidence)
}

passed contains p if {
	input.pan.status == "found"
	not pan_printed_mismatch
	p := check("PAN_FOUND", 3, {"number": input.pan.record.number, "source": source("PAN")})
}

# 5. Licence and PAN must describe the same person.

both_ids if {
	input.dl.status == "found"
	input.pan.status == "found"
}

base_reasons contains r if {
	both_ids
	input.names.licenceVsPan == false
	r := reason("NAME_MISMATCH_IDS", 500, null, {"dl": input.dl.record.name, "pan": input.pan.record.name})
}

base_reasons contains r if {
	both_ids
	input.dl.record.dob != input.pan.record.dob
	r := reason("DOB_MISMATCH", 501, null, {"dl": input.dl.record.dob, "pan": input.pan.record.dob})
}

passed contains p if {
	both_ids
	input.names.licenceVsPan == true
	input.dl.record.dob == input.pan.record.dob
	p := check("SAME_PERSON", 4, {"name": input.dl.record.name, "dob": input.dl.record.dob})
}

# 6. Bank account: the driver's own, or their fleet owner's (D-007, D-017). Paying a hired driver
#    into the account of the owner they named needs three things, checked in this order:
#    the named person runs a fleet (question 2), has passed KYC (question 1), and has confirmed
#    this driver.

base_reasons contains r if {
	input.bank == null
	r := reason("BANK_NOT_VERIFIED", 600, "BANK_PROOF", null)
}

not_own_account if {
	input.bank != null
	input.names.bankVsIdentity == false
}

owners_account if {
	not_own_account
	input.driver.partnerType == "hired_driver"
	input.owner != null
	input.names.bankVsOwner == true
}

owner_block := "NOT_A_FLEET_OWNER" if {
	input.owner.partnerType != "fleet_owner"
} else := "OWNER_NOT_VERIFIED" if {
	input.ownerVerified != true
} else := "OWNER_LINK_UNVERIFIED" if {
	input.driver.ownerLinkVerified != true
}

owner_confirmed if input.driver.ownerLinkVerified == true

else := false

owner_is_verified_fleet_owner if {
	input.owner.partnerType == "fleet_owner"
	input.ownerVerified == true
} else := false

owners_account_flag if {
	owners_account
	not owner_block
} else := false

base_reasons contains r if {
	not_own_account
	not owners_account
	r := reason("BANK_NAME_MISMATCH", 601, "BANK_PROOF", {"holder": input.bank.holderName, "identity": input.identity})
}

# Question 2: a named "owner" who doesn't run a fleet is just someone else, so the driver is asked
# for an account in their own name. There's no fleet to confirm them.
base_reasons contains r if {
	owners_account
	owner_block == "NOT_A_FLEET_OWNER"
	evidence := {"holder": input.bank.holderName, "identity": input.identity, "namedOwner": input.owner.name, "namedOwnerIsFleetOwner": false}
	r := reason("BANK_NAME_MISMATCH", 601, "BANK_PROOF", evidence)
}

# Question 1: the owner must finish their own KYC before their account can pay anyone.
base_reasons contains r if {
	owners_account
	owner_block == "OWNER_NOT_VERIFIED"
	evidence := {"holder": input.bank.holderName, "owner": input.owner.name, "ownerConfirmedDriver": owner_confirmed}
	r := reason("OWNER_NOT_VERIFIED", 601, "BANK_PROOF", evidence)
}

base_reasons contains r if {
	owners_account
	owner_block == "OWNER_LINK_UNVERIFIED"
	evidence := {
		"holder": input.bank.holderName,
		"owner": input.owner.name,
		"ownerConfirmedDriver": owner_confirmed,
		"ownerIsVerifiedFleetOwner": owner_is_verified_fleet_owner,
	}
	r := reason("OWNER_LINK_UNVERIFIED", 601, "BANK_PROOF", evidence)
}

passbook_printed_mismatch if {
	input.bank != null
	readable("BANK_PROOF")
	input.names.passbookVsBank == false
}

base_reasons contains r if {
	passbook_printed_mismatch
	evidence := {"printed": input.readings.BANK_PROOF.fields.holderName, "registry": input.bank.holderName}
	r := reason("PRINTED_REGISTRY_MISMATCH", 602, "BANK_PROOF", evidence)
}

# Positive evidence: the account is the driver's own, or a vouched-for fleet owner's.
account_holder_ok if input.names.bankVsIdentity == true

account_holder_ok if {
	owners_account
	not owner_block
}

passed contains p if {
	input.bank != null
	account_holder_ok
	not passbook_printed_mismatch
	evidence := {"holder": input.bank.holderName, "accountLast4": input.bank.accountLast4, "ownersAccount": owners_account_flag}
	p := check("BANK_VERIFIED", 5, evidence)
}

# 7. Selfie vs licence photo (a SIMULATED check in this project).

base_reasons contains r if {
	input.face == "no_match"
	r := reason("FACE_MISMATCH", 700, null, null)
}

base_reasons contains r if {
	input.face == "not_checked"
	r := reason("SELFIE_MISSING", 700, null, null)
}

passed contains p if {
	input.face == "match"
	p := check("FACE_MATCH", 6, {})
}

# 8. Trust graph: one account shared with drivers who have no link to its holder.
#    A real fleet (the owner plus drivers who name that owner) is fine; strangers are not.

base_reasons contains r if {
	shared := input.sharedBankAccount
	shared != null
	some s in shared.sharers
	not s.isHolder
	not s.claimsHolderAsOwner
	evidence := {"accountId": shared.accountId, "holder": shared.holderName, "sharers": [x.name | some x in shared.sharers]}
	r := reason("SHARED_BANK_ACCOUNT", 800, "BANK_PROOF", evidence)
}

#    Only an answer from the graph counts as "no shared account". When the graph couldn't be asked
#    (Neo4j unreachable or paused), the check didn't run, so a person decides (D-039, policy v5).

base_reasons contains r if {
	object.get(input, "graphStatus", "unavailable") != "ok"
	r := reason("GRAPH_UNAVAILABLE", 810, "BANK_PROOF", null)
}

# 9. Don't loop an honest driver: the same fix asked for twice already goes to a person.

times_asked(code) := count([asked | some asked in input.priorFixReasons; code in asked])

repeat_candidates := {r |
	some r in base_reasons
	r.severity == "fix"
	times_asked(r.code) >= config.max_fix_requests
}

repeated contains x if {
	first := min({r.rank | some r in repeat_candidates})
	some r in repeat_candidates
	r.rank == first
	x := reason("REPEATED_FIX", 900, r.doc, {"code": r.code, "timesAsked": times_asked(r.code)})
}

found_reasons := base_reasons | repeated

# 10. Fail closed. Approval needs positive evidence from every check, not just an absence of
#     problems (D-013).

core_checks := ["DL_VALID", "PAN_FOUND", "SAME_PERSON", "BANK_VERIFIED", "FACE_MATCH"]

approvable if {
	count(found_reasons) == 0
	every c in core_checks {
		some p in passed
		p.check == c
	}
}

invariant contains r if {
	count(found_reasons) == 0
	not approvable
	r := reason("LOW_CONFIDENCE", 1000, null, {"invariant": "approval without full evidence"})
}

all_reasons := found_reasons | invariant

# ---------------------------------------------------------------------------------------------
# Notices: what a person should know about a decision that doesn't change its outcome.

# Question 3: a licence valid through its last day is valid, with no minimum. But inside the
# warning window the driver gets a renewal reminder, and ops sees it coming.
notices contains n if {
	input.dl.status == "found"
	not licence_expired
	is_number(input.dl.daysLeft)
	input.dl.daysLeft <= config.renew_warning_days
	n := {"code": "LICENCE_EXPIRES_SOON", "evidence": {"validTill": input.dl.record.validTill, "daysLeft": input.dl.daysLeft}}
}

owner_link_complete if {
	input.owner.partnerType == "fleet_owner"
	input.ownerVerified == true
	input.driver.ownerLinkVerified == true
}

# Question 7: a hired driver paid into their own account is approved, but ops should see that the
# link to the fleet owner they named isn't verified (not confirmed, or the owner hasn't passed KYC).
notices contains n if {
	input.driver.partnerType == "hired_driver"
	input.owner != null
	input.names.bankVsIdentity == true
	not owner_link_complete
	evidence := {"owner": input.owner.name, "ownerConfirmedDriver": owner_confirmed, "ownerIsVerifiedFleetOwner": owner_is_verified_fleet_owner}
	n := {"code": "OWNER_LINK_UNCONFIRMED", "evidence": evidence}
}

# For approved drivers, over time. Input: {"daysLeft": n}, 0 on the licence's last valid day.
renewal_due if {
	is_number(input.daysLeft)
	input.daysLeft >= 0
	input.daysLeft <= config.renew_warning_days
} else := false

# Question 9: the licence lapses the day after its last valid day. The app then locks the driver's
# bookings until a renewed licence passes the rules.
licence_lapsed if {
	is_number(input.daysLeft)
	input.daysLeft < 0
} else := false

renewal := {"due": renewal_due, "expired": licence_lapsed}

# Review outranks fix: if anything needs a person, a person gets it (D-010).
outcome := "REVIEW" if {
	some r in all_reasons
	r.severity == "review"
} else := "NEEDS_FIX" if {
	count(all_reasons) > 0
} else := "APPROVE"

decision := {
	"version": version,
	"outcome": outcome,
	"reasons": all_reasons,
	"passed": passed,
	"notices": notices,
}
