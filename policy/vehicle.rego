# The vehicle policy (D-049): may this vehicle carry this driver's loads? A decision of its own, apart
# from the driver's KYC, and bookings wait for its approval. The app gathers the facts (the registry's
# record for the number the driver typed, whether its owner is the driver or the driver's fleet owner,
# the owner link); these rules decide. There is no review here: anything short of an approval is a fix
# the driver can make, and nothing is approved without positive evidence from every check.
package vehicle

import rego.v1

version := "v1"

config := {"goods_classes": {"LGV", "MGV", "HGV", "GOODS"}}

# Every reason is a fix, with the rank that orders them for the driver.
reason(code, rank, evidence) := {"code": code, "rank": rank, "evidence": evidence}

check(code, rank, evidence) := {"check": code, "rank": rank, "evidence": evidence, "simulated": input.registrySimulated}

found if input.vehicle.status == "found"

record := input.vehicle.record if found

goods if record.vehicleClass in config.goods_classes

valid if record.registeredTill >= input.today

# A hired driver's vehicle may be the fleet owner's, once the owner is verified and has confirmed them.
fleet_vehicle if {
	input.driver.partnerType == "hired_driver"
	input.owner.matchesFleetOwner == true
}

owner_link_complete if {
	input.driver.ownerLinkVerified == true
	input.ownerVerified == true
}

owner_ok if input.owner.matchesDriver == true

owner_ok if {
	fleet_vehicle
	owner_link_complete
}

reasons contains reason("VEHICLE_NOT_FOUND", 100, {"number": input.vehicle.number}) if not found

reasons contains reason("VEHICLE_NOT_GOODS", 200, {"vehicleClass": record.vehicleClass}) if {
	found
	not goods
}

reasons contains reason("VEHICLE_REGISTRATION_EXPIRED", 300, {"registeredTill": record.registeredTill}) if {
	found
	not valid
}

# The fleet owner must be verified themselves, then have confirmed this driver, as for a shared bank
# account in KYC (OWNER_NOT_VERIFIED before OWNER_LINK_UNVERIFIED).
reasons contains reason("VEHICLE_OWNER_NOT_VERIFIED", 400, {"owner": record.ownerName}) if {
	found
	not input.owner.matchesDriver == true
	fleet_vehicle
	not input.ownerVerified == true
}

reasons contains reason("VEHICLE_OWNER_LINK_UNVERIFIED", 405, {"owner": record.ownerName}) if {
	found
	not input.owner.matchesDriver == true
	fleet_vehicle
	input.ownerVerified == true
	not input.driver.ownerLinkVerified == true
}

reasons contains reason("VEHICLE_OWNER_MISMATCH", 410, {"owner": record.ownerName}) if {
	found
	not input.owner.matchesDriver == true
	not fleet_vehicle
}

passed contains check("VEHICLE_FOUND", 1, {"number": record.number}) if found

passed contains check("VEHICLE_OWNER", 2, {"owner": record.ownerName, "via": via}) if {
	found
	owner_ok
	via := owner_via
}

owner_via := "driver" if input.owner.matchesDriver == true

else := "fleet owner"

passed contains check("VEHICLE_GOODS", 3, {"vehicleClass": record.vehicleClass}) if {
	found
	goods
}

passed contains check("VEHICLE_VALID", 4, {"registeredTill": record.registeredTill}) if {
	found
	valid
}

all_checks := {"VEHICLE_FOUND", "VEHICLE_OWNER", "VEHICLE_GOODS", "VEHICLE_VALID"}

approvable if {
	count(reasons) == 0
	{p.check | some p in passed} == all_checks
}

outcome := "APPROVE" if approvable

else := "NEEDS_FIX"

decision := {
	"version": version,
	"outcome": outcome,
	"reasons": [r | some r in reasons],
	"passed": [p | some p in passed],
}
