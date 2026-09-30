package vehicle_test

import data.vehicle
import rego.v1

own := {
	"today": "2026-09-30",
	"registrySimulated": true,
	"vehicle": {"number": "KA05MN4821", "status": "found", "record": {"number": "KA05MN4821", "ownerName": "RAMESH KUMAR", "vehicleClass": "LGV", "registeredTill": "2034-06-30"}},
	"owner": {"matchesDriver": true, "matchesFleetOwner": null},
	"driver": {"partnerType": "owner_driver", "ownerLinkVerified": false},
	"ownerVerified": false,
}

fleet := object.union(own, {
	"vehicle": {"number": "KA04RN9902", "status": "found", "record": {"number": "KA04RN9902", "ownerName": "RAJU NAIK", "vehicleClass": "LGV", "registeredTill": "2033-01-01"}},
	"owner": {"matchesDriver": false, "matchesFleetOwner": true},
	"driver": {"partnerType": "hired_driver", "ownerLinkVerified": true},
	"ownerVerified": true,
})

codes(d) := {r.code | some r in d.reasons}

test_the_drivers_own_goods_vehicle_is_approved if {
	d := vehicle.decision with input as own
	d.outcome == "APPROVE"
	d.version == "v1"
	{p.check | some p in d.passed} == {"VEHICLE_FOUND", "VEHICLE_OWNER", "VEHICLE_GOODS", "VEHICLE_VALID"}
}

test_a_hired_driver_may_drive_the_confirmed_owners_vehicle if {
	d := vehicle.decision with input as fleet
	d.outcome == "APPROVE"
	some p in d.passed
	p.check == "VEHICLE_OWNER"
	p.evidence.via == "fleet owner"
}

test_until_the_owner_confirms_them_it_is_a_fix if {
	d := vehicle.decision with input as object.union(fleet, {"driver": {"partnerType": "hired_driver", "ownerLinkVerified": false}})
	d.outcome == "NEEDS_FIX"
	codes(d) == {"VEHICLE_OWNER_LINK_UNVERIFIED"}
}

test_until_the_owner_is_verified_it_is_a_fix_that_says_so if {
	d := vehicle.decision with input as object.union(fleet, {"ownerVerified": false})
	d.outcome == "NEEDS_FIX"
	codes(d) == {"VEHICLE_OWNER_NOT_VERIFIED"}
}

test_someone_elses_vehicle_is_never_approved if {
	d := vehicle.decision with input as object.union(own, {"owner": {"matchesDriver": false, "matchesFleetOwner": null}})
	d.outcome == "NEEDS_FIX"
	codes(d) == {"VEHICLE_OWNER_MISMATCH"}
}

test_an_owner_drivers_vehicle_in_another_name_is_a_mismatch_even_if_it_matches_a_fleet_owner if {
	d := vehicle.decision with input as object.union(own, {"owner": {"matchesDriver": false, "matchesFleetOwner": true}})
	codes(d) == {"VEHICLE_OWNER_MISMATCH"}
}

test_an_unknown_number_is_a_fix if {
	d := vehicle.decision with input as object.union(own, {"vehicle": {"number": "KA99ZZ0000", "status": "not_found", "record": null}})
	d.outcome == "NEEDS_FIX"
	codes(d) == {"VEHICLE_NOT_FOUND"}
	count(d.passed) == 0
}

test_a_car_cannot_carry_loads if {
	d := vehicle.decision with input as object.union(own, {"vehicle": object.union(own.vehicle, {"record": object.union(own.vehicle.record, {"vehicleClass": "LMV"})})})
	codes(d) == {"VEHICLE_NOT_GOODS"}
}

test_an_expired_registration_is_a_fix if {
	d := vehicle.decision with input as object.union(own, {"vehicle": object.union(own.vehicle, {"record": object.union(own.vehicle.record, {"registeredTill": "2026-09-29"})})})
	codes(d) == {"VEHICLE_REGISTRATION_EXPIRED"}
}

test_the_last_valid_day_still_counts if {
	d := vehicle.decision with input as object.union(own, {"vehicle": object.union(own.vehicle, {"record": object.union(own.vehicle.record, {"registeredTill": "2026-09-30"})})})
	d.outcome == "APPROVE"
}
